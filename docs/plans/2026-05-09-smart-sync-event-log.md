# Smart Sync Event Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade POS sync from always-pull/always-push reconciliation into a smart, low-read/write sync system with compact change tracking, skip decisions, cleanup retention, and full-resync fallback.

**Architecture:** Keep the current row-state tables as the source of truth, but add a compact sync outbox on the POS app and a compact sync event/watermark layer on the API. The client first checks local dirty state and server cursor status, then chooses skip, push-only, pull-only, or full sync. Server event history is short-lived and cleaned by a scheduled job; old offline devices fall back to full resync when their cursor is older than retained history.

**Tech Stack:** TypeScript, Drizzle ORM, Elysia, Bun test, Solid/Vitest, Rust/sqlx, Tauri, SQLite/Turso

---

## Design Summary

The current implementation tracks local dirtiness with `is_synced`, remote changes with `updated_at > since`, and local pull position with `sync_meta.last_sync_at`. This works as a basic incremental sync model after the `since` bug is fixed, but it still performs unnecessary network/database work and gives confusing UI results such as repeatedly receiving baseline rows.

The upgraded strategy separates change detection from data transfer:

```text
manual/startup sync
-> count local pending changes from sync_outbox
-> ask API for sync status after local cursor
-> no local changes + no server changes = skip sync
-> local changes + no server changes = push only
-> no local changes + server changes = pull only
-> both changed = full sync
```

Storage stays small by using compact metadata events, coalescing local changes per row, deleting synced local outbox rows, retaining server events only for a bounded window, and requiring full resync if a device is offline longer than the event retention window.

---

## Target Data Model

### Local POS DB

Add `sync_outbox`:

```typescript
export const syncOutbox = sqliteTable("sync_outbox", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	tableName: text("table_name").notNull(),
	rowId: text("row_id").notNull(),
	operation: text("operation", { enum: ["insert", "update", "delete"] }).notNull(),
	scopeType: text("scope_type", { enum: ["merchant", "outlet"] }).notNull(),
	scopeId: text("scope_id").notNull(),
	changedAt: text("changed_at").notNull(),
	syncedAt: text("synced_at"),
});
```

Add `sync_cursors`:

```typescript
export const syncCursors = sqliteTable("sync_cursors", {
	scopeType: text("scope_type", { enum: ["merchant", "outlet"] }).notNull(),
	scopeId: text("scope_id").notNull(),
	lastServerEventId: integer("last_server_event_id").notNull().default(0),
	lastServerWatermark: text("last_server_watermark"),
	updatedAt: text("updated_at").notNull(),
});
```

Keep `is_synced` during migration for compatibility. The outbox becomes the source of truth for future smart sync decisions. Soft-deleted rows stay in their source tables until the matching delete event is synced.

### API DB

Add `sync_events`:

```typescript
export const syncEvents = sqliteTable("sync_events", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	scopeType: text("scope_type", { enum: ["merchant", "outlet"] }).notNull(),
	scopeId: text("scope_id").notNull(),
	tableName: text("table_name").notNull(),
	rowId: text("row_id").notNull(),
	operation: text("operation", { enum: ["insert", "update", "delete"] }).notNull(),
	changedAt: text("changed_at").notNull(),
});
```

Do not store full payload in `sync_events` for the first version. When clients pull events, the API fetches current row snapshots from source tables. Delete events use soft-deleted source rows until retention expires.

---

## Task 1: Fix Current `since` Calculation Before Adding Smart Sync

**Files:**
- Test: `apps/pos-app/src-tauri/src/sync.rs`
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Write the failing test**

Add Rust unit tests for choosing the pull cursor. Extract the calculation into a pure helper first in the test module only as the intended API:

```rust
#[test]
fn chooses_oldest_existing_last_sync_timestamp() {
    let timestamps = vec![
        Some("2026-05-09T11:10:00.000Z".to_string()),
        Some("2026-05-09T11:05:00.000Z".to_string()),
        Some("2026-05-09T11:08:00.000Z".to_string()),
    ];

    assert_eq!(
        choose_pull_since(timestamps),
        "2026-05-09T11:05:00.000Z"
    );
}

#[test]
fn falls_back_to_epoch_when_no_table_has_synced() {
    assert_eq!(
        choose_pull_since(vec![None, None]),
        "1970-01-01T00:00:00.000Z"
    );
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test sync::tests::chooses_oldest_existing_last_sync_timestamp
```

Expected: FAIL because `choose_pull_since` does not exist.

**Step 3: Write minimal implementation**

Add a helper near `get_last_sync_at`:

```rust
fn choose_pull_since(timestamps: Vec<Option<String>>) -> String {
    timestamps
        .into_iter()
        .flatten()
        .min()
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string())
}
```

Use it in `sync_pull_inner` instead of the current `earliest_since` comparison that never moves past 1970:

```rust
let mut timestamps = Vec::new();
for table in SYNC_TABLES {
    timestamps.push(get_last_sync_at(pool, table, outlet_id).await.unwrap_or(None));
}
let since = choose_pull_since(timestamps);
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test sync::tests::chooses_oldest_existing_last_sync_timestamp sync::tests::falls_back_to_epoch_when_no_table_has_synced
```

Expected: PASS.

**Step 5: Run formatting**

Run:

```bash
cd apps/pos-app/src-tauri && cargo fmt --check
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs
git commit -m "fix: use stored sync cursor for pull"
```

---

## Task 2: Add Local Compact Sync Outbox Schema

**Files:**
- Modify: `packages/database/src/local-schema.ts`
- Create: `apps/pos-app/drizzle/<generated>_sync_outbox.sql`
- Modify: `apps/pos-app/src-tauri/src/drizzle_proxy.rs`

**Step 1: Write the failing schema test**

Add or extend a local schema test that imports `syncOutbox` and `syncCursors`:

```typescript
import { describe, expect, test } from "vitest";
import { syncCursors, syncOutbox } from "@repo/database/local-schema";

describe("local smart sync schema", () => {
	test("defines compact outbox and cursor tables", () => {
		expect(syncOutbox.tableName).toBe("sync_outbox");
		expect(syncCursors.tableName).toBe("sync_cursors");
	});
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun run test src/db/__test__/sync-schema.test.ts
```

Expected: FAIL because the exports do not exist.

**Step 3: Add schema**

Add `syncOutbox` and `syncCursors` to `packages/database/src/local-schema.ts` using the definitions in the Target Data Model section.

**Step 4: Generate local migration**

Run:

```bash
cd apps/pos-app && bunx drizzle-kit generate
```

Expected: New SQL migration creating `sync_outbox` and `sync_cursors`.

**Step 5: Register migration**

Add the generated migration to `apps/pos-app/src-tauri/src/drizzle_proxy.rs`.

**Step 6: Run tests and typecheck**

Run:

```bash
cd apps/pos-app && bun run test src/db/__test__/sync-schema.test.ts
cd apps/pos-app && bun run check-types
```

Expected: PASS.

**Step 7: Commit**

```bash
git add packages/database/src/local-schema.ts apps/pos-app/drizzle/ apps/pos-app/src-tauri/src/drizzle_proxy.rs apps/pos-app/src/db/__test__/sync-schema.test.ts
git commit -m "feat: add local sync outbox schema"
```

---

## Task 3: Add API Sync Events Schema

**Files:**
- Modify: `packages/database/src/api-schema.ts`
- Create: `apps/api/drizzle/<generated>_sync_events.sql`
- Test: `apps/api/src/__test__/sync-events-schema.test.ts`

**Step 1: Write the failing schema test**

```typescript
import { describe, expect, test } from "bun:test";
import { syncEvents } from "@repo/database/api-schema";

describe("api smart sync schema", () => {
	test("defines compact sync events table", () => {
		expect(syncEvents).toBeDefined();
	});
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api && bun test src/__test__/sync-events-schema.test.ts
```

Expected: FAIL because `syncEvents` is not exported.

**Step 3: Add schema**

Add `syncEvents` to `packages/database/src/api-schema.ts` using the Target Data Model section. Keep payload out of the table.

**Step 4: Generate API migration**

Run:

```bash
cd apps/api && bunx drizzle-kit generate
```

Expected: New SQL migration creating `sync_events`.

**Step 5: Run tests and typecheck**

Run:

```bash
cd apps/api && bun test src/__test__/sync-events-schema.test.ts
cd apps/api && bun run check-types
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/database/src/api-schema.ts apps/api/drizzle/ apps/api/src/__test__/sync-events-schema.test.ts
git commit -m "feat: add API sync events schema"
```

---

## Task 4: Implement Local Outbox Recording With Coalescing

**Files:**
- Create: `apps/pos-app/src/db/sync-outbox.ts`
- Test: `apps/pos-app/src/db/__test__/sync-outbox.test.ts`
- Modify: `apps/pos-app/src/db/menu.ts`
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/db/staff.ts`
- Modify as needed: other local write modules that set `isSynced: false`

**Step 1: Write failing tests for outbox coalescing**

```typescript
describe("recordLocalChange", () => {
	test("coalesces multiple updates for the same row into one latest event", async () => {
		await recordLocalChange({
			tableName: "products",
			rowId: "prod-1",
			operation: "update",
			scopeType: "merchant",
			scopeId: "merchant-1",
		});

		await recordLocalChange({
			tableName: "products",
			rowId: "prod-1",
			operation: "update",
			scopeType: "merchant",
			scopeId: "merchant-1",
		});

		const rows = await listPendingOutbox("merchant", "merchant-1");
		expect(rows).toHaveLength(1);
		expect(rows[0].operation).toBe("update");
	});

	test("removes unsynced insert when same row is deleted before sync", async () => {
		await recordLocalChange({
			tableName: "products",
			rowId: "prod-1",
			operation: "insert",
			scopeType: "merchant",
			scopeId: "merchant-1",
		});

		await recordLocalChange({
			tableName: "products",
			rowId: "prod-1",
			operation: "delete",
			scopeType: "merchant",
			scopeId: "merchant-1",
		});

		expect(await listPendingOutbox("merchant", "merchant-1")).toHaveLength(0);
	});

	test("delete overrides pending update for existing server row", async () => {
		await recordLocalChange({
			tableName: "products",
			rowId: "prod-1",
			operation: "update",
			scopeType: "merchant",
			scopeId: "merchant-1",
		});

		await recordLocalChange({
			tableName: "products",
			rowId: "prod-1",
			operation: "delete",
			scopeType: "merchant",
			scopeId: "merchant-1",
		});

		const rows = await listPendingOutbox("merchant", "merchant-1");
		expect(rows).toHaveLength(1);
		expect(rows[0].operation).toBe("delete");
	});
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/pos-app && bun run test src/db/__test__/sync-outbox.test.ts
```

Expected: FAIL because `recordLocalChange` does not exist.

**Step 3: Implement outbox helpers**

Create helpers:

```typescript
export async function recordLocalChange(input: LocalChangeInput): Promise<void>;
export async function listPendingOutbox(scopeType: SyncScopeType, scopeId: string): Promise<SyncOutboxRow[]>;
export async function markOutboxSynced(ids: string[], syncedAt: string): Promise<void>;
export async function purgeSyncedOutboxBefore(cutoffIso: string): Promise<number>;
```

Rules:
- Same `tableName + rowId + syncedAt IS NULL` is one pending event.
- Pending `insert` followed by `update` stays `insert`.
- Pending `insert` followed by `delete` is removed.
- Pending `update` followed by `delete` becomes `delete`.
- Pending `delete` followed by `update` should remain `delete` unless the UI explicitly supports restore.

**Step 4: Wire write modules**

Where code currently sets `isSynced: false`, also call `recordLocalChange`.

Start with known write paths:
- `apps/pos-app/src/db/menu.ts`
- `apps/pos-app/src/db/orders.ts`
- `apps/pos-app/src/db/staff.ts`
- `apps/pos-app/src/lib/auth-provider.ts`

Do not remove `isSynced` yet.

**Step 5: Run focused tests**

Run:

```bash
cd apps/pos-app && bun run test src/db/__test__/sync-outbox.test.ts src/db/__test__/menu.test.ts src/db/__test__/orders.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src/db/sync-outbox.ts apps/pos-app/src/db/__test__/sync-outbox.test.ts apps/pos-app/src/db/menu.ts apps/pos-app/src/db/orders.ts apps/pos-app/src/db/staff.ts apps/pos-app/src/lib/auth-provider.ts
git commit -m "feat: record compact local sync outbox changes"
```

---

## Task 5: Add API Event Recording on Mutations and Push

**Files:**
- Modify: `apps/api/src/lib/sync.ts`
- Create: `apps/api/src/lib/sync-events.ts`
- Test: `apps/api/src/__test__/sync-events.test.ts`
- Modify as needed: `apps/api/src/routes/merchants.ts`, `apps/api/src/routes/outlets.ts`, `apps/api/src/routes/registers.ts`, `apps/api/src/routes/staff.ts`

**Step 1: Write failing tests for event recording**

```typescript
describe("recordSyncEvent", () => {
	test("records compact metadata without payload", async () => {
		await recordSyncEvent({
			scopeType: "merchant",
			scopeId: "merchant-1",
			tableName: "products",
			rowId: "prod-1",
			operation: "update",
			changedAt: "2026-05-09T12:00:00.000Z",
		});

		expect(mockInsert).toHaveBeenCalled();
		expect(JSON.stringify(mockInsert.mock.calls)).not.toContain("payload");
	});
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/api && bun test src/__test__/sync-events.test.ts
```

Expected: FAIL because `recordSyncEvent` does not exist.

**Step 3: Implement event helper**

Create `apps/api/src/lib/sync-events.ts`:

```typescript
export async function recordSyncEvent(input: SyncEventInput): Promise<void>;
export async function getLatestEventIdForScope(scopeType: SyncScopeType, scopeId: string): Promise<number>;
export async function getOldestEventIdForScope(scopeType: SyncScopeType, scopeId: string): Promise<number | null>;
```

**Step 4: Record events from sync push**

In `handlePush`, after each accepted insert/update/delete, write one `sync_events` row. Use merchant scope for merchant-scoped tables and outlet scope for outlet-scoped tables.

**Step 5: Record events from direct API writes**

For cloud-originating writes outside `/api/sync/push`, record events too. This prevents manual cloud admin/API edits from being invisible to POS devices.

**Step 6: Run API tests**

Run:

```bash
cd apps/api && bun test src/__test__/sync.test.ts src/__test__/sync-events.test.ts
cd apps/api && bun run check-types
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/lib/sync.ts apps/api/src/lib/sync-events.ts apps/api/src/__test__/sync-events.test.ts apps/api/src/routes/
git commit -m "feat: record sync events for server changes"
```

---

## Task 6: Add API Sync Status Endpoint

**Files:**
- Modify: `apps/api/src/routes/sync.ts`
- Modify: `apps/api/src/lib/sync.ts`
- Test: `apps/api/src/__test__/sync.test.ts`

**Step 1: Write failing tests**

Add tests for:

```typescript
test("status returns hasChanges false when cursor equals latest event", async () => {
	const result = await handleSyncStatus({
		outletId: "outlet-1",
		merchantId: "merchant-1",
		lastServerEventId: 10,
	});

	expect(result).toEqual({
		hasChanges: false,
		latestEventId: 10,
		oldestAvailableEventId: 1,
		needsFullResync: false,
		changedTables: [],
	});
});

test("status requires full resync when cursor is older than retained history", async () => {
	const result = await handleSyncStatus({
		outletId: "outlet-1",
		merchantId: "merchant-1",
		lastServerEventId: 5,
	});

	expect(result.needsFullResync).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/api && bun test src/__test__/sync.test.ts
```

Expected: FAIL because `handleSyncStatus` does not exist.

**Step 3: Implement handler**

Add:

```typescript
export async function handleSyncStatus(input: SyncStatusInput): Promise<SyncStatusResult>;
```

Response shape:

```typescript
interface SyncStatusResult {
	hasChanges: boolean;
	latestEventId: number;
	oldestAvailableEventId: number | null;
	needsFullResync: boolean;
	changedTables: string[];
}
```

Rules:
- `hasChanges = latestEventId > lastServerEventId`.
- `needsFullResync = oldestAvailableEventId !== null && lastServerEventId > 0 && lastServerEventId < oldestAvailableEventId`.
- If `needsFullResync`, client must ignore event replay and perform snapshot pull.

**Step 4: Add route**

Add:

```http
GET /api/sync/status?outletId=...&lastServerEventId=...
```

Use existing outlet access verification.

**Step 5: Run API tests**

Run:

```bash
cd apps/api && bun test src/__test__/sync.test.ts
cd apps/api && bun run check-types
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/routes/sync.ts apps/api/src/lib/sync.ts apps/api/src/__test__/sync.test.ts
git commit -m "feat: add sync status preflight endpoint"
```

---

## Task 7: Add Event-Based Pull With Snapshot Fallback

**Files:**
- Modify: `apps/api/src/lib/sync.ts`
- Modify: `apps/api/src/routes/sync.ts`
- Test: `apps/api/src/__test__/sync.test.ts`

**Step 1: Write failing tests**

Add tests for:
- Pull after cursor returns only rows referenced by events after cursor.
- Multiple events for same row return one latest row snapshot.
- Delete event returns soft-deleted row snapshot while retained.
- Expired cursor returns `needsFullResync`.

Example:

```typescript
test("event pull coalesces repeated row events into one snapshot", async () => {
	const result = await handleEventPull({
		outletId: "outlet-1",
		merchantId: "merchant-1",
		afterEventId: 10,
	});

	expect(result.latestEventId).toBe(12);
	expect(result.products).toHaveLength(1);
	expect(result.products[0].id).toBe("prod-1");
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/api && bun test src/__test__/sync.test.ts
```

Expected: FAIL because event pull does not exist.

**Step 3: Implement event pull**

Add:

```typescript
export async function handleEventPull(input: EventPullInput): Promise<EventPullResult>;
```

Implementation:
- Read `sync_events` after `afterEventId` for merchant and outlet scopes.
- Group by `tableName + rowId`.
- Fetch current row snapshots by table.
- Include `latestEventId`.
- If cursor is expired, return `needsFullResync: true`.

**Step 4: Keep old snapshot pull**

Keep existing `handlePull` as full snapshot/incremental fallback during rollout.

**Step 5: Run API tests**

Run:

```bash
cd apps/api && bun test src/__test__/sync.test.ts
cd apps/api && bun run check-types
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/lib/sync.ts apps/api/src/routes/sync.ts apps/api/src/__test__/sync.test.ts
git commit -m "feat: add event-based sync pull"
```

---

## Task 8: Add Smart Sync Decision Logic in POS Store

**Files:**
- Modify: `apps/pos-app/src/store/sync.ts`
- Test: `apps/pos-app/src/store/__test__/sync.test.ts`
- Modify: `apps/pos-app/src/lib/cloud-auth.ts` or create `apps/pos-app/src/lib/sync-api.ts`

**Step 1: Write failing tests**

Add tests for smart decisions:

```typescript
test("skips native sync when local and server have no changes", async () => {
	mockInvoke.mockResolvedValueOnce({
		local_dirty_count: 0,
		last_server_event_id: 10,
	});
	mockFetchSyncStatus.mockResolvedValue({
		hasChanges: false,
		latestEventId: 10,
		needsFullResync: false,
		changedTables: [],
	});

	const result = await syncNow();

	expect(result.mode).toBe("skipped");
	expect(mockInvoke).not.toHaveBeenCalledWith("sync_now", expect.anything());
});

test("runs push only when local has changes and server has none", async () => {
	// Assert sync_push or smart_sync push mode is invoked.
});

test("runs pull only when server has changes and local has none", async () => {
	// Assert event pull/native pull path is invoked.
});

test("runs full sync when both sides have changes", async () => {
	// Assert full sync path is invoked.
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/pos-app && bun run test src/store/__test__/sync.test.ts
```

Expected: FAIL because `syncNow` always invokes `sync_now`.

**Step 3: Add status client**

Add API client method:

```typescript
export async function getSyncStatus(input: {
	outletId: string;
	lastServerEventId: number;
}): Promise<SyncStatusResult>;
```

**Step 4: Add native local dirty command**

If needed, add Tauri command:

```rust
#[command]
pub async fn get_sync_local_state(outlet_id: String, state: State<'_, AppState>) -> Result<LocalSyncState, String>
```

It should count pending `sync_outbox` rows and read `sync_cursors`.

**Step 5: Implement decision logic**

Return richer result:

```typescript
type SyncMode = "skipped" | "push_only" | "pull_only" | "full";
```

Preserve existing result fields so current UI does not break.

**Step 6: Run POS tests**

Run:

```bash
cd apps/pos-app && bun run test src/store/__test__/sync.test.ts
cd apps/pos-app && bun run check-types
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts apps/pos-app/src/lib/
git commit -m "feat: choose smart sync mode before transfer"
```

---

## Task 9: Add Native Smart Sync Commands

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Test: Rust unit tests in `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Write failing tests for local state**

Add Rust tests for:
- Counts unsynced outbox rows by scope.
- Reads and writes server event cursor.
- Purges synced outbox rows older than cutoff.

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test sync::tests::counts_pending_outbox_rows
```

Expected: FAIL because helper does not exist.

**Step 3: Implement commands**

Add:

```rust
#[command]
pub async fn get_sync_local_state(...)

#[command]
pub async fn sync_push_outbox(...)

#[command]
pub async fn sync_pull_events(...)

#[command]
pub async fn sync_full_resync(...)

#[command]
pub async fn purge_synced_outbox(...)
```

Rules:
- `sync_push_outbox` sends pending outbox row identities, not full history.
- For update/insert payloads, read latest row snapshot from source table at push time.
- For soft deletes, include row snapshot with `deleted_at`.
- On success, mark source rows `is_synced = 1` and mark/delete outbox entries.
- On event pull success, update `sync_cursors.last_server_event_id`.

**Step 4: Register commands**

Add commands to `apps/pos-app/src-tauri/src/lib.rs`.

**Step 5: Run Rust checks**

Run:

```bash
cd apps/pos-app/src-tauri && cargo fmt --check
cd apps/pos-app/src-tauri && cargo test sync
```

Expected: PASS. If `cargo test` fails because Android linker/toolchain is unavailable, record the exact error and run available unit tests in the host target.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat: add native smart sync commands"
```

---

## Task 10: Update Settings UI Messages

**Files:**
- Modify: `apps/pos-app/src/pages/settings.tsx`
- Test: `apps/pos-app/src/pages/__test__/settings.test.tsx`

**Step 1: Write failing UI tests**

Add tests for:
- `mode: "skipped"` shows `Data sudah terbaru`.
- `mode: "pull_only"` shows received count.
- `mode: "push_only"` shows sent count.
- `mode: "full"` shows both sent/received count.

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/pos-app && bun run test src/pages/__test__/settings.test.tsx
```

Expected: FAIL because current toast only shows `diterima` and `dibersihkan`.

**Step 3: Implement message helper**

Create a pure helper inside `settings.tsx` or `src/store/sync.ts`:

```typescript
export function formatSyncSuccessMessage(result: SyncNowResult): string {
	if (result.mode === "skipped") return "Data sudah terbaru";
	if (result.mode === "push_only") return `Sinkronisasi berhasil (${result.push.rows_sent} dikirim)`;
	if (result.mode === "pull_only") return `Sinkronisasi berhasil (${result.pull.rows_received} diterima)`;
	return `Sinkronisasi berhasil (${result.pull.rows_received} diterima, ${result.push.rows_sent} dikirim, ${result.purged} dibersihkan)`;
}
```

**Step 4: Run UI tests**

Run:

```bash
cd apps/pos-app && bun run test src/pages/__test__/settings.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/settings.tsx apps/pos-app/src/pages/__test__/settings.test.tsx
git commit -m "feat: show smart sync outcomes in settings"
```

---

## Task 11: Add Server Cleanup Job

**Files:**
- Create: `apps/api/src/lib/sync-cleanup.ts`
- Test: `apps/api/src/__test__/sync-cleanup.test.ts`
- Modify: `apps/api/src/index.ts` or Cloudflare Worker scheduled handler if available
- Modify: `apps/api/package.json` if a manual cleanup script is needed

**Step 1: Write failing cleanup tests**

```typescript
describe("cleanupSyncHistory", () => {
	test("deletes sync events older than retention window", async () => {
		const result = await cleanupSyncHistory({
			now: new Date("2026-05-09T12:00:00.000Z"),
			retentionDays: 30,
		});

		expect(result.deletedEvents).toBeGreaterThanOrEqual(0);
		expect(mockDelete).toHaveBeenCalled();
	});

	test("does not hard-delete orders during sync cleanup", async () => {
		await cleanupSyncHistory({
			now: new Date("2026-05-09T12:00:00.000Z"),
			retentionDays: 30,
		});

		expect(JSON.stringify(mockDelete.mock.calls)).not.toContain("orders");
	});
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/api && bun test src/__test__/sync-cleanup.test.ts
```

Expected: FAIL because cleanup does not exist.

**Step 3: Implement cleanup**

Add:

```typescript
export async function cleanupSyncHistory(input: {
	now: Date;
	retentionDays: number;
}): Promise<{
	deletedEvents: number;
	deletedSoftRows: Record<string, number>;
}>;
```

Rules:
- Delete `sync_events` older than retention.
- Hard-delete old soft-deleted catalog/config rows only after retention.
- Do not hard-delete `orders` or `order_items` in this cleanup job.
- Keep enough soft-deleted rows for retained delete events to be materialized.

**Step 4: Wire scheduled execution**

If using Cloudflare Worker scheduled events, add the scheduled handler. If not currently configured, add a manual script first:

```json
"sync:cleanup": "bun src/scripts/sync-cleanup.ts"
```

Prefer daily cleanup at 03:00 server time when cron support is configured.

**Step 5: Run tests**

Run:

```bash
cd apps/api && bun test src/__test__/sync-cleanup.test.ts
cd apps/api && bun run check-types
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/lib/sync-cleanup.ts apps/api/src/__test__/sync-cleanup.test.ts apps/api/src/index.ts apps/api/package.json
git commit -m "feat: purge expired sync history"
```

---

## Task 12: Add Full-Resync Fallback

**Files:**
- Modify: `apps/pos-app/src/store/sync.ts`
- Modify: `apps/pos-app/src-tauri/src/sync.rs`
- Test: `apps/pos-app/src/store/__test__/sync.test.ts`
- Test: Rust tests in `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Write failing POS test**

```typescript
test("runs full resync when server reports expired cursor", async () => {
	mockGetSyncStatus.mockResolvedValue({
		hasChanges: true,
		latestEventId: 100,
		oldestAvailableEventId: 50,
		needsFullResync: true,
		changedTables: [],
	});

	const result = await syncNow();

	expect(result.mode).toBe("full");
	expect(mockInvoke).toHaveBeenCalledWith("sync_full_resync", expect.anything());
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun run test src/store/__test__/sync.test.ts
```

Expected: FAIL because cursor expiration is not handled.

**Step 3: Implement fallback**

When API returns `needsFullResync: true`:
- Pull snapshot for all scoped tables.
- Apply rows locally.
- Purge local rows outside scope as current GC rules allow.
- Set local cursor to `latestEventId`.
- Mark source rows `is_synced = true`.

**Step 4: Run tests**

Run:

```bash
cd apps/pos-app && bun run test src/store/__test__/sync.test.ts
cd apps/pos-app && bun run check-types
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts apps/pos-app/src-tauri/src/sync.rs
git commit -m "feat: full resync when event cursor expires"
```

---

## Task 13: Documentation and Operational Notes

**Files:**
- Modify: `docs/knowledge/pos-cloud-login-pin-and-sync-flow.md`
- Create: `docs/knowledge/pos-smart-sync-strategy.md`

**Step 1: Write documentation**

Document:
- Local outbox semantics.
- Server event retention.
- Cleanup cron behavior.
- Full-resync fallback.
- Why orders are not hard-deleted.
- Manual debug commands.

Include logcat command:

```bash
adb logcat -c && adb logcat -s "Tauri/Console:*" "RustStdoutStderr:*" | grep -E "\[SYNC-DEBUG\]|\[CLOUD-AUTH\]|\[CLOUD-LOGIN\]|\[AUTH\]|FAILED|Failed|Error"
```

**Step 2: Run docs lint if available**

Run:

```bash
bun x ultracite check docs/knowledge/pos-smart-sync-strategy.md docs/knowledge/pos-cloud-login-pin-and-sync-flow.md
```

Expected: PASS or no applicable issues.

**Step 3: Commit**

```bash
git add docs/knowledge/pos-smart-sync-strategy.md docs/knowledge/pos-cloud-login-pin-and-sync-flow.md
git commit -m "docs: document smart sync strategy"
```

---

## Task 14: End-to-End Verification

**Files:**
- No production code changes unless verification finds a defect.

**Step 1: Run focused test suites**

Run:

```bash
cd apps/api && bun test src/__test__/sync.test.ts src/__test__/sync-events.test.ts src/__test__/sync-cleanup.test.ts
cd apps/pos-app && bun run test src/store/__test__/sync.test.ts src/db/__test__/sync-outbox.test.ts
```

Expected: PASS.

**Step 2: Run type checks**

Run:

```bash
cd apps/api && bun run check-types
cd apps/pos-app && bun run check-types
```

Expected: PASS.

**Step 3: Run formatting/lint**

Run:

```bash
bun x ultracite check apps/api/src apps/pos-app/src packages/database/src
cd apps/pos-app/src-tauri && cargo fmt --check
```

Expected: PASS.

**Step 4: Manual device verification**

Run app and capture logs:

```bash
adb logcat -c && adb logcat -s "Tauri/Console:*" "RustStdoutStderr:*" | grep -E "\[SYNC-DEBUG\]|\[CLOUD-AUTH\]|\[CLOUD-LOGIN\]|\[AUTH\]|FAILED|Failed|Error"
```

Verify:
- Fresh install login does full/bootstrap sync.
- Immediate manual sync with no changes says `Data sudah terbaru`.
- Local product edit with no server changes uses push-only.
- Server product edit with no local changes uses pull-only.
- Local and server changes use full sync/conflict path.
- Device offline beyond retention receives `needsFullResync` and recovers with snapshot pull.

**Step 5: Final commit if verification required fixes**

```bash
git status --short
git add <fixed-files>
git commit -m "fix: stabilize smart sync verification"
```

---

## Rollout Notes

Start with compatibility mode:
- Keep existing `sync_now` available.
- Add smart sync behind the new `syncNow()` decision flow.
- Do not remove `is_synced` until outbox has been stable across several real-device sessions.

Migration requirements:
- API DB must run `cd apps/api && bun run db:push` after `sync_events` migration.
- Android app must be rebuilt after Rust command changes.

Storage policy:
- Local synced outbox retention: 1 day.
- Server sync event retention: 30 days.
- Full resync required when client cursor is older than oldest retained event.
- Orders and order items are retained for reporting/audit and are not hard-deleted by sync cleanup.

