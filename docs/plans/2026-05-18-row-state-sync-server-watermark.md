# Row-State Sync Server Watermark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `sync_events` event log with row-state pull sync using server-owned `syncUpdatedAt` watermarks and one opaque global cursor.

**Architecture:** The API remains the sync authority. Push still uses `sync_batch_requests` for `clientId + idempotencyKey` idempotency, but accepted row writes stamp each synced API row with a server-owned `syncUpdatedAt`. Pull/status stop reading `sync_events`; they query synced business tables directly by `(syncUpdatedAt, tableName, id)` and return one opaque cursor stored locally in `sync_cursors.last_server_watermark`.

**Tech Stack:** Bun, TypeScript, Drizzle ORM, Elysia, ts-proto, Rust/Tauri, SQLx, Vitest/Bun test, Cargo test, Ultracite/Biome.

---

## Non-Negotiable Rules

- Use TDD for behavior changes. Write each failing test first, run it, confirm the expected failure, then implement.
- Do not hand-edit generated sync artifacts for durable behavior. Update schema/generator writers/config, then run `bun run sync-proto:verify`.
- Keep `sync_batch_requests`. It is the idempotency ledger and is not replaced by row-state sync.
- Delete `sync_events` completely. Do not leave compatibility code or dead helpers.
- Add `syncUpdatedAt` only to API synced business tables. Do not add it to local POS business tables or protobuf row messages.
- Keep `deletedAt` nullable. Null means active; non-null means soft deleted.
- Ensure all synced API tables have non-null `updatedAt`. Fix `orderItems.updatedAt` as part of this change.
- After schema changes, wipe and regenerate API/POS Drizzle migrations because the app has not launched.

## Cursor Contract

Use one global opaque cursor across the selected table set.

Cursor format:

```text
sync:<syncUpdatedAt>:<tableName>:<rowId>
```

Ordering:

```sql
ORDER BY sync_updated_at ASC, table_name ASC, id ASC
```

Predicate:

```sql
sync_updated_at > cursor.syncUpdatedAt
OR (
  sync_updated_at = cursor.syncUpdatedAt
  AND (table_name > cursor.tableName OR (table_name = cursor.tableName AND id > cursor.rowId))
)
```

Baseline pull uses an empty cursor.

## Task 1: Add API Schema Watermark And Remove Event Schema

**Files:**
- Modify: `packages/database/src/api-schema.ts`
- Test: `packages/sync-proto-generator/src/__test__/synced-schema.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- `syncEvents` is not exported from `@repo/database/api-schema`.
- Every API synced table has `syncUpdatedAt`.
- `orderItems.updatedAt` is non-null.
- Local synced schema does not expose `syncUpdatedAt`.

Example assertion shape:

```ts
test("api synced tables have server-only syncUpdatedAt", () => {
  for (const table of Object.values(apiSyncedSchema)) {
    expect(table).toHaveProperty("syncUpdatedAt");
  }
});

test("local synced tables do not include server-only syncUpdatedAt", () => {
  for (const table of Object.values(localSyncedSchema)) {
    expect(table).not.toHaveProperty("syncUpdatedAt");
  }
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/synced-schema.test.ts
```

Expected: FAIL because `syncUpdatedAt` is missing and `syncEvents` still exists.

**Step 3: Implement minimal schema changes**

In `packages/database/src/api-schema.ts`:

- Delete the `syncEvents` table block.
- Add `syncUpdatedAt: integer("sync_updated_at").notNull().default(0)` to:
  - `merchants`
  - `outlets`
  - `registers`
  - `staff`
  - `categories`
  - `assets`
  - `products`
  - `outletProducts`
  - `orders`
  - `orderItems`
- Change `orderItems.updatedAt` to `.notNull()`.

Do not add `syncUpdatedAt` to:

- `packages/database/src/local-schema.ts`
- `packages/database/src/api-synced-schema.ts` manually unless exports need adjustment
- protobuf messages

**Step 4: Run tests to verify they pass**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/synced-schema.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/database/src/api-schema.ts packages/sync-proto-generator/src/__test__/synced-schema.test.ts
git commit -m "refactor(sync): add server watermarks to api schema"
```

## Task 2: Keep Generator Output Free Of Server-Only Watermarks

**Files:**
- Modify: `packages/sync-proto-generator/src/drizzle-reflection.ts`
- Modify: `packages/sync-proto-generator/src/schema-drift.ts`
- Test: `packages/sync-proto-generator/src/__test__/proto-writer.test.ts`
- Test: `packages/sync-proto-generator/src/__test__/schema-drift.test.ts`
- Test: `packages/sync-proto-generator/src/__test__/drift.test.ts`
- Modify if needed: `packages/protobuf/sync-proto.config.ts`

**Step 1: Write failing tests**

Add tests that prove `syncUpdatedAt` is ignored by the sync protobuf row generator:

```ts
test("server-only syncUpdatedAt is excluded from row messages", () => {
  const proto = renderSyncProto(config, reflectedTables);
  expect(proto).not.toContain("syncUpdatedAt");
  expect(proto).not.toContain("sync_updated_at");
});
```

Also add a drift test that fails if API schema has a column missing locally except for allowed server-only columns.

**Step 2: Run tests to verify they fail**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/proto-writer.test.ts src/__test__/schema-drift.test.ts
```

Expected: FAIL because `syncUpdatedAt` is reflected as a normal protobuf field or drift check complains.

**Step 3: Implement minimal generator support**

Preferred implementation:

- Add `syncUpdatedAt` to `localOnlyColumns` or create a new `serverOnlyColumns` config entry.
- If using `serverOnlyColumns`, update `SyncGeneratorConfig` and `packages/protobuf/sync-proto.config.ts`.
- Ensure API/local drift accepts `syncUpdatedAt` as API-only metadata.
- Ensure generated API push adapters can set `syncUpdatedAt` separately and do not expect it from protobuf rows.

**Step 4: Run tests to verify they pass**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__
```

Expected: all generator tests pass.

**Step 5: Regenerate sync artifacts**

Run:

```bash
bun run sync-proto:verify
```

Expected: drift tests pass and generated artifacts update.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator packages/protobuf apps/api/src/sync apps/pos-app/src-tauri/src/sync
git commit -m "refactor(sync): exclude server watermarks from protobuf rows"
```

## Task 3: Change Protobuf Pull Cursor Shape

**Files:**
- Modify: `packages/sync-proto-generator/src/proto-writer.ts`
- Modify: `packages/sync-proto-generator/src/ts-mapper-writer.ts`
- Modify: `packages/sync-proto-generator/src/rust-mapper-writer.ts`
- Test: `packages/sync-proto-generator/src/__test__/proto-writer.test.ts`
- Test: `packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts`
- Test: `packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts`
- Generated: `packages/protobuf/proto/sync.proto`
- Generated: `packages/protobuf/src/sync.ts`
- Generated: `apps/api/src/sync/protobuf.generated.ts`
- Generated: `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`

**Step 1: Write failing tests**

Assert the generated proto has this pull shape:

```proto
message SyncPullBatchRequest {
  string outletId = 1;
  repeated string tables = 2;
  int32 limit = 3;
  string cursor = 4;
}

message SyncPullBatchResponse {
  // typed tables remain at field 10+
  string cursor = 100;
  bool hasMore = 101;
  string serverTime = 102;
}
```

Assert the old fields are gone:

- `afterEventId`
- `latestEventId`
- `needsFullResync`
- `nextPageCursor`
- `pageCursor`

**Step 2: Run tests to verify they fail**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/proto-writer.test.ts src/__test__/rust-mapper-writer.test.ts src/__test__/ts-mapper-writer.test.ts
```

Expected: FAIL because the current generator still emits event cursor fields.

**Step 3: Implement generator changes**

- Replace request fields in `proto-writer.ts`.
- Replace response metadata fields in `proto-writer.ts`.
- Update `ts-mapper-writer.ts` to emit `cursor`, `hasMore`, and `serverTime`.
- Update `rust-mapper-writer.ts` helper names:
  - remove `pull_batch_response_latest_event_id`
  - remove `pull_batch_response_needs_full_resync`
  - remove `pull_batch_response_next_cursor`
  - add `pull_batch_response_cursor`
- Update Rust wrapper `apps/pos-app/src-tauri/src/sync/protobuf.rs` after generation.

**Step 4: Regenerate and verify**

Run:

```bash
bun run sync-proto:verify
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::protobuf --lib
```

Expected: generator and Rust protobuf tests pass.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator packages/protobuf apps/api/src/sync apps/pos-app/src-tauri/src/sync
git commit -m "refactor(sync): use opaque pull cursor protobuf"
```

## Task 4: Add Row-State Cursor Parser And Formatter

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Test: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing tests**

Add tests for:

- empty cursor parses as baseline
- valid cursor parses `sync:1716030000:products:p123`
- invalid prefix throws a 400-compatible error
- invalid timestamp throws a 400-compatible error
- cursor formatting round-trips

Example:

```ts
test("parse row-state cursor with syncUpdatedAt table and row id", () => {
  expect(parsePullBatchCursor("sync:1716030000:products:p123")).toEqual({
    rowId: "p123",
    syncUpdatedAt: 1716030000,
    tableName: "products",
  });
});
```

If helpers stay private, test through `handlePullBatch` route-level behavior instead of exporting them. Prefer direct unit tests if the helpers are non-trivial.

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current parser expects `event:<id>`.

**Step 3: Implement minimal parser/formatter**

In `apps/api/src/sync/service.ts`:

- Replace `PULL_BATCH_CURSOR_PREFIX = "event:"` with row-state cursor parsing.
- Use URL-safe encoding for `tableName` and `rowId` if needed. If IDs are UUID/text without `:`, simple split is acceptable for now; document this in tests.

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS for cursor tests.

**Step 5: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "refactor(sync): add row-state pull cursor"
```

## Task 5: Stamp API Push Rows With Server Watermark

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify if needed: `apps/api/src/sync/push-adapters.generated.ts` via generator
- Test: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing tests**

Add tests that prove:

- Accepted created/updated rows are upserted with `syncUpdatedAt` set by server.
- Accepted soft deletes are updated with `deletedAt`, `updatedAt`, and `syncUpdatedAt`.
- Client-provided `syncUpdatedAt` is ignored if present in a decoded row.
- Retried idempotency response does not restamp rows.

Example assertion:

```ts
expect(upsertedRows[0]).toEqual(
  expect.objectContaining({
    id: "product-1",
    syncUpdatedAt: expect.any(Number),
  })
);
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because rows are not stamped yet.

**Step 3: Implement minimal stamping**

In `handlePushBatch`:

- Create one `syncUpdatedAt = Date.now()` per accepted push transaction.
- Apply it to each accepted changed row after tenant normalization and before upsert.
- Apply it to soft delete update payloads.
- Do not include it in protobuf responses.

If generated push adapters reject unknown fields, update generator to understand API-only write metadata.

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts packages/sync-proto-generator apps/api/src/sync/push-adapters.generated.ts
git commit -m "refactor(sync): stamp pushed rows with server watermark"
```

## Task 6: Rewrite Pull To Query Business Tables Directly

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Test: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing tests**

Replace event-log pull tests with row-state tests:

- baseline empty cursor returns rows from selected tables ordered by `(syncUpdatedAt, tableName, id)`
- paginated pull with limit returns `hasMore: true` and cursor for last emitted row
- second page starts strictly after the composite cursor and does not duplicate rows
- same `syncUpdatedAt` for multiple rows does not drop rows
- soft deleted row returns in `changedRows` with `deletedAt` set, not `deletedIds`
- table filter only returns requested tables
- out-of-scope rows are excluded by merchant/outlet scope

Example:

```ts
test("handlePullBatch paginates rows sharing the same syncUpdatedAt without dropping rows", async () => {
  const firstPage = await handlePullBatch({
    cursor: "",
    limit: 1,
    merchantId: "merchant-1",
    outletId: "outlet-1",
    tables: ["products"],
  });

  const secondPage = await handlePullBatch({
    cursor: firstPage.cursor,
    limit: 1,
    merchantId: "merchant-1",
    outletId: "outlet-1",
    tables: ["products"],
  });

  expect(firstPage.products?.changedRows[0]?.id).toBe("product-1");
  expect(secondPage.products?.changedRows[0]?.id).toBe("product-2");
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current implementation reads `syncEvents`.

**Step 3: Implement row-state pull**

In `apps/api/src/sync/service.ts`:

- Remove event-row query logic from `handlePullBatch`.
- Build candidate rows per requested table using existing scope filters.
- Select full rows where row’s `syncUpdatedAt` is after cursor.
- Merge candidates into one sorted list by `syncUpdatedAt`, `tableName`, `id`.
- Limit globally by requested `limit`.
- Group returned rows into the existing typed table response shape.
- Return `cursor` for the last emitted row when more rows exist.
- Return `hasMore` by fetching `limit + 1`.
- Keep baseline pull as empty cursor, not `afterEventId === 0`.

Implementation can be deliberately simple: query each selected table with `limit + 1`, merge in memory, then trim globally. Table count is small and fixed.

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "refactor(sync): pull rows by server watermark"
```

## Task 7: Rewrite Status To Use Row-State Watermark

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/routes.ts`
- Modify: `packages/sync-proto-generator/src/proto-writer.ts`
- Test: `apps/api/src/sync/__test__/service.test.ts`
- Test: `apps/api/src/sync/__test__/routes-protobuf.test.ts`

**Step 1: Write failing tests**

Decide the status request contract:

- Option A: keep `/status` but send `cursor`.
- Option B: remove `/status` and let pull with `limit=1` answer “has changes.”

Prefer Option A for smaller surface change:

```proto
message SyncStatusRequest {
  string outletId = 1;
  string cursor = 2;
}

message SyncStatusResponse {
  repeated string changedTables = 1;
  bool hasChanges = 2;
  string cursor = 3;
}
```

Tests:

- status with empty cursor returns changed table names
- status with latest cursor returns no changes
- status ignores out-of-scope rows
- route rejects invalid cursor

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: FAIL because status still accepts `lastServerEventId`.

**Step 3: Implement minimal status changes**

- Update proto generator status messages.
- Update API route to parse `statusRequest.cursor`.
- Update `handleSyncStatus` to query business tables by watermark cursor.
- Return unique changed table names.
- Remove full-resync event-retention logic from status.

**Step 4: Regenerate and verify**

Run:

```bash
bun run sync-proto:verify
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator packages/protobuf apps/api/src/sync apps/pos-app/src-tauri/src/sync
git commit -m "refactor(sync): status uses row-state cursor"
```

## Task 8: Remove Sync Event Writes From Push

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Test: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing tests**

Update push tests so they assert:

- no insert into `syncEvents`
- response `latestEventId` no longer exists
- cached idempotency response still returns accepted table acks and `serverTime`

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because service still builds/inserts sync events.

**Step 3: Implement cleanup**

Remove:

- `syncEvents` import
- `buildSyncEventRow`
- `insertSyncEventsChunked`
- `getEventScopeForTable`
- `getLatestScopedEventId`
- `getScopedEventsFilter` if no longer used
- `syncEventRows` collection in `handlePushBatch`
- `latestEventId` from push response types, protobuf, generated wrappers, and tests

Keep:

- idempotency reservation/finalization
- accepted/rejected row ack behavior
- conflict checks
- tenant enforcement

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts packages/sync-proto-generator packages/protobuf
git commit -m "refactor(sync): remove sync event write path"
```

## Task 9: Update API Routes For Cursor-Based Pull

**Files:**
- Modify: `apps/api/src/sync/routes.ts`
- Modify: `apps/api/src/sync/protobuf.ts`
- Test: `apps/api/src/sync/__test__/routes-protobuf.test.ts`
- Test: `apps/api/src/sync/__test__/protobuf.test.ts`

**Step 1: Write failing tests**

Tests:

- pull route forwards `cursor`, `tables`, and `limit`
- pull route returns response `cursor`
- pull route rejects invalid cursor
- no route references `afterEventId`, `lastServerEventId`, `pageCursor`, or `nextPageCursor`

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: FAIL against old route contract.

**Step 3: Implement route/protobuf wrapper changes**

- Replace `afterEventId`/`pageCursor` reads with `cursor`.
- Replace unsafe int64 cursor validation with row-state cursor validation.
- Encode/decode `cursor`, `hasMore`, and `serverTime`.

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync apps/api/src/sync/__test__
git commit -m "refactor(sync): route pull with opaque cursor"
```

## Task 10: Update Rust Cursor Storage And Pull Loop

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/local_state.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Test: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Step 1: Write failing Rust tests**

Tests:

- local state can save/load `last_server_watermark`
- pull request uses stored watermark as `cursor`
- pull response cursor is saved only after rows are applied
- empty cursor is used for baseline/full resync
- full-resync event-expiry error path is gone

Example:

```rust
#[test]
fn stored_watermark_becomes_pull_cursor() {
    let request = build_sync_pull_batch_request(
        "outlet-1",
        &["products".to_string()],
        250,
        "sync:1716030000:products:p123",
    );

    assert_eq!(request.cursor, "sync:1716030000:products:p123");
}
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: FAIL because Rust still uses event ids and page cursors.

**Step 3: Implement Rust changes**

- Add local helpers:
  - `get_last_server_watermark(pool, outlet_id)`
  - `set_last_server_watermark_tx(tx, outlet_id, cursor)`
- Keep `last_server_event_id` column for now or remove it in migration reset. Prefer remove during schema cleanup if no references remain.
- Update `sync_pull_batch_inner`:
  - load stored watermark
  - send `cursor`
  - save response cursor transactionally after applying rows
  - loop while `hasMore`
- Update logs from `after_event_id/page_cursor` to `cursor`.

**Step 4: Run tests to verify they pass**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync
git commit -m "refactor(sync): store opaque pull cursor locally"
```

## Task 11: Soft Delete Enforcement Audit

**Files:**
- Inspect: `apps/api/src/**/*.ts`
- Inspect: `apps/pos-app/src/**/*.ts`
- Inspect: `apps/pos-app/src-tauri/src/**/*.rs`
- Test: existing API/Rust sync tests plus focused delete tests

**Step 1: Write failing tests for delete semantics**

Add/adjust tests proving:

- API push `deletedIds` are converted into soft deletes with `deletedAt`, `updatedAt`, and `syncUpdatedAt`.
- Pull returns soft-deleted rows in `changedRows`.
- Rust local apply physically deletes or tombstones rows according to existing local rules.

If local Rust currently upserts tombstone rows instead of physical deletes, decide explicitly:

- Option A: keep local tombstones. Simpler and safer with current upsert path.
- Option B: physically delete local rows when `deletedAt` exists. More cleanup, but product UI queries must handle missing rows.

Prefer Option A unless UI/data access already assumes physical deletes.

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: FAIL where old `deletedIds` pull behavior remains.

**Step 3: Implement delete cleanup**

- Remove pull response `deletedIds` usage for server-originated row-state deletes if all deletes are represented as tombstone rows.
- Keep push request `deletedIds` if local outbox still sends deletes by id.
- Ensure generated Rust mapper still converts response `deletedIds` only if generator keeps the field. Long term, consider removing `deletedIds` from response changes after this migration.

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api apps/pos-app packages/sync-proto-generator packages/protobuf
git commit -m "refactor(sync): enforce soft delete row-state pulls"
```

## Task 12: Wipe And Regenerate Drizzle Migrations

**Files:**
- Delete/regenerate: `apps/api/drizzle/*`
- Delete/regenerate: `apps/pos-app/drizzle/*`

**Step 1: Verify schema tests are green before migration reset**

Run:

```bash
bun run typecheck
bun run sync-proto:verify
```

Expected: PASS.

**Step 2: Wipe migrations**

Run:

```bash
rm -rf apps/api/drizzle apps/pos-app/drizzle
mkdir -p apps/api/drizzle apps/pos-app/drizzle
```

This is allowed because the app has not launched.

**Step 3: Regenerate migrations**

Run:

```bash
cd apps/api && bunx drizzle-kit generate
cd ../pos-app && bunx drizzle-kit generate
cd ../..
```

Expected:

- API baseline has no `sync_events`.
- API synced tables include `sync_updated_at`.
- POS local baseline has no `sync_updated_at` business table columns.
- POS `sync_cursors` stores the opaque watermark.

**Step 4: Inspect generated SQL**

Run:

```bash
rg -n "sync_events|sync_updated_at|last_server_watermark|last_server_event_id" apps/api/drizzle apps/pos-app/drizzle
```

Expected:

- no `sync_events`
- API has `sync_updated_at`
- POS has `last_server_watermark`
- `last_server_event_id` only remains if intentionally kept for temporary compatibility

**Step 5: Commit**

```bash
git add apps/api/drizzle apps/pos-app/drizzle
git commit -m "chore(db): regenerate baseline migrations for row-state sync"
```

## Task 13: Cleanup Docs And ADRs

**Files:**
- Modify: `docs/adr/0008-use-idempotent-sync-batches-and-paged-pulls.md`
- Modify: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`
- Modify: `docs/knowledge/SYNC-PROTO-LIBRARY-CHANGES.md`
- Optional create: `docs/adr/0009-use-row-state-sync-watermarks.md`

**Step 1: Update docs**

Document:

- `sync_events` is removed.
- `sync_batch_requests` remains for idempotency.
- API rows have server-only `syncUpdatedAt`.
- POS stores opaque cursor in `sync_cursors.last_server_watermark`.
- Pull cursors are opaque and must not be parsed by Rust.
- `updatedAt` remains domain/LWW data; `syncUpdatedAt` is replication ordering.

**Step 2: Run doc lint**

Run:

```bash
bun x ultracite check docs/adr docs/knowledge
```

Expected: PASS.

**Step 3: Commit**

```bash
git add docs/adr docs/knowledge
git commit -m "docs(sync): document row-state watermark sync"
```

## Task 14: Final Verification

**Files:**
- Whole repo

**Step 1: Run focused API tests**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/payload-size.test.ts
```

Expected: PASS.

**Step 2: Run generator verification**

Run:

```bash
bun run sync-proto:verify
```

Expected: PASS.

**Step 3: Run Rust sync tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 4: Run TypeScript typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

**Step 5: Run Ultracite**

Run:

```bash
bun x ultracite check
```

Expected: PASS.

**Step 6: Run full tests if time allows**

Run:

```bash
bun test
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 7: Final commit**

If earlier task commits were skipped, create one final commit:

```bash
git add -A
git commit -m "refactor(sync): replace event log with row-state watermarks"
```

## Verification Guide

Manual UI steps:

1. Install/run POS app against local API.
2. Create a product/category/order on one POS device.
3. Run sync push.
4. Run sync pull on another POS device/database.
5. Confirm rows appear.
6. Soft-delete a product/category.
7. Sync again and confirm the second device receives the tombstone state.

Log checks:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(SYNC|DB):|push_batch|pull_batch|upsert_row|sync_proto'
```

State/database checks:

```sql
SELECT id, sync_updated_at, updated_at, deleted_at FROM products ORDER BY sync_updated_at DESC LIMIT 5;
SELECT scope_type, scope_id, last_server_watermark FROM sync_cursors;
SELECT client_id, idempotency_key, request_hash FROM sync_batch_requests ORDER BY updated_at DESC LIMIT 5;
```

Edge cases:

- Device clock behind server: push row with old `updatedAt`; another client should still pull it because `syncUpdatedAt` is fresh.
- Multiple rows share the same `syncUpdatedAt`: pagination must return all rows across pages without duplicates or omissions.
- Lost push response: same `clientId + idempotencyKey + requestHash` should return cached response and not restamp rows.

