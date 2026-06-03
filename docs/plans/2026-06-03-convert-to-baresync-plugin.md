# Convert Sakti POS to Baresync Plugin

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the custom sync infrastructure in sakti-pos with the published `baresync` npm package (v0.2.3) and `tauri-plugin-baresync` Rust crate (v0.2.0), switching from protobuf to JSON wire encoding.

**Architecture:** The current sync system is a custom implementation that became the basis for the published baresync plugin. This conversion replaces ~4,300 lines of custom Rust sync code, custom protobuf generator, inline server routes, and manual outbox management with the standardized baresync plugin APIs. The schema shape stays the same — only the infrastructure plumbing changes.

**Tech Stack:** Tauri 2, Rust 2021, `tauri-plugin-baresync` 0.2.0, `baresync` npm 0.2.3, Drizzle ORM, Elysia (server), SolidJS (client), Bun, TypeScript.

---

## Context: What Changes and What Stays

### Replaced by baresync
- `apps/pos-app/src-tauri/src/sync/*` (4,296 lines) → `tauri-plugin-baresync` plugin
- `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs` (291 lines) → plugin's built-in DB proxy
- `apps/pos-app/src-tauri/src/db/migrations.rs` (91 lines) → plugin's built-in migration runner
- `apps/pos-app/src-tauri/build.rs` protobuf/migration manifest → simplified build
- `apps/api/src/sync/routes.ts` (232 lines) → `createSyncPushHandler` / `createSyncPullHandler` / `createSyncStatusHandler`
- `apps/api/src/sync/service.ts` (1,079 lines) → `createDrizzleSyncRepository`
- `apps/api/src/sync/protobuf.ts` + codec plugin → JSON encoding (eliminated)
- `apps/api/src/sync/push-adapters.generated.ts` (655 lines) → eliminated (server repo handles this)
- `packages/sync-proto-generator/` → `baresync/generator` with `sync.config.ts`
- `packages/protobuf/proto/sync.proto` + generated artifacts → `sync-contract.json`
- `apps/pos-app/src/db/sync-outbox.ts` (163 lines) → `writeTransaction` + `writeLocalChange`
- `apps/pos-app/src/db/index.ts` (71 lines) → `createTauriDrizzleDatabase`
- `apps/pos-app/src/store/sync.ts` (432 lines) → `createSyncClient` + simplified orchestrator

### Kept as-is (not sync infrastructure)
- `apps/pos-app/src/lib/assets/*` — asset upload/download (not synced via baresync)
- `apps/pos-app/src/lib/auth/*` — auth storage
- All UI components — only import paths change
- `packages/database/src/local-schema.ts` — business table definitions stay, sync metadata columns stay
- `packages/database/src/api-schema.ts` — same
- Non-synced tables (`localAssetCache`, `pendingProductPhotoJobs`, `pendingAssetProcessingJobs`, `users`, `userMerchants`, `userSessions`)

### Key design decisions
- **Wire encoding:** JSON (not protobuf). Simpler, baresync default, easier to debug.
- **Scope model:** Sakti uses two scope levels (merchant and outlet). Baresync expects a single `scopeId`. The conversion maps `outletId` as the primary scope ID since most tables scope by outlet. Merchant-scoped tables will use `merchantId` as their scope value.
- **`syncMeta` table:** Custom table for per-table/per-outlet sync timestamps. Baresync uses `syncCursors` instead. Migrate the concept or remove if `syncCursors` covers the use case.
- **Polling:** Baresync plugin handles polling internally. Replace the JS `setInterval` with plugin's `poll_interval_secs`.

---

## Phase 0: Install Packages and Verify Baseline

### Task 0.1: Run current test suite to establish baseline

**Files:** (read-only)

Run all sync-related tests to document what passes before any changes:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/pos-app/src/db/__test__/sync-schema.test.ts apps/pos-app/src/store/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib sync::
bun run sync-proto:check
```

Record results. All tests should pass before proceeding.

### Task 0.2: Install npm packages

**Files:**
- Modify: `apps/pos-app/package.json` — add `"baresync": "^0.2.3"`
- Modify: `apps/api/package.json` — add `"baresync": "^0.2.3"`
- Modify: root `package.json` — if workspaces need updating

Run:
```bash
bun install
```

Verify:
```bash
bun x baresync --help 2>/dev/null || echo "CLI available via npx"
```

### Task 0.3: Install Rust crate

**Files:**
- Modify: `apps/pos-app/src-tauri/Cargo.toml` — add `tauri-plugin-baresync = "0.2.0"` and `env_logger = "0.11"`

```toml
[dependencies]
tauri-plugin-baresync = "0.2.0"
env_logger = "0.11"
```

Remove protobuf-related dependencies that will no longer be needed:
- `prost` (line 36)
- `sha2` (line 34) — baresync handles idempotency internally

Keep `reqwest`, `sqlx`, `serde`, `serde_json` for other modules (assets, auth).

Verify it compiles:
```bash
cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml
```

### Task 0.4: Remove protobuf build dependencies

**Files:**
- Modify: `apps/pos-app/src-tauri/Cargo.toml` — remove from `[build-dependencies]`:
  - `prost-build = "0.13"` (line 18)
  - `protoc-bin-vendored = "3"` (line 19)

Keep `tauri-build`.

---

## Phase 1: Create Shared Constants and Config

### Task 1.1: Create SYNC_SCOPE constant

**Files:**
- Create: `packages/database/src/sync-constants.ts`

```ts
export const SYNC_SCOPE = "default";
```

This is the single shared constant. Both client and server import it. Sakti POS uses `outletId` as the runtime scope value, but the constant defines the scope name.

### Task 1.2: Create sync.config.ts

**Files:**
- Create: `packages/database/sync.config.ts`

```ts
import { defineSyncConfig } from "baresync/generator";
import * as apiSyncedSchema from "./src/api-synced-schema";
import * as localSyncedSchema from "./src/synced-schema";

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema,
  localSyncedSchema,
  outputDir: "./generated",
  tables: {
    merchants: { scopeColumn: "id" },
    outlets: { scopeColumn: "merchant_id" },
    registers: { scopeColumn: "outlet_id" },
    staff: { scopeColumn: "merchant_id" },
    categories: { scopeColumn: "merchant_id" },
    assets: { scopeColumn: "merchant_id" },
    products: { scopeColumn: "merchant_id" },
    outletProducts: { scopeColumn: "outlet_id" },
    orders: { scopeColumn: "outlet_id" },
    orderItems: { scopeColumn: "outlet_id" },
  },
});
```

**Note:** The `scopeColumn` values match the current `SYNC_TABLE_SCOPE` mapping in `apps/api/src/sync/service.ts:47-61`. The generator uses these to validate schemas and produce scope metadata in the contract.

### Task 1.3: Add generate:sync script

**Files:**
- Modify: root `package.json` — add/replace scripts:

```json
{
  "scripts": {
    "generate:sync": "bunx baresync generate --config packages/database/sync.config.ts",
    "generate:sync:check": "bunx baresync generate --config packages/database/sync.config.ts --check",
    "generate:sync:doctor": "bunx baresync doctor --config packages/database/sync.config.ts"
  }
}
```

---

## Phase 2: Convert Schemas to Use Baresync Helpers

### Task 2.1: Convert local infrastructure schema

**Files:**
- Modify: `packages/database/src/local-schema.ts`

Replace the manual `syncOutbox`, `syncCursors`, and `syncClientIdentity` table definitions with baresync helpers:

```ts
// Add at top
import { createSyncOutboxTable, createSyncCursorsTable } from "baresync/schema";

// Replace syncOutbox (lines 94-117) with:
export const syncOutbox = createSyncOutboxTable();

// Replace syncCursors (lines 127-134) with:
export const syncCursors = createSyncCursorsTable();

// Remove syncClientIdentity (lines 119-125) — baresync manages client identity internally
// Remove syncMeta (lines 88-92) — baresync uses syncCursors instead
```

**Keep** all business tables (merchants, outlets, registers, staff, categories, assets, products, outletProducts, orders, orderItems) with their existing columns. They already have the correct shape (`deletedAt`, `isSynced`, `createdAt`, `updatedAt`).

**Keep** `localAssetCache`, `pendingProductPhotoJobs`, `pendingAssetProcessingJobs` — these are local-only tables.

**Action required:** Check if `syncMeta` is used anywhere outside sync infrastructure. If it's used for per-table sync tracking, migrate that logic to use `syncCursors` or keep the table as a non-synced local table.

### Task 2.2: Convert API infrastructure schema

**Files:**
- Modify: `packages/database/src/api-schema.ts`

Replace the manual `syncBatchRequests` definition with baresync helper:

```ts
// Add at top
import { createSyncBatchRequestsTable } from "baresync/schema";

// Replace syncBatchRequests (lines 58-76) with:
export const syncBatchRequests = createSyncBatchRequestsTable();
```

**Keep** all business tables. They already have the correct shape (`deletedAt`, `syncUpdatedAt`, `createdAt`, `updatedAt`).

**Keep** `users`, `userMerchants`, `userSessions` — these are API-only tables.

### Task 2.3: Add baresync schema exports to database package

**Files:**
- Modify: `packages/database/package.json` — ensure `baresync/schema` is accessible as a dependency

The database package already depends on `drizzle-orm`. Add `baresync` if not already present (it should be from Task 0.2, but verify it's in the right `package.json`).

### Task 2.4: Generate sync contract

Run:
```bash
bun run generate:sync
```

This should produce:
- `packages/database/generated/sync-contract.json`
- `packages/database/generated/sync-table-order.ts`
- `packages/database/generated/sync-contract.manifest.json`

Verify the generated contract matches expected table order and scope mappings. If the generator reports errors about missing columns or schema mismatches, fix the schemas first.

---

## Phase 3: Convert Server to Baresync

### Task 3.1: Create server sync repository

**Files:**
- Create: `apps/api/src/sync/sync-repository.ts`

```ts
import { createDrizzleSyncRepository } from "baresync/server/drizzle";
import { db } from "../db";
import * as apiSchema from "@repo/database/api-schema";

export function createAppSyncRepository() {
  return createDrizzleSyncRepository({
    tables: {
      merchants: {
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) => ({
          id: row.id as string,
          name: row.name as string,
          deletedAt: (row.deletedAt as string) ?? null,
          createdAt: (row.createdAt as string) ?? updatedAt,
          updatedAt,
          syncUpdatedAt,
        }),
        readLatestRow: async ({ scopeId }) => {
          const [row] = await db
            .select()
            .from(apiSchema.merchants)
            .where(eq(apiSchema.merchants.id, scopeId))
            .orderBy(desc(apiSchema.merchants.syncUpdatedAt))
            .limit(1);
          return row ?? null;
        },
        readRows: ({ cursorTimestamp, scopeId }) =>
          db
            .select()
            .from(apiSchema.merchants)
            .where(
              and(
                eq(apiSchema.merchants.id, scopeId),
                gt(apiSchema.merchants.syncUpdatedAt, cursorTimestamp)
              )
            ),
        softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
          await db
            .update(apiSchema.merchants)
            .set({ deletedAt: updatedAt, updatedAt, syncUpdatedAt })
            .where(eq(apiSchema.merchants.id, id));
        },
        upsertRow: async (row) => {
          await db
            .insert(apiSchema.merchants)
            .values(row)
            .onConflictDoUpdate({
              target: apiSchema.merchants.id,
              set: { ...row, syncUpdatedAt: row.syncUpdatedAt },
            });
        },
      },
      // ... repeat for all 10 synced tables
    },
  });
}
```

**Important:** Each table needs all 5 functions. The `buildRow` function validates and transforms the raw push payload. The scope mapping from `SYNC_TABLE_SCOPE` in the current `service.ts` needs to be incorporated into the `resolveScope` function (see Task 3.3).

### Task 3.2: Create server route handlers

**Files:**
- Create: `apps/api/src/sync/baresync-routes.ts`

```ts
import {
  createSyncPushHandler,
  createSyncPullHandler,
  createSyncStatusHandler,
} from "baresync/server";
import { createAppSyncRepository } from "./sync-repository";
import { db } from "../db";

const repository = createAppSyncRepository();

const push = createSyncPushHandler({
  resolveScope,
  upsertOrder: repository.tableNames,
  idempotency: { db },
  applyPushChanges: async ({ changes, scope, scopeId, syncUpdatedAt }) =>
    repository.applyPushChanges({ changes, scopeId: scope.scopeId, syncUpdatedAt }),
});

const pull = createSyncPullHandler({
  limit: 500,
  resolveScope,
  loadPullChanges: async ({ cursor, scope, scopeId, tables }) =>
    repository.loadPullChanges({ cursor, scopeId: scope.scopeId, tables }),
});

const status = createSyncStatusHandler({
  resolveScope,
  loadSyncStatus: async ({ cursor, scope, scopeId }) =>
    repository.loadSyncStatus({ cursor, scopeId: scope.scopeId }),
});
```

### Task 3.3: Implement resolveScope

**Files:**
- Modify: `apps/api/src/sync/baresync-routes.ts`

The `resolveScope` function replaces the current `authenticated` + `assertOutletAccess` + `getOutletMerchantId` chain:

```ts
import { verifyOutletAccess } from "./service"; // reuse existing auth helper
import { getOutletMerchantId } from "./service"; // reuse existing helper

const resolveScope = async ({ scopeId, context }: { scopeId: string; context: { session: { userId: string } } }) => {
  const merchantId = await getOutletMerchantId(scopeId);
  if (!merchantId) {
    return { ok: false as const, status: 404, body: { error: "Outlet not found" } };
  }

  const allowed = await verifyOutletAccess(context.session.userId, scopeId);
  if (!allowed) {
    return { ok: false as const, status: 403, body: { error: "Forbidden" } };
  }

  return {
    ok: true as const,
    scope: { scopeId, merchantId },
  };
};
```

### Task 3.4: Mount routes in Elysia

**Files:**
- Modify: `apps/api/src/index.ts` (or wherever routes are mounted)

Replace the existing `syncRoutes` mount with the new baresync routes. Since baresync handlers are standard Request/Response, you may need an Elysia adapter:

```ts
import { push, pull, status } from "./sync/baresync-routes";

// In Elysia:
.post("/api/sync/push", ({ request }) => push(request, { session: /* from middleware */ }))
.post("/api/sync/pull", ({ request }) => pull(request, { session: /* from middleware */ }))
.post("/api/sync/status", ({ request }) => status(request, { session: /* from middleware */ }))
```

### Task 3.5: Remove old sync server code

**Files:**
- Delete: `apps/api/src/sync/routes.ts`
- Delete: `apps/api/src/sync/protobuf.ts`
- Delete: `apps/api/src/sync/push-adapters.generated.ts`
- Delete: `apps/api/src/sync/protobuf.generated.ts` (if exists)
- Simplify: `apps/api/src/sync/service.ts` — keep only `verifyOutletAccess` and `getOutletMerchantId` helpers, remove `handlePushBatch`, `handleRowStatePullBatch`, `handleRowStateSyncStatus`, and all the table adapter logic

---

## Phase 4: Convert Client to Baresync

### Task 4.1: Create client DB helper

**Files:**
- Modify: `apps/pos-app/src/db/index.ts`

Replace the manual `drizzle()` call with `createTauriDrizzleDatabase`:

```ts
import { createTauriDrizzleDatabase } from "baresync/db";
import { invoke } from "@tauri-apps/api/core";
import * as localSchema from "@repo/database/local-schema";

export const TABLE = {
  // Synced tables
  merchants: localSchema.merchants,
  outlets: localSchema.outlets,
  registers: localSchema.registers,
  staff: localSchema.staff,
  categories: localSchema.categories,
  assets: localSchema.assets,
  products: localSchema.products,
  outletProducts: localSchema.outletProducts,
  orders: localSchema.orders,
  orderItems: localSchema.orderItems,
  // Sync infrastructure
  syncOutbox: localSchema.syncOutbox,
  syncCursors: localSchema.syncCursors,
  // Local-only tables
  localAssetCache: localSchema.localAssetCache,
  pendingProductPhotoJobs: localSchema.pendingProductPhotoJobs,
  pendingAssetProcessingJobs: localSchema.pendingAssetProcessingJobs,
};

export const db = createTauriDrizzleDatabase({
  schema: TABLE,
  invoke,
});
```

### Task 4.2: Create sync client

**Files:**
- Create: `apps/pos-app/src/lib/sync-client.ts`

```ts
import { createSyncClient } from "baresync/tauri";
import { invoke } from "@tauri-apps/api/core";

export function createAppSyncClient(outletId: string) {
  return createSyncClient({
    scopeId: outletId,
    invoke,
  });
}
```

### Task 4.3: Convert outbox writes to writeTransaction + writeLocalChange

**Files:**
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/db/menu.ts`
- Modify: `apps/pos-app/src/db/outlets.ts`
- Modify: `apps/pos-app/src/db/staff.ts`

Replace all `recordLocalChange` calls with `writeTransaction` + `writeLocalChange`:

**Before:**
```ts
import { recordLocalChange } from "~/db/sync-outbox";

await db.insert(TABLE.products).values(product);
await recordLocalChange({
  tableName: "products",
  rowId: product.id,
  operation: "insert",
  scopeType: "merchant",
  scopeId: merchantId,
});
```

**After:**
```ts
import { createAppSyncClient } from "~/lib/sync-client";

const client = createAppSyncClient(outletId);

await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    table: TABLE.products,
    rowId: product.id,
    operation: "insert",
    write: (writeTx) => writeTx.insert(TABLE.products).values(product),
  });
});
```

**Files with `recordLocalChange` calls to convert:**
- `apps/pos-app/src/db/orders.ts:312`
- `apps/pos-app/src/db/menu.ts:51,75,96,169,193,214`
- `apps/pos-app/src/db/outlets.ts:112,178`
- `apps/pos-app/src/db/staff.ts:55,79`

### Task 4.4: Convert sync orchestrator

**Files:**
- Modify: `apps/pos-app/src/store/sync.ts`

Replace the custom `syncNowInner()` logic with baresync's `createSyncClient`. The plugin handles:
- Polling (via `poll_interval_secs` in the Rust builder)
- Mode decision (push/pull/full/skip)
- Cursor management
- Chunking
- Idempotency

The JS orchestrator becomes much simpler:

```ts
import { createAppSyncClient } from "~/lib/sync-client";
import { currentOutletId } from "./outlet";

export async function syncNow() {
  const outletId = currentOutletId();
  if (!outletId) return;

  const client = createAppSyncClient(outletId);
  const result = await client.syncNow({ reason: "manual" });

  // Handle result for UI
  return result;
}
```

**Keep** the asset upload/hydration logic — that's not part of baresync. Move it to a separate function that runs after sync.

### Task 4.5: Delete old outbox and sync code

**Files:**
- Delete: `apps/pos-app/src/db/sync-outbox.ts`
- Simplify: `apps/pos-app/src/store/sync.ts` — remove custom mode decision, `invokeSyncTransfer`, `drainSyncRequests`, etc.

---

## Phase 5: Convert Rust Side to Plugin

### Task 5.1: Register baresync plugin in lib.rs

**Files:**
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

```rust
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;

pub fn run() {
    // Initialize env_logger for baresync debug output
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    tauri::Builder::default()
        // ... existing plugins ...
        .plugin(
            BaresyncBuilder::new()
                .api_base_url(std::env::var("VITE_API_URL").unwrap_or_else(|_| "http://localhost:3001".to_string()))
                .db_path("sakti_pos.db")
                .contract_json(include_str!("../../../../packages/database/generated/sync-contract.json"))
                .migrations_path("migrations")
                .poll_interval_secs(300) // 5 minutes, matches current setInterval
                .poll_on_background(true) // mobile needs background polling
                .build(),
        )
        // ... remove sync::commands from invoke_handler ...
        // The plugin registers its own commands
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Task 5.2: Remove sync commands from invoke_handler

**Files:**
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

Remove these lines from `invoke_handler`:
```rust
sync::commands::sync_push,
sync::commands::sync_pull,
sync::commands::get_sync_local_state,
sync::commands::sync_full_resync,
sync::commands::purge_synced_outbox,
sync::commands::run_garbage_collection,
sync::commands::sync_now
```

Also remove `db::drizzle_proxy::run_sql`, `db::drizzle_proxy::run_sql_batch`, `db::drizzle_proxy::get_db_info` — the plugin provides these commands.

Remove `mod sync;` and `mod db;` (if db module only contains drizzle_proxy and migrations).

### Task 5.3: Update Tauri command names in JS

**Files:**
- All files using `invoke("run_sql", ...)` → `invoke("plugin:baresync|run_sql", ...)`
- All files using `invoke("run_sql_batch", ...)` → `invoke("plugin:baresync|run_sql_batch", ...)`
- All files using `invoke("sync_push", ...)` → handled by `createSyncClient`
- All files using `invoke("sync_pull", ...)` → handled by `createSyncClient`
- All files using `invoke("sync_now", ...)` → handled by `createSyncClient`
- All files using `invoke("get_sync_local_state", ...)` → handled by `createSyncClient`

**Note:** If `createTauriDrizzleDatabase` from baresync handles the command name mapping automatically, this step may be handled by Task 4.1.

### Task 5.4: Update build.rs

**Files:**
- Modify: `apps/pos-app/src-tauri/build.rs`

Remove:
- Protobuf compilation (`prost_build` usage)
- Migration manifest generation (`generate_migration_manifest`)

Keep:
- `tauri_build::build()`
- Android linker args

```rust
fn main() {
    // Android 16KB page size
    #[cfg(target_os = "android")]
    {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }

    tauri_build::build()
}
```

### Task 5.5: Remove old Rust sync module

**Files:**
- Delete: `apps/pos-app/src-tauri/src/sync/` (entire directory, 12 files, 4,296 lines)
- Delete: `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs` (291 lines)
- Delete: `apps/pos-app/src-tauri/src/db/migrations.rs` (91 lines)
- Modify: `apps/pos-app/src-tauri/src/db/mod.rs` — remove submodule declarations

If `db/mod.rs` only contained drizzle_proxy and migrations, delete the entire `db/` module.

### Task 5.6: Remove protobuf artifacts

**Files:**
- Delete: `packages/protobuf/proto/sync.proto`
- Delete: `packages/protobuf/src/sync.ts` (generated protobuf TS types)
- Delete: `apps/api/src/sync/protobuf.generated.ts`
- Delete: `apps/api/src/sync/push-adapters.generated.ts`
- Delete: `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`
- Consider: `packages/sync-proto-generator/` — can be deleted or kept as reference

---

## Phase 6: Update Migrations

### Task 6.1: Create baresync-compatible local migration

**Files:**
- Create: `apps/pos-app/src-tauri/migrations/0001_baresync_init.sql`

The plugin expects migration SQL files. The existing `apps/pos-app/drizzle/0000_parallel_blacklash.sql` contains the full schema. Extract the baresync-relevant tables:

```sql
-- Sync infrastructure (baresync-managed)
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  synced_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sync_outbox_pending_row_unique
  ON sync_outbox (table_name, row_id) WHERE synced_at IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync_cursors (
  scope_id TEXT NOT NULL,
  last_server_watermark TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope_id)
);
--> statement-breakpoint
-- ... all business tables ...
```

**Note:** The baresync `createSyncOutboxTable()` and `createSyncCursorsTable()` may have slightly different column shapes than the current custom tables. Check the generated migration SQL from Drizzle against what baresync expects. The plugin runs migrations from these SQL files.

### Task 6.2: Update Drizzle config for local schema

**Files:**
- Modify: `apps/pos-app/drizzle.config.ts`

Ensure it references the updated `local-schema.ts` which now uses baresync helpers for sync tables.

### Task 6.3: Bundle migrations in tauri.conf.json

**Files:**
- Modify: `apps/pos-app/src-tauri/tauri.conf.json`

```json
{
  "bundle": {
    "resources": ["migrations/*.sql"]
  },
  "build": {
    "beforeBuildCommand": "bun run generate:sync",
    "beforeDevCommand": "bun run generate:sync"
  }
}
```

---

## Phase 7: Verify and Clean Up

### Task 7.1: Run full test suite

```bash
# Generator
bun run generate:sync:check

# API sync tests (updated)
bun test apps/api/src/sync/

# POS app tests
bun test apps/pos-app/src/

# Rust tests
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml

# Lint
bun x ultracite check
```

### Task 7.2: Verify Android build

```bash
cd apps/pos-app && bun run tauri android build --debug
```

Check for:
- Plugin registration in logcat: `[baresync] plugin setup`
- Successful migration on first launch
- `plugin:baresync|run_sql` command works
- Sync polling starts after login

### Task 7.3: Update logging docs

**Files:**
- Modify: `docs/knowledge/APP-LOGGING-DOCS.md` — add baresync log prefixes
- Modify: `logs/capture-adb-logcat.sh` — update `LOG_FILTER` to include `baresync`

### Task 7.4: Remove dead code

**Files to consider deleting:**
- `packages/sync-proto-generator/` — no longer needed
- `packages/protobuf/` — no longer needed
- `apps/api/src/sync/protobuf.ts` — no longer needed
- `apps/api/lib/ts-proto-plugin.ts` — if only used for sync protobuf
- Any test files that test protobuf-specific behavior

### Task 7.5: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md` — update sync-related instructions:
  - Replace protobuf generator references with `bun run generate:sync`
  - Update test commands
  - Update log investigation commands

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Baresync outbox schema differs from current | Compare shapes before migration, adapt SQL |
| Server scope model (merchant vs outlet) doesn't map to single scopeId | Use outletId as primary scopeId, pass merchantId in scope object |
| Plugin command names differ from current invoke calls | Check baresync command names, update all JS invoke calls |
| Protobuf → JSON switch breaks existing server clients | Only POS app talks to sync API, no external clients |
| `syncMeta` table removal breaks other logic | Audit all usages first, keep as local-only table if needed |
| Asset sync is separate from baresync | Keep asset upload/download code as-is, not part of this conversion |
| Existing data in `sync_outbox` / `sync_cursors` may not match new schema | Plan data migration or accept a full resync after conversion |

---

## Verification Guide

After completing all phases:

### Manual UI Steps
1. Launch POS app on desktop
2. Login with test account
3. Navigate to Menu → add a product
4. Navigate to POS → create an order
5. Check sync status indicator shows sync completing
6. Restart app → verify data persists
7. Check server DB has the new product and order

### Log Checks
```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[baresync\]|\[(JS|RUST)\] \[SYNC:'
```

### State/Database Checks
```bash
# Check local outbox is empty after sync
sqlite3 ~/.local/share/com.sakti_dev.sakti_pos/sakti_pos.db "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL;"

# Check cursor is advancing
sqlite3 ~/.local/share/com.sakti_dev.sakti_pos/sakti_pos.db "SELECT * FROM sync_cursors;"
```

### Automated Tests
```bash
bun run generate:sync:check
bun test apps/api/src/sync/
bun test apps/pos-app/src/
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml
```
