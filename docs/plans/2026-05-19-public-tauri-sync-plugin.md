# Public Tauri Sync Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the hardened Sakti POS sync layer into a public, reusable, Tauri-only, SQLite/libSQL-first sync platform with one JS package, a Rust Tauri plugin runtime, Drizzle schema helpers, and a consumer-run sync contract generator with JSON and protobuf encodings.

**Architecture:** Keep one public developer-facing JS package, but preserve internal boundaries between schema helpers, generator, local database runtime, server helpers, and Tauri runtime. Rust should be split into a pure sync engine crate and a thin Tauri plugin crate, with generated Rust mappers and embedded Drizzle migrations produced by consumer-run tooling and consumed by the plugin.

**Tech Stack:** Tauri 2, Rust 2021, sqlx SQLite, reqwest, JSON, optional prost/protobuf, Bun, TypeScript, Drizzle ORM, ts-proto, Vitest, Cargo tests, Ultracite/Biome.

---

## Product Direction

The target product is a WatermelonDB-like sync stack for Tauri apps, but more opinionated:

- Tauri-only for v1.
- SQLite/libSQL-first for v1.
- Consumer runs the generator.
- One public JS package for the developer-facing API.
- Rust runtime hidden behind a normal Tauri plugin.
- Typed sync contract generated from Drizzle schema.
- JSON encoding as the public default.
- Protobuf encoding as an optional performance mode.
- Local SQLite setup, Drizzle sqlite-proxy commands, and embedded Drizzle migration running built in.
- Row-state sync semantics built in.
- Adaptive push chunking built in.
- API/server helpers included in the JS package, but separated by export path.

This should not become a generic ORM, a generic Tauri SQLite plugin, or a database-agnostic sync engine in v1. The value is that a Tauri app can define synced Drizzle tables and get the tedious sync machinery consistently generated and enforced.

## Non-Negotiable Invariants

- Do not break the existing Sakti POS sync pipeline during extraction.
- Do not hand-edit generated sync runtime artifacts for durable changes.
- Keep `encoding: "json" | "protobuf"` as the public protocol switch.
- Keep JSON and protobuf as two encodings of the same canonical sync contract, not separate protocols.
- Keep row-state sync as the protocol default: `deleted_at`, `sync_updated_at`, `is_synced`, cursor watermarks.
- Keep deleted server rows visible through `deletedIds`, not silently filtered away.
- Keep app-side adaptive chunking with 413 split retry for both encodings.
- Keep API-side hard limits and DB bind-parameter chunking.
- Generate table insertion/update/delete order from Drizzle foreign-key metadata. Do not require consumers to manually maintain table order.
- Keep generated code as a consumer-run step, not hidden `build.rs` magic.
- Keep plugin internals testable outside Tauri.
- Keep Cloudflare Worker compatibility in limits and request sizing.
- Treat local SQLite setup and Drizzle proxy support as first-class plugin responsibilities, not Sakti app glue.
- Keep SQLite pool connection count at `1` for Drizzle sqlite-proxy transaction safety unless a verified transaction pinning strategy replaces it.
- Keep migration discovery deterministic and ordered by migration filename.
- Keep migration execution idempotent through `__drizzle_migrations`.
- Keep current log prefixes and update `logs/capture-adb-logcat.sh` whenever Sakti app runtime logging changes.

## Public API Shape

### Package Names

Use temporary internal names until publishing is decided:

- JS workspace package: `packages/sync`
- Public npm name later: `@sakti/sync`
- Rust core crate: `crates/sakti-sync-core`
- Rust Tauri plugin crate: `crates/tauri-plugin-sakti-sync`
- Optional generated Rust crate: `crates/sakti-sync-generated`

Do not rename the public package to the final npm name until we are ready for publishing metadata, docs, and semver policy.

### JS Subpath Exports

`packages/sync/package.json` should expose:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./generator": "./src/generator/index.ts",
    "./db": "./src/db/index.ts",
    "./server": "./src/server/index.ts",
    "./tauri": "./src/tauri/index.ts",
    "./limits": "./src/limits.ts"
  },
  "bin": {
    "sakti-sync": "./src/cli.ts"
  }
}
```

Default docs should use `@sakti/sync`; implementation can use `@repo/sync` until publish.

### Default Server Primitive Example

Public docs should start with low-level server primitives. This path makes the library useful without requiring the app's cloud schema and local schema to be a 1:1 logical match.

```ts
import {
  createIdempotencyGuard,
  decodeSyncRequest,
  encodeSyncResponse,
  orderPushChanges,
  validatePushEnvelope,
} from "@sakti/sync/server/primitives";

const idempotency = createIdempotencyGuard({ db });

export async function pushRoute(request: Request, session: Session) {
  const decoded = await decodeSyncRequest({
    encoding: "json",
    kind: "push",
    request,
  });

  validatePushEnvelope(decoded, {
    maxBytes: 2 * 1024 * 1024,
    maxRows: 2000,
  });

  const scope = await resolveScope({
    scopeId: decoded.body.scopeId,
    session,
  });

  if (!scope.ok) {
    return Response.json(scope.body, { status: scope.status });
  }

  const result = await idempotency.run(
    {
      clientId: decoded.body.clientId,
      idempotencyKey: decoded.body.idempotencyKey,
      requestHash: decoded.requestHash,
    },
    async () => {
      const orderedChanges = orderPushChanges({
        changes: decoded.body.changes,
        order: contract.upsertOrder,
      });

      return await pushTablesWithAppOwnedOperations({
        changes: orderedChanges,
        scope: scope.value,
        syncUpdatedAt: Date.now(),
      });
    }
  );

  return encodeSyncResponse({
    body: result,
    encoding: "json",
    kind: "push",
  });
}
```

### Optional Batteries-Included Example

Batteries-included mode is optional. Use it when cloud and local schemas are a 1:1 logical sync model and the generated operation semantics are enough.

```ts
import { createSyncClient, syncSchema, syncedTable } from "@sakti/sync";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const categories = syncedTable(
  sqliteTable("categories", {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  }),
  { scope: "merchant" }
);

export const products = syncedTable(
  sqliteTable("products", {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    categoryId: text("category_id").notNull(),
    name: text("name").notNull(),
    priceMinorUnits: integer("price_minor_units").notNull(),
  }),
  { scope: "merchant" }
);

export const schema = syncSchema({
  packageName: "example.sync.v1",
  tables: [categories, products],
});

const sync = createSyncClient({
  apiUrl: "https://api.example.com",
  encoding: "json",
  scopeId: "outlet-1",
});

await sync.initialize();
await sync.syncNow({ reason: "login" });
```

### Low-Level Consumer Example

```ts
import {
  createTauriSyncEngine,
  defineSyncContract,
  defineSyncedTable,
  generateSyncArtifacts,
} from "@sakti/sync";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const categories = defineSyncedTable({
  scope: "merchant",
  table: sqliteTable("categories", {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  }),
});

const contract = defineSyncContract({
  encoding: "json",
  packageName: "example.sync.v1",
  tables: [categories],
  limits: {
    maxPushBytes: 256 * 1024,
    maxPushRows: 2000,
  },
});

await generateSyncArtifacts(contract);

const engine = createTauriSyncEngine({
  apiUrl: "https://api.example.com",
  encoding: "json",
  scopeId: "outlet-1",
});

await engine.syncNow({ reason: "manual_refresh" });
```

### Rust Consumer Example

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sakti_sync::Builder::new()
                .api_base_url("https://api.example.com")
                .max_push_bytes(256 * 1024)
                .max_push_rows(2000)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
```

## Target Repository Layout

```text
crates/
  sakti-sync-core/
    Cargo.toml
    src/
      lib.rs
      config.rs
      cursor.rs
      db.rs
      drizzle_proxy.rs
      engine.rs
      error.rs
      http.rs
      limits.rs
      migrations.rs
      outbox.rs
      pull.rs
      push.rs
      reconcile.rs
      schema.rs
      state.rs

  tauri-plugin-sakti-sync/
    Cargo.toml
    src/
      lib.rs
      builder.rs
      commands.rs
      config.rs
      db.rs
      state.rs

packages/
  sync/
    package.json
    tsconfig.json
    src/
      index.ts
      cli.ts
      limits.ts
      schema/
        index.ts
        row-state.ts
        synced-table.ts
        contract.ts
      generator/
        index.ts
        outputs.ts
        config.ts
      db/
        index.ts
        drizzle-proxy.ts
        migrations.ts
      server/
        index.ts
        routes.ts
        service.ts
        limits.ts
        chunking.ts
      tauri/
        index.ts
        client.ts
```

Current code should move gradually from:

- `packages/sync-proto-generator` into `packages/sync/src/generator`
- `apps/pos-app/src/db/index.ts` generic Drizzle proxy wrapper into `packages/sync/src/db`
- `apps/api/src/sync` reusable pieces into `packages/sync/src/server`
- `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs` reusable local DB/proxy pieces into `crates/sakti-sync-core`
- `apps/pos-app/src-tauri/src/db/migrations.rs` migration discovery into `crates/sakti-sync-core`
- `apps/pos-app/src-tauri/src/sync` reusable Rust pieces into `crates/sakti-sync-core`
- `apps/pos-app/src-tauri/src/sync/commands.rs` Tauri-facing pieces into `crates/tauri-plugin-sakti-sync`

Keep Sakti-specific glue in the app until the reusable layer is stable.

## Protocol Encoding Scope

The public protocol switch should be exactly:

```ts
export type SyncEncoding = "json" | "protobuf";
```

Use JSON as the public default:

```ts
export const DEFAULT_SYNC_ENCODING: SyncEncoding = "json";
```

The consumer chooses an encoding in the contract and runtime config:

```ts
export default defineSyncContract({
  encoding: "json",
  packageName: "example.sync.v1",
  tables: [categories, products],
});
```

JSON and protobuf must share the same canonical shape:

- `status`
- `push`
- `pull`
- table changes
- `changedRows`
- `deletedIds`
- row-state fields
- cursor/watermark semantics
- rejected/server-wins rows

The only difference should be wire encoding and content type:

- JSON: `application/json`
- Protobuf: `application/x-protobuf`

Sakti POS can continue using protobuf during extraction. Public examples should default to JSON because it is easier to inspect, easier to integrate with existing APIs, and removes protobuf setup from the first-use path.

## Generated Table Order Scope

The sync contract generator must derive table write order from Drizzle foreign-key metadata:

- Upserts: parent tables before child tables.
- Deletes: child tables before parent tables.
- Nullable foreign keys to non-synced tables may be ignored.
- Required foreign keys to non-synced tables must fail generation with a clear error.
- Cycles must fail generation with a clear error.

The current generator already has this direction in `computeSyncTableOrder`; the public plugin should promote it into generated contract metadata:

```ts
export const SYNC_UPSERT_ORDER = ["merchants", "categories", "products"] as const;
export const SYNC_DELETE_ORDER = ["products", "categories", "merchants"] as const;
```

Rust generated artifacts should also include equivalent constants:

```rust
pub const SYNC_UPSERT_ORDER: &[&str] = &["merchants", "categories", "products"];
pub const SYNC_DELETE_ORDER: &[&str] = &["products", "categories", "merchants"];
```

The runtime should consume generated table order for:

- API push upserts.
- API soft deletes.
- App pull upserts.
- App pull deletes.
- App outbox push assembly.
- Garbage collection if table order matters.

Consumers should not manually maintain table insertion order in app code.

## Index Guidance And Generator Warnings

The library should not auto-add indexes to consumer schemas. Drizzle schema is the source of truth, and hidden schema mutation would make migrations harder to reason about.

Instead:

- Documentation must list recommended indexes for batteries-included mode.
- The generator may warn when a table is missing an obvious performance index.
- Missing performance indexes should not fail generation.
- Missing correctness metadata should fail generation.

Recommended server-side pull/status index:

```ts
index("products_sync_scope_watermark_idx").on(
  products.merchantId,
  products.syncUpdatedAt,
  products.id
);
```

For outlet-like scope columns:

```ts
index("orders_sync_scope_watermark_idx").on(
  orders.outletId,
  orders.syncUpdatedAt,
  orders.id
);
```

For local app tables, document optional indexes based on local query patterns:

```ts
index("products_local_sync_state_idx").on(
  products.isSynced,
  products.updatedAt,
  products.id
);
```

Generator warning example:

```text
[sakti-sync] products is scoped by merchant_id but has no recommended sync index:
  (merchant_id, sync_updated_at, id)
```

Generation should fail only for structural correctness issues:

- missing primary key
- missing row-state column
- missing configured scope column
- required FK points outside synced tables
- FK cycle in synced tables

## Generator Diagnostics Scope

The generator should be a preflight validator, not only a code writer. It should detect common wrong setups before generating artifacts and print actionable guidance.

Add a diagnostics model:

```ts
type SyncDiagnosticSeverity = "error" | "warning" | "info";

interface SyncDiagnostic {
  code: string;
  severity: SyncDiagnosticSeverity;
  message: string;
  table?: string;
  column?: string;
  why: string;
  fix: string;
  docs?: string;
}
```

Diagnostics should run before writing generated files. If any `error` exists, generation must stop and print all diagnostics. Warnings should print but still allow generation unless `--warnings-as-errors` is set.

CLI commands:

```bash
sakti-sync doctor
sakti-sync generate --check
sakti-sync generate --warnings-as-errors
```

Diagnostic output should be compact but useful:

```text
[sakti-sync] ERROR SYNC_SCHEMA_MISSING_SCOPE_COLUMN
Table: products
Column: merchant_id
Why: batteries-included sync needs a trusted server-side scope column for pull filters and scoped deletes.
Fix: Add merchantId: text("merchant_id").notNull() to products, or update defineSyncedTable({ scope: ... }) to point at the correct column.
Docs: docs/knowledge/PUBLIC-SYNC-PLUGIN.md#scope-mapping
```

Required error diagnostics:

- `SYNC_SCHEMA_MISSING_PRIMARY_KEY`
- `SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY`
- `SYNC_SCHEMA_MISSING_SCOPE_COLUMN`
- `SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN`
- `SYNC_SCHEMA_MISSING_DELETED_AT`
- `SYNC_SCHEMA_MISSING_SYNC_UPDATED_AT`
- `SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED`
- `SYNC_SCHEMA_REQUIRED_EXTERNAL_FK`
- `SYNC_SCHEMA_FK_CYCLE`
- `SYNC_SCHEMA_UNSUPPORTED_COLUMN_TYPE`
- `SYNC_SCHEMA_DUPLICATE_TABLE_NAME`
- `SYNC_SCHEMA_DUPLICATE_FIELD_NAME`
- `SYNC_SCHEMA_RESERVED_FIELD_REUSED`
- `SYNC_SCHEMA_PROTOBUF_FIELD_NUMBER_REUSED`
- `SYNC_SCHEMA_ENCODING_UNSUPPORTED`
- `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1`

Required warning diagnostics:

- `SYNC_INDEX_MISSING_SCOPE_WATERMARK`
- `SYNC_INDEX_MISSING_LOCAL_DIRTY`
- `SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN`
- `SYNC_SCHEMA_NO_CONFLICT_STRATEGY`
- `SYNC_SCHEMA_NO_DELETE_STRATEGY`
- `SYNC_SCHEMA_LARGE_TEXT_FIELD`
- `SYNC_SCHEMA_JSON_ONLY_FIELD`
- `SYNC_SCHEMA_BATTERIES_INCLUDED_COMPLEX_MAPPING`
- `SYNC_COMPAT_ADDITIVE_CHANGE`

The diagnostics system should check:

- table has a single string primary key unless another PK strategy is explicitly supported
- required row-state columns exist for local/API sides
- configured scope field maps to a real column
- scope column is not nullable for batteries-included generated operations
- local-only and server-only columns are excluded from the right generated artifacts
- money/minor-unit naming follows the project convention when used
- unsupported Drizzle column types fail with a fix suggestion
- FK dependency graph is valid
- required external FKs are not ignored
- recommended indexes are present or warned
- JSON and protobuf encodings can represent every synced field
- protobuf field numbers are stable and not reused when a previous manifest exists
- generated Rust identifiers do not collide with Rust keywords
- generated TypeScript identifiers do not collide with reserved names
- output paths are inside the workspace unless explicitly allowed
- generated files are stale in `--check` mode

The generator should write a small manifest to support future drift/evolution checks:

```text
sync-contract.manifest.json
```

Manifest should include:

- contract version
- generator version
- encoding
- table names
- field names
- protobuf field numbers if protobuf is enabled
- local-only/server-only columns
- scope mappings
- table order
- generated output paths

The manifest enables smarter diagnostics later, especially removed columns, renamed columns, and protobuf field reuse.

## API Implementation Helper Scope

The public JS package should reduce API implementation pain without owning the consumer's auth framework, tenant model, or custom business writes. The API side should expose exactly two levels:

- Low-level primitives.
- Batteries-included server.

Do not add a middle "operation hooks" layer for v1. It creates another abstraction to learn without being as simple as batteries-included or as flexible as primitives.

### Default: Low-Level Primitives

Low-level primitives are the default public docs path. Use this when the app wants full control over DB operations, conflict behavior, validation, and side effects.

The library still owns the tedious sync envelope pieces:

- JSON/protobuf decode and encode.
- content type handling.
- request byte and row limit validation.
- idempotency key validation.
- client ID validation.
- push request hashing.
- table ordering.
- cursor parsing and formatting.
- stable response helpers.
- known sync error mapping.
- idempotency storage through library schema.

The user owns:

- auth/session handling.
- scope lookup and authorization.
- actual table inserts, upserts, deletes, validation, and side effects.

Low-level push example:

```ts
import {
  createIdempotencyGuard,
  decodeSyncRequest,
  encodeSyncResponse,
  orderPushChanges,
  validatePushEnvelope,
} from "@sakti/sync/server/primitives";

const idempotency = createIdempotencyGuard({ db });

export async function pushRoute(request: Request, session: Session) {
  const decoded = await decodeSyncRequest({
    encoding: "json",
    kind: "push",
    request,
  });

  validatePushEnvelope(decoded, {
    maxBytes: 2 * 1024 * 1024,
    maxRows: 2000,
  });

  const scope = await resolveScope({
    scopeId: decoded.body.scopeId,
    session,
  });

  if (!scope.ok) {
    return Response.json(scope.body, { status: scope.status });
  }

  const syncUpdatedAt = Date.now();
  const result = await idempotency.run(
    {
      clientId: decoded.body.clientId,
      idempotencyKey: decoded.body.idempotencyKey,
      requestHash: decoded.requestHash,
    },
    async () => {
      const orderedChanges = orderPushChanges({
        changes: decoded.body.changes,
        order: contract.upsertOrder,
      });

      const tables = [];
      for (const tableChange of orderedChanges) {
        if (tableChange.table === "categories") {
          tables.push(await pushCategories({
            changedRows: tableChange.changedRows,
            deletedIds: tableChange.deletedIds,
            scope: scope.value,
            syncUpdatedAt,
          }));
        }

        if (tableChange.table === "products") {
          tables.push(await pushProducts({
            changedRows: tableChange.changedRows,
            deletedIds: tableChange.deletedIds,
            scope: scope.value,
            syncUpdatedAt,
          }));
        }
      }

      return {
        serverTime: new Date().toISOString(),
        tables,
      };
    }
  );

  return encodeSyncResponse({
    body: result,
    encoding: "json",
    kind: "push",
  });
}
```

The user should not pass `syncBatchRequests` into `createIdempotencyGuard`. The library should provide the internal server schema and use the standard table by convention.

Schema usage:

```ts
import { syncServerSchema } from "@sakti/sync/schema";

export const schema = {
  categories,
  products,
  ...syncServerSchema,
};
```

Idempotency usage:

```ts
const idempotency = createIdempotencyGuard({ db });
```

The guard owns:

- `sync_batch_requests` table name by default.
- request hash conflict checks.
- pending response reservation.
- duplicate retry replay.
- stable error for concurrent duplicate pushes.

The server package should also provide a safe cleanup primitive for this table:

```ts
import { cleanupSyncBatchRequests } from "@sakti/sync/server/primitives";

const result = await cleanupSyncBatchRequests({
  db,
  olderThanMs: 7 * 24 * 60 * 60 * 1000,
  limit: 1000,
});
```

This lets users create their own admin route or cron job without learning the internal table shape.

Example cron route:

```ts
export async function cleanupSyncRoute(request: Request) {
  await assertCronSecret(request);

  const result = await cleanupSyncBatchRequests({
    db,
    olderThanMs: 7 * 24 * 60 * 60 * 1000,
    limit: 1000,
  });

  return Response.json(result);
}
```

Cleanup safety rules:

- never delete rows newer than `olderThanMs`
- never delete pending/in-progress rows unless they are older than a separate stale-pending threshold
- default to conservative retention, such as 7 days
- support `dryRun: true`
- support `limit` so cron jobs do bounded work
- return counts and oldest/newest deleted timestamps
- use the library-managed `sync_batch_requests` table by convention

Optional stale-pending cleanup should be explicit:

```ts
await cleanupSyncBatchRequests({
  db,
  olderThanMs: 7 * 24 * 60 * 60 * 1000,
  stalePendingOlderThanMs: 60 * 60 * 1000,
});
```

### Optional: Batteries-Included Server

Use this when the app follows the standard row-state sync model and wants generated DB operations.

Batteries-included mode requires a 1:1 logical sync model between cloud and local schemas:

- one cloud table maps to one local table
- one cloud row maps to one local row
- synced columns have the same logical meaning on both sides
- differences are declared as local-only or server-only columns
- scope mapping is explicit in `defineSyncedTable`

Allowed differences:

- different physical column names if Drizzle property metadata maps them clearly
- local-only columns such as `isSynced`
- server-only columns such as `syncUpdatedAt`
- explicit table/field mapping added later as generator metadata

Use low-level primitives instead when the app needs:

- joins to build a synced row
- denormalized cloud data but normalized local data
- one local write becoming multiple server mutations
- one server row becoming multiple local rows
- custom workflow conflict rules
- business side effects during push or pull
- hard deletes or delete semantics that differ by table

```ts
import { createSyncServer } from "@sakti/sync/server/batteries";

const syncServer = createSyncServer({
  db,
  contract,
  encoding: "json",
  limits: {
    maxPushBytes: 2 * 1024 * 1024,
    maxPushRows: 2000,
  },

  async resolveScope({ scopeId, session }) {
    const outlet = await getOutlet(scopeId);
    if (!outlet) {
      return { ok: false, status: 404, body: { error: "Scope not found" } };
    }

    const allowed = await canAccessOutlet(session.userId, outlet.id);
    if (!allowed) {
      return { ok: false, status: 403, body: { error: "Forbidden" } };
    }

    return {
      ok: true,
      scope: {
        merchantId: outlet.merchantId,
        outletId: outlet.id,
      },
    };
  },
});
```

`resolveScope` is app-owned. The library uses the returned `scope` only through explicit table scope mappings in `defineSyncedTable`.

Example table scope mapping:

```ts
defineSyncedTable({
  table: products,
  scope: {
    source: "scope",
    field: "merchantId",
    column: products.merchantId,
  },
});
```

This lets batteries-included mode safely:

- filter pull/status rows
- force scope columns during push
- scope deletes
- keep tenant semantics fully app-owned

No public API should hardcode `merchantId`, `outletId`, `organizationId`, or any other tenant concept. The public request envelope should use a generic `scopeId`.

### Framework Adapters

Framework adapters are optional wrappers around the two levels above. The core primitives should work with Elysia, Hono, Nitro, plain Fetch handlers, or Cloudflare Workers.

Optional adapters:

- `createElysiaSyncRoutes(config)`
- `handleFetchSyncRequest(input)`

Sakti-specific code should keep only:

- `authenticated`
- `getOutletMerchantId`
- `verifyOutletAccess`
- session shape mapping
- route registration style

## Local Database Runtime Scope

The public plugin should include the local database runtime because it is one of the main sources of Tauri app setup pain:

- SQLite database path resolution.
- SQLite pool creation.
- WAL mode.
- `foreign_keys = ON`.
- busy timeout.
- Drizzle sqlite-proxy command surface.
- Batch transaction execution for Drizzle writes.
- DB info command for support and diagnostics.
- Embedded Drizzle migration discovery and execution.

The public plugin should expose these Tauri commands, with stable names or configurable prefixes:

```text
run_sql
run_sql_batch
get_db_info
run_migrations
get_migration_status
```

For backward compatibility, Sakti POS can keep using the existing command names first. Public docs can later recommend namespaced command names if Tauri plugin command collisions become a concern.

The JS package should expose a helper like this:

```ts
import { createTauriDrizzleDatabase } from "@sakti/sync/db";

export const db = createTauriDrizzleDatabase({
  schema,
  commands: {
    runSql: "run_sql",
    runSqlBatch: "run_sql_batch",
  },
});
```

The migration runner should support two modes:

- `embedded`: migrations are discovered at Rust build time and embedded with `include_str!`.
- `external`: migrations are loaded from a configured app path for development and advanced consumers.

Start with `embedded` because Sakti already uses it and it gives the most reliable mobile runtime behavior.

## Automated Simulation Testing Scope

The plugin should be testable without an Android device. Device testing should remain a final confidence check, not the primary correctness loop.

The testing strategy should follow this pyramid:

1. Contract/generator tests.
2. JS server primitive simulation.
3. Rust local engine simulation.
4. Cross-language protocol fixtures.
5. Plugin command simulation.
6. JS app invocation simulation.
7. Desktop Tauri smoke.
8. Minimal Android smoke.

Do not build a large mobile E2E suite. It will be slow, flaky, and will mostly retest logic that should be covered deterministically by server/Rust/plugin tests.

### Testing Ownership Rules

Use the lowest layer that can prove the behavior:

- Protocol shape, field mapping, table order, and drift belong in generator tests.
- Server envelope behavior belongs in JS server tests.
- Local SQLite sync behavior belongs in Rust core tests.
- Rust command names, params, and result shape belong in plugin command tests.
- UI store and toast behavior belongs in JS tests with mocked `invoke`.
- Real Tauri IPC belongs in desktop smoke tests.
- Android lifecycle/filesystem behavior belongs in a tiny Android smoke test.

Do not test sync conflict algorithms through mobile UI scripts. Test those with Rust/JS simulation fixtures.

### Tooling Choices

Use these defaults:

- Vitest/Bun for TypeScript package and app tests.
- Cargo tests for Rust core and plugin command tests.
- Shared JSON fixtures as canonical protocol fixtures.
- `tauri-driver`/WebDriver for desktop Tauri smoke tests.
- Maestro for Android smoke tests if scripted mobile checks are needed.
- Appium only if Maestro cannot cover a required native behavior.

Playwright can be useful for browser-only frontend tests, but it should not be the default Tauri desktop E2E tool unless the project intentionally opens a WebView debugging port and documents that setup.

### Selector Rules

For UI smoke tests:

- Prefer role/name queries where they are stable.
- Add `data-testid` only for durable E2E targets.
- Do not add `data-testid` everywhere.
- Do not select by CSS classes, DOM depth, or layout structure.
- Keep E2E selectors tied to user-visible workflows, not implementation details.

### State Isolation Rules

Every E2E or simulation test must own its state:

- use a temporary DB path
- use deterministic IDs
- use deterministic timestamps
- reset server DB per test or test file
- reset local DB per test or test file
- never depend on test ordering
- never depend on a previously logged-in real account

If auth is needed, use a test auth/session injection path instead of live manual login for automated tests.

### JS Server Simulation

Use Bun/Vitest with an in-memory or temporary SQLite/libSQL database. The tests should exercise the server primitives and optional batteries-included path without Elysia or a real HTTP server unless the test specifically targets an adapter.

Example location:

```text
packages/sync/src/server/__test__/simulation.test.ts
packages/sync/src/server/__test__/idempotency.test.ts
packages/sync/src/server/__test__/encoding-fixtures.test.ts
```

Minimum scenarios:

- fresh baseline pull returns categories before products
- push category and product with request order reversed still writes in generated FK order
- repeated push with same `clientId + idempotencyKey + requestHash` replays the cached response
- reused idempotency key with different body returns conflict
- cleanup deletes old completed `sync_batch_requests` rows
- cleanup dry-run reports counts without deleting
- cleanup preserves recent rows
- cleanup preserves pending rows unless `stalePendingOlderThanMs` is explicitly set
- oversized push returns `413`
- row count overflow returns `413`
- invalid cursor returns `400`
- server soft delete returns `deletedIds`
- low-level primitives let user-owned operations run without library tenant assumptions
- batteries-included path rejects unsupported or invalid scope metadata
- JSON and protobuf encodings produce equivalent decoded changes

### Rust Local Engine Simulation

Use `cargo test` against `sakti-sync-core` with temporary SQLite databases and a fake HTTP client. This should test local sync behavior without Tauri, Android, WebView, or adb.

Example location:

```text
crates/sakti-sync-core/tests/simulation.rs
crates/sakti-sync-core/tests/fixtures.rs
```

Minimum scenarios:

- fresh local DB pulls baseline rows and applies them in FK-safe order
- local offline category/product writes create outbox rows
- push reads outbox in generated order and clears accepted rows
- pull `deletedIds` soft-deletes local rows and clears stale outbox
- rejected/server-wins push rows are reconciled by follow-up pull
- adaptive chunking splits on simulated `413`
- single oversized row returns `payload_too_large_single_row`
- cursor advances only after applied rows
- local dirty rows are not overwritten unless server wins
- migration runner applies embedded migrations once
- Drizzle proxy batch rolls back on failure

### Cross-Language Fixtures

Create deterministic fixtures that both JS and Rust tests consume. This catches protocol drift without starting a device.

Example location:

```text
packages/sync/fixtures/sync/category-product-push.json
packages/sync/fixtures/sync/category-product-pull.json
packages/sync/fixtures/sync/server-delete.json
packages/sync/fixtures/sync/server-wins.json
```

For protobuf mode, generated binary fixtures may be useful, but JSON fixtures should be canonical. Protobuf tests can encode/decode from the JSON fixture and compare normalized objects.

Fixture rules:

- use stable IDs
- use stable timestamps
- include scope IDs
- include category/product FK relationship
- include one soft delete
- include one rejected/server-wins row
- include one idempotent replay case

### Simulated End-To-End Flow

The best host-only confidence test should run the full logical flow:

1. Start temporary server DB.
2. Start temporary local SQLite DB.
3. Seed server with category/product.
4. Local Rust engine pulls baseline from fake JS-compatible server responses.
5. Local inserts offline category/product and writes outbox.
6. Rust engine pushes to a fake server handler backed by the JS server primitives or shared fixtures.
7. Server DB contains pushed rows.
8. Server soft-deletes one row.
9. Rust engine pulls delete.
10. Local DB marks row deleted and has no stale pending outbox.
11. Repeat sync and confirm idempotent no-op.

If direct Rust-to-JS test orchestration becomes too heavy, use fixture-driven fake HTTP first. The key is that the local Rust engine and server JS primitives both consume the same contract fixtures.

### CI Expectations

Normal CI should run:

```bash
bun test packages/sync/src/server
bun test packages/sync/src/tauri
cargo test -p sakti-sync-core
cargo test -p tauri-plugin-sakti-sync
bun run sync-proto:check
```

Desktop Tauri smoke can be CI-optional at first. Android smoke should be opt-in/manual or run only in a dedicated mobile CI job.

## Device-Like Simulation Scope

Real device behavior cannot be fully simulated, but most device-facing plugin behavior should be covered without Android.

Add a device-like simulation layer above the core host tests:

1. Plugin command simulation.
2. JS app invocation simulation.
3. Desktop Tauri smoke test.
4. Minimal Android smoke test.

### Plugin Command Simulation

Test Tauri command functions on the host by calling command handlers with test state. These tests should verify command wiring without a mobile runtime.

Example location:

```text
crates/tauri-plugin-sakti-sync/tests/commands.rs
```

Minimum scenarios:

- `sync_now` calls the Rust core engine and returns a typed result
- `sync_push` propagates network and 413 errors correctly
- `sync_pull` applies fixture-backed rows
- `get_sync_local_state` reads cursor and dirty count
- `run_sql` executes parameterized read queries
- `run_sql_batch` commits all statements or rolls back on failure
- `run_migrations` applies embedded migrations once and skips them on second run
- `get_db_info` returns path and file size for a temp DB

### JS App Invocation Simulation

Test the JS package and Sakti app store with mocked Tauri `invoke`. This catches UI/runtime integration bugs without a WebView.

Example location:

```text
packages/sync/src/tauri/__test__/client.test.ts
apps/pos-app/src/store/__test__/sync.test.ts
apps/pos-app/src/components/__test__/sync-status.test.tsx
```

Minimum scenarios:

- `createSyncClient().syncNow()` invokes the expected command
- manual sync success returns a displayable result
- manual sync failure maps to an error state
- offline/network errors do not start duplicate sync loops
- scheduler coalesces overlapping sync requests
- cloud icon state and success toast behavior are covered in app tests

### Desktop Tauri Smoke Test

Add an optional smoke test that runs the Tauri app/plugin on the developer's desktop platform. This exercises plugin registration, command names, WebView-to-Rust IPC, and SQLite file behavior with a real Tauri runtime, but still avoids Android.

Preferred tool: `tauri-driver`/WebDriver, matching official Tauri guidance. Linux is the best initial CI target. Windows can be added later. macOS WebDriver support is weaker because WKWebView does not have the same WebDriver story.

Example location:

```text
e2e/desktop/sync-smoke.test.ts
e2e/desktop/webdriverio.conf.ts
```

Minimum desktop smoke flow:

- launch desktop Tauri app
- verify app shell renders
- inject test auth/session or use a test login flow
- confirm DB migrations completed
- trigger manual sync
- create category/product through UI or test command
- trigger sync again
- restart app
- confirm category/product still render
- clear local DB or use fresh profile
- relaunch and confirm baseline pull restores rows

This can start as a documented manual/CI-optional check. Do not block normal unit tests on desktop GUI availability.

### Minimal Android Smoke Test

Android/device testing should be reduced to lifecycle and filesystem confidence only:

- fresh install
- login or test auth injection
- trigger one sync
- confirm log prefixes
- confirm local DB has expected rows
- uninstall/reinstall once
- confirm fresh baseline pull

This is not the main correctness test. The host-only and device-like simulation suites should catch sync algorithm regressions first.

Preferred tool: Maestro for scripted Android smoke. Use Appium only if Maestro cannot reach a required native capability.

Android smoke rules:

- one or two flows only
- reset app data at the start
- use test auth/session path if available
- avoid brittle selectors
- collect `logs/app.log`
- collect a DB snapshot when the flow fails
- do not encode conflict/idempotency edge cases in Android scripts

## Phase 0: Baseline And Guardrails

**Files:**

- Read: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`
- Read: `docs/knowledge/SYNC-LIMITS.md`
- Read: `docs/knowledge/SYNC-ROW-STATE-OPERATIONS.md`
- Read: `docs/adr/0009-use-row-state-sync-watermarks.md`
- Read: `apps/pos-app/src-tauri/src/sync/*`
- Read: `apps/api/src/sync/*`
- Read: `packages/sync-proto-generator/src/*`

**Tasks:**

1. Run the current focused verification suite and record the baseline.
2. Confirm `git status --short` is clean or document existing unrelated changes.
3. Add a short extraction tracker to this plan as implementation proceeds.
4. Do not start moving files until the baseline passes.

**Verification:**

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/pos-app/src/db/__test__/sync-schema.test.ts apps/pos-app/src/store/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib sync::
bun run sync-proto:check
bun x ultracite check
```

## Phase 1: Create Package And Crate Shells

**Files:**

- Create: `packages/sync/package.json`
- Create: `packages/sync/tsconfig.json`
- Create: `packages/sync/src/index.ts`
- Create: `packages/sync/src/limits.ts`
- Create: `crates/sakti-sync-core/Cargo.toml`
- Create: `crates/sakti-sync-core/src/lib.rs`
- Create: `crates/tauri-plugin-sakti-sync/Cargo.toml`
- Create: `crates/tauri-plugin-sakti-sync/src/lib.rs`
- Modify: root `package.json`
- Create or Modify: root `Cargo.toml`
- Modify: `apps/pos-app/src-tauri/Cargo.toml`

**Tasks:**

1. Add `packages/sync` to the Bun workspace through existing `packages/*` coverage.
2. Create a root Cargo workspace with members:
   - `apps/pos-app/src-tauri`
   - `crates/sakti-sync-core`
   - `crates/tauri-plugin-sakti-sync`
3. Keep the POS app compiling as its existing crate.
4. Add empty Rust crates that compile independently.
5. Add a minimal JS package with `limits.ts` exporting current defaults:
   - `DEFAULT_POS_TARGET_PUSH_BYTES = 256 * 1024`
   - `DEFAULT_API_MAX_PUSH_BYTES = 2 * 1024 * 1024`
   - `DEFAULT_MAX_PUSH_ROWS = 2000`
   - `DEFAULT_DB_BIND_PARAMETER_BUDGET = 30_000`
6. Do not move sync behavior yet.
7. Add empty DB modules so later phases have stable import paths:
   - `packages/sync/src/db/index.ts`
   - `crates/sakti-sync-core/src/db.rs`
   - `crates/sakti-sync-core/src/drizzle_proxy.rs`
   - `crates/sakti-sync-core/src/migrations.rs`

**Verification:**

```bash
bun x ultracite check packages/sync
cargo test --workspace
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib sync::
```

## Phase 2: Extract Shared JS Sync Contract Generator Into `packages/sync`

**Files:**

- Move from: `packages/sync-proto-generator/src/*`
- Move to: `packages/sync/src/generator/*`
- Modify: `packages/sync/src/generator/index.ts`
- Modify: `packages/sync/src/cli.ts`
- Modify: `packages/protobuf/sync-proto.config.ts`
- Modify: root `package.json`
- Keep temporarily: `packages/sync-proto-generator/package.json`

**Tasks:**

1. Re-export the existing generator from `packages/sync/generator`.
2. Keep `@repo/sync-proto-generator` as a compatibility wrapper at first.
3. Move tests or duplicate targeted tests under `packages/sync/src/generator/__test__`.
4. Update the CLI so `bun packages/sync/src/cli.ts generate` can generate the same artifacts.
5. Keep `bun run sync-proto:check` passing during the transition.
6. Once stable, make `packages/sync-proto-generator` call into `@repo/sync/generator` instead of owning logic.
7. Rename public docs and code comments from "proto generator" to "sync contract generator" where they describe the public package.
8. Keep protobuf-specific filenames only for protobuf-specific generated artifacts.

**Verification:**

```bash
bun run sync-proto:check
bun test packages/sync-proto-generator/src
bun test packages/sync/src/generator
cd packages/protobuf && bun ../sync/src/cli.ts generate
bun run sync-proto:check
```

## Phase 3: Add Drizzle Row-State Schema Helpers

**Files:**

- Create: `packages/sync/src/schema/row-state.ts`
- Create: `packages/sync/src/schema/synced-table.ts`
- Create: `packages/sync/src/schema/contract.ts`
- Create: `packages/sync/src/schema/index.ts`
- Add tests: `packages/sync/src/schema/__test__/synced-table.test.ts`
- Add tests: `packages/sync/src/schema/__test__/contract.test.ts`

**Tasks:**

1. Add `defineSyncedTable(input)` for explicit metadata:
   - `table`
   - `scope: { source: "scope", field: string, column: AnyColumn }`
   - optional `conflict` metadata for batteries-included generated operations
   - optional `delete` metadata for batteries-included generated operations
   - `localOnlyColumns`
   - `serverOnlyColumns`
2. Add `syncedTable(table, options)` as the high-level alias.
3. Add `defineSyncContract(input)` and `syncSchema(input)`.
4. Add row-state helper functions that return standard Drizzle columns:
   - SQLite local row state: `deletedAt`, `isSynced`, `createdAt`, `updatedAt`
   - API row state: `deletedAt`, `syncUpdatedAt`, `createdAt`, `updatedAt`
5. Do not make the helper mutate an existing Drizzle table. Drizzle table definitions are static; the helper should compose table definitions or validate they include required columns.
6. Add validation that synced tables have:
   - primary key `id`
   - scope column
   - `deletedAt`
   - local `isSynced` for local schemas
   - API `syncUpdatedAt` for API schemas
7. Add error messages that explain the missing column and table name.
8. Add schema metadata for the library-managed server tables:
   - `syncServerSchema.syncBatchRequests`
9. Add validation rules:
   - structural correctness failures are hard errors
   - missing recommended indexes are warnings only

**API Sketch:**

```ts
export const localSyncRowState = {
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
};

export const apiSyncRowState = {
  deletedAt: text("deleted_at"),
  syncUpdatedAt: integer("sync_updated_at", { mode: "number" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const productsSyncTable = defineSyncedTable({
  table: products,
  scope: {
    source: "scope",
    field: "merchantId",
    column: products.merchantId,
  },
  conflict: {
    strategy: "client_updated_at_wins",
    column: products.updatedAt,
  },
  delete: {
    mode: "soft",
    column: products.deletedAt,
  },
});
```

**Verification:**

```bash
bun test packages/sync/src/schema
bun x ultracite check packages/sync
```

## Phase 4: Extract Local SQLite, Drizzle Proxy, And Migration Runner

**Files:**

- Move logic from: `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs`
- Move logic from: `apps/pos-app/src-tauri/src/db/migrations.rs`
- Move logic from: `apps/pos-app/src/db/index.ts`
- Move to: `crates/sakti-sync-core/src/db.rs`
- Move to: `crates/sakti-sync-core/src/drizzle_proxy.rs`
- Move to: `crates/sakti-sync-core/src/migrations.rs`
- Create: `crates/tauri-plugin-sakti-sync/src/db.rs`
- Create: `packages/sync/src/db/drizzle-proxy.ts`
- Create: `packages/sync/src/db/migrations.ts`
- Create: `packages/sync/src/db/index.ts`
- Modify: `apps/pos-app/src-tauri/build.rs`
- Modify: `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs`
- Modify: `apps/pos-app/src-tauri/src/db/migrations.rs`
- Modify: `apps/pos-app/src/db/index.ts`

**Tasks:**

1. Extract `MigrationFile` and deterministic SQL file discovery into `sakti-sync-core::migrations`.
2. Extract migration manifest types:
   - `MigrationAsset`
   - `EmbeddedMigration`
   - `MigrationStatus`
3. Extract migration runner logic:
   - create `__drizzle_migrations`
   - check applied migration by hash/name
   - split SQL by `--> statement-breakpoint`
   - run each migration inside one transaction
   - record applied migration with epoch milliseconds
4. Keep the current tolerant behavior for already-applied statements only if documented:
   - `already exists`
   - `duplicate column`
5. Add a stricter public default option:
   - `strictMigrations: true`
   - Sakti can start with `strictMigrations: false` if existing baseline migrations need compatibility.
6. Extract SQLite pool setup:
   - create DB if missing
   - WAL journal mode
   - synchronous normal
   - busy timeout
   - `foreign_keys = ON`
   - max connections `1`
7. Extract `SqlQuery`, `SqlRow`, `SqlStatement`, and `BatchResult`.
8. Extract `run_sql` behavior into a core function that accepts a pool and query.
9. Extract `run_sql_batch` behavior into a core function that runs all statements in one transaction.
10. Extract `get_db_info` core helper.
11. Add Tauri plugin commands for DB operations.
12. Add JS `createTauriDrizzleDatabase({ schema, commands })` helper that wraps `drizzle-orm/sqlite-proxy`.
13. Keep app-specific logging wrapper in Sakti, but let the public helper accept an optional logger callback.
14. Keep current Sakti `apps/pos-app/src/db/index.ts` as a thin wrapper around `@repo/sync/db`.
15. Ensure the sync engine and app data layer share the same `SqlitePool`.

**API Sketch:**

```ts
import { createTauriDrizzleDatabase } from "@sakti/sync/db";

export const db = createTauriDrizzleDatabase({
  schema,
  onQueryError(error, query) {
    dbLogger.error("query_failed", error, {
      method: query.method,
      params: query.params,
      sql: query.sql,
    });
  },
});
```

**Rust API Sketch:**

```rust
let db = LocalDatabase::connect(LocalDatabaseConfig {
    path: db_path,
    max_connections: 1,
    run_migrations_on_startup: true,
    strict_migrations: true,
}).await?;

db.run_embedded_migrations(MIGRATIONS).await?;
```

**Verification:**

```bash
cargo test -p sakti-sync-core migrations
cargo test -p sakti-sync-core drizzle_proxy
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib db::
bun test apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/db/__test__/sync-outbox.test.ts
bun test packages/sync/src/db
```

## Phase 5: Make The Generator Consume Contracts, Encodings, And Table Order

**Files:**

- Modify: `packages/sync/src/generator/config.ts`
- Create: `packages/sync/src/generator/diagnostics.ts`
- Create: `packages/sync/src/generator/manifest.ts`
- Create: `packages/sync/src/generator/doctor.ts`
- Modify: `packages/sync/src/generator/outputs.ts`
- Modify: `packages/sync/src/generator/index.ts`
- Modify: `packages/sync/src/cli.ts`
- Modify: `packages/protobuf/sync-proto.config.ts`
- Modify tests under: `packages/sync/src/generator/__test__`
- Modify tests under: `packages/sync-proto-generator/src/__test__` if compatibility wrapper remains

**Tasks:**

1. Accept `SyncContract` as the primary generator input.
2. Keep support for current `syncProtoSchemas` config shape during migration.
3. Derive:
   - table list
   - scope metadata
   - local-only columns
   - server-only columns
   - `encoding: "json" | "protobuf"`
   - protobuf package name
   - output paths
4. Derive table order from Drizzle foreign-key metadata:
   - `SYNC_UPSERT_ORDER`
   - `SYNC_DELETE_ORDER`
5. Generate JSON codec helpers for `encoding: "json"`.
6. Generate protobuf schema and mappers only for `encoding: "protobuf"` or when `protobuf` output is explicitly enabled for Sakti compatibility.
7. Generate Rust mapper output for the plugin crate path, but keep current POS output path until Phase 10.
8. Add drift tests that compare old config mode and new contract mode for the Sakti schema.
9. Add tests proving generated table order handles parent/child tables, reverse delete order, cycles, nullable external references, and required external references.
10. Add tests proving JSON and protobuf outputs use the same reflected contract.
11. Add generator diagnostics:
   - structured `SyncDiagnostic`
   - error/warning/info severity
   - actionable `why` and `fix`
   - docs link support
12. Add `sakti-sync doctor`.
13. Add `sakti-sync generate --check`.
14. Add `sakti-sync generate --warnings-as-errors`.
15. Add `sync-contract.manifest.json` output for compatibility/drift diagnostics.
16. Ensure generation stops before writing files when diagnostics contain errors.
17. Add diagnostics tests for every required error/warning code.
18. Update docs so consumer-run generation is the expected path.

**Verification:**

```bash
bun run sync-proto:check
bun test packages/sync/src/generator
bun test packages/sync/src/generator/__test__/diagnostics.test.ts
bun test packages/sync/src/generator/__test__/manifest.test.ts
bun packages/sync/src/cli.ts doctor
bun test packages/sync-proto-generator/src
```

## Phase 6: Extract Server Helpers

**Files:**

- Create: `packages/sync/src/server/index.ts`
- Create: `packages/sync/src/server/limits.ts`
- Create: `packages/sync/src/server/chunking.ts`
- Create: `packages/sync/src/server/pull.ts`
- Create: `packages/sync/src/server/push.ts`
- Create: `packages/sync/src/server/idempotency.ts`
- Create: `packages/sync/src/server/routes.ts`
- Modify: `apps/api/src/sync/chunking.ts`
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/routes.ts`

**Tasks:**

1. Extract generic constants and chunking helpers first.
2. Extract request limit validation into reusable server helpers.
3. Extract idempotency helpers that do not depend on Sakti auth or Elysia.
4. Make idempotency helpers use library-managed server schema by default:
   - `sync_batch_requests`
   - no user-provided table parameter in the common path
5. Add idempotency cleanup primitive:
   - `cleanupSyncBatchRequests({ db, olderThanMs, stalePendingOlderThanMs, limit, dryRun })`
   - safe default retention
   - bounded deletes for cron
   - no user-provided table parameter in the common path
6. Keep Sakti-specific auth, outlet lookup, and `userMerchants` access in `apps/api`.
7. Keep generated API push adapters in the app path until the generator output plan changes.
8. Add batteries-included server helper:
   - `createSyncServer`
   - `resolveScope`
   - generated DB operations
   - generated scope filters
   - 1:1 logical schema compatibility checks and documentation
9. Add low-level primitives:
   - `decodeSyncRequest`
   - `encodeSyncResponse`
   - `validatePushEnvelope`
   - `countPushRows`
   - `computeSyncRequestHash`
   - `createIdempotencyGuard`
   - `cleanupSyncBatchRequests`
   - `orderPushChanges`
   - `orderDeleteChanges`
   - `parseSyncCursor`
   - `formatSyncCursor`
   - `mapSyncError`
10. Add optional framework adapters:
   - `createElysiaSyncRoutes`
   - `handleFetchSyncRequest`
11. Support both request encodings through the same server algorithm:
   - JSON routes use `application/json`.
   - Protobuf routes use `application/x-protobuf`.
12. Make low-level primitives the default public docs path.
13. Keep low-level route handlers responsible for auth/session/scope extraction.
14. Do not require Elysia in the reusable package. Provide Elysia examples separately.

**Verification:**

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test packages/sync/src/server
bun x ultracite check packages/sync apps/api/src/sync
```

## Phase 7: Create Rust Core Engine

**Files:**

- Create: `crates/sakti-sync-core/src/config.rs`
- Create: `crates/sakti-sync-core/src/limits.rs`
- Create: `crates/sakti-sync-core/src/error.rs`
- Create: `crates/sakti-sync-core/src/engine.rs`
- Create: `crates/sakti-sync-core/src/http.rs`
- Create: `crates/sakti-sync-core/src/state.rs`
- Modify: `crates/sakti-sync-core/src/lib.rs`
- Modify: `crates/sakti-sync-core/Cargo.toml`

**Tasks:**

1. Define `SyncConfig`.
2. Define `SyncLimits`.
3. Define `SyncEngine`.
4. Define `SyncReason`.
5. Define `SyncResult`, `PushResult`, and `PullResult` or re-export extracted equivalents later.
6. Define `SyncError` with stable variants:
   - `Network`
   - `Unauthorized`
   - `PayloadTooLarge`
   - `SingleRowPayloadTooLarge`
   - `Database`
   - `Protocol`
   - `InvalidConfig`
7. Add an HTTP abstraction that can use reqwest in production and a fake client in tests.
8. Do not move current POS sync behavior yet; compile the empty engine.

**Verification:**

```bash
cargo test -p sakti-sync-core
cargo test --workspace
```

## Phase 8: Extract Rust Outbox, Schema, Cursor, And Chunking Logic

**Files:**

- Move logic from: `apps/pos-app/src-tauri/src/sync/schema.rs`
- Move logic from: `apps/pos-app/src-tauri/src/sync/outbox.rs`
- Move logic from: `apps/pos-app/src-tauri/src/sync/local_state.rs`
- Move logic from: `apps/pos-app/src-tauri/src/sync/push.rs`
- Move to: `crates/sakti-sync-core/src/schema.rs`
- Move to: `crates/sakti-sync-core/src/outbox.rs`
- Move to: `crates/sakti-sync-core/src/cursor.rs`
- Move to: `crates/sakti-sync-core/src/push.rs`

**Tasks:**

1. Extract pure functions first:
   - `camel_to_snake`
   - `snake_to_camel`
   - outbox operation coalescing
   - push chunk sizing
   - idempotency key derivation
   - 413 split retry decision logic
2. Extract DB functions after pure functions compile.
3. Replace direct `crate::db::sqlite` usage with a core-owned value conversion abstraction.
4. Keep Sakti app wrappers delegating to core functions.
5. Preserve all existing Rust tests by moving or duplicating them in core.
6. Add tests around adaptive chunk limits in core.

**Verification:**

```bash
cargo test -p sakti-sync-core outbox
cargo test -p sakti-sync-core push
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib sync::
```

## Phase 9: Extract Rust Pull And Reconciliation Logic

**Files:**

- Move logic from: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Move logic from: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Move selected DTOs from: `apps/pos-app/src-tauri/src/sync/dto.rs`
- Move to: `crates/sakti-sync-core/src/pull.rs`
- Move to: `crates/sakti-sync-core/src/reconcile.rs`

**Tasks:**

1. Extract pull cursor parsing and formatting.
2. Extract pull apply query generation.
3. Extract deleted ID reconciliation.
4. Extract rejected/server-wins outbox reconciliation.
5. Keep generated protobuf mappers injected through traits or modules so core does not depend on the Sakti app path.
6. Preserve the existing `server_wins_rejected_push_is_reconciled_by_followup_pull` test in core.
7. Add a test proving deleted IDs clear stale pending outbox rows.

**Verification:**

```bash
cargo test -p sakti-sync-core pull
cargo test -p sakti-sync-core reconcile
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib sync::
```

## Phase 10: Create Tauri Plugin Wrapper

**Files:**

- Create: `crates/tauri-plugin-sakti-sync/src/builder.rs`
- Create: `crates/tauri-plugin-sakti-sync/src/commands.rs`
- Create: `crates/tauri-plugin-sakti-sync/src/config.rs`
- Create: `crates/tauri-plugin-sakti-sync/src/state.rs`
- Modify: `crates/tauri-plugin-sakti-sync/src/lib.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src-tauri/Cargo.toml`

**Tasks:**

1. Add `Builder::new()`.
2. Add builder config for:
   - `api_base_url`
   - `max_push_bytes`
   - `max_push_rows`
   - `db_path` or app-managed pool injection
3. Register commands:
   - `run_sql`
   - `run_sql_batch`
   - `get_db_info`
   - `run_migrations`
   - `get_migration_status`
   - `sync_now`
   - `sync_push`
   - `sync_pull`
   - `sync_full_resync`
   - `get_sync_local_state`
   - `purge_synced_outbox`
   - `run_garbage_collection`
4. Keep command names compatible with the current JS app at first.
5. Wire current POS app to use the plugin while preserving existing command names.
6. Keep Sakti app-specific auth token loading and asset sync orchestration in JS, not in the plugin.

**Verification:**

```bash
cargo test -p tauri-plugin-sakti-sync
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib sync::
bun test apps/pos-app/src/store/__test__/sync.test.ts
```

## Phase 11: Generated Rust Mapper Integration

**Files:**

- Modify: `packages/sync/src/generator/rust-mapper-writer.ts`
- Modify: `packages/protobuf/sync-proto.config.ts`
- Modify generated output target from app path to plugin or generated path when stable
- Modify: `crates/sakti-sync-core/src/lib.rs`
- Modify: `crates/tauri-plugin-sakti-sync/src/lib.rs`
- Keep temporarily: `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`

**Tasks:**

1. Decide generated Rust output mode:
   - v1 internal mode: generate into consumer app path and include from plugin config.
   - later library mode: generate into `src-tauri/src/generated/sakti_sync.rs`.
2. Make core consume generated mappers through a trait or module boundary:
   - table names
   - table order
   - encoding
   - encode push changes
   - decode pull tables
3. Avoid hardcoding Sakti table names in core.
4. Keep `SYNC_TABLES` generated from contract.
5. Keep `SYNC_UPSERT_ORDER` generated from contract.
6. Keep `SYNC_DELETE_ORDER` generated from contract.
7. Keep `LOCAL_ONLY_COLUMNS` generated from contract.
8. Run generator and verify no drift.

**Verification:**

```bash
cd packages/protobuf && bun ../sync/src/cli.ts generate
bun run sync-proto:check
cargo test --workspace
```

## Phase 12: JS Tauri Client Wrapper

**Files:**

- Create: `packages/sync/src/tauri/client.ts`
- Create: `packages/sync/src/tauri/index.ts`
- Modify: `packages/sync/src/index.ts`
- Modify: `apps/pos-app/src/store/sync.ts`

**Tasks:**

1. Add `createSyncClient(config)`.
2. Wrap Tauri `invoke` calls for:
   - `syncNow`
   - `push`
   - `pull`
   - `getState`
   - `fullResync`
3. Accept `encoding?: "json" | "protobuf"` with default `"json"`.
4. Keep current Sakti JS orchestration around assets and auth.
5. Move generic sync result formatting if it is not Sakti-language-specific.
6. Keep Indonesian UI toast copy in the app, not in the public package.
7. Add browser-test-safe behavior for unit tests where Tauri IPC is unavailable.

**Verification:**

```bash
bun test packages/sync/src/tauri
bun test apps/pos-app/src/store/__test__/sync.test.ts
bun x ultracite check packages/sync apps/pos-app/src/store/sync.ts
```

## Phase 13: Host-Only Sync Simulation Harness

**Files:**

- Create: `packages/sync/fixtures/sync/category-product-push.json`
- Create: `packages/sync/fixtures/sync/category-product-pull.json`
- Create: `packages/sync/fixtures/sync/server-delete.json`
- Create: `packages/sync/fixtures/sync/server-wins.json`
- Create: `packages/sync/fixtures/sync/idempotent-replay.json`
- Create: `packages/sync/fixtures/sync/payload-too-large.json`
- Create: `packages/sync/src/server/__test__/simulation.test.ts`
- Create: `packages/sync/src/server/__test__/idempotency.test.ts`
- Create: `packages/sync/src/server/__test__/encoding-fixtures.test.ts`
- Create: `packages/sync/src/server/__test__/fixtures.ts`
- Create: `crates/sakti-sync-core/tests/simulation.rs`
- Create: `crates/sakti-sync-core/tests/fixtures.rs`
- Create: `crates/sakti-sync-core/tests/adaptive_chunking.rs`
- Modify: `crates/sakti-sync-core/Cargo.toml`
- Modify: `packages/sync/package.json`

**Tasks:**

1. Add canonical JSON fixtures for category/product sync flows.
2. Add JS server simulation tests over temporary SQLite/libSQL DBs.
3. Add Rust local engine tests over temporary SQLite DBs.
4. Add fake Rust HTTP client that returns fixture-backed responses.
5. Add tests for JSON/protobuf fixture equivalence.
6. Add idempotency replay/conflict tests using library-managed `sync_batch_requests`.
7. Add idempotency cleanup tests:
   - deletes old completed rows
   - dry-run does not delete
   - recent rows are preserved
   - pending rows are preserved by default
   - stale pending rows are deleted only with explicit stale threshold
   - bounded `limit` deletes only one page
8. Add generated table-order simulation where incoming products appear before categories but writes still apply categories first.
9. Add server delete wins simulation.
10. Add rejected/server-wins simulation.
11. Add adaptive chunking simulation with fake `413` responses.
12. Add single-row-too-large simulation.
13. Add invalid cursor simulation.
14. Add low-level primitive simulation proving user-owned operations can implement custom write behavior.
15. Add batteries-included simulation proving 1:1 schema writes work.
16. Keep these tests runnable on a normal dev machine and CI without Android, adb, Tauri WebView, or a device.

**Verification:**

```bash
bun test packages/sync/src/server/__test__/simulation.test.ts packages/sync/src/server/__test__/idempotency.test.ts packages/sync/src/server/__test__/encoding-fixtures.test.ts
cargo test -p sakti-sync-core --test simulation
cargo test -p sakti-sync-core --test adaptive_chunking
cargo test --workspace
```

## Phase 14: Device-Like Simulation Harness

**Files:**

- Create: `crates/tauri-plugin-sakti-sync/tests/commands.rs`
- Create: `packages/sync/src/tauri/__test__/client.test.ts`
- Create: `e2e/desktop/sync-smoke.test.ts`
- Create: `e2e/desktop/webdriverio.conf.ts`
- Create: `e2e/android/sync-smoke.yaml`
- Create: `e2e/README.md`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`
- Modify: `apps/pos-app/src/components/__test__/sync-status.test.tsx`
- Create: `docs/knowledge/PUBLIC-SYNC-PLUGIN-DEVICE-SIMULATION.md`
- Modify: `logs/capture-adb-logcat.sh` only if new app log prefixes are added during implementation.

**Tasks:**

1. Add host tests that call plugin command handlers with test state.
2. Add plugin command tests for sync commands, DB proxy commands, migration commands, and DB info.
3. Add JS client tests with mocked Tauri `invoke`.
4. Keep Sakti store tests covering scheduler coalescing, success/error states, and manual sync behavior.
5. Keep sync status component tests covering icon state and success toast behavior.
6. Document optional desktop Tauri smoke testing.
7. Document minimal Android smoke testing as final lifecycle/filesystem confidence only.
8. Add a desktop smoke skeleton using `tauri-driver`/WebDriver.
9. Add a Maestro Android smoke skeleton.
10. Ensure normal CI can run the command and JS simulation tests without Android, adb, or a WebView.
11. Keep desktop and Android smoke tests opt-in until CI infrastructure exists.

**Verification:**

```bash
cargo test -p tauri-plugin-sakti-sync --test commands
bun test packages/sync/src/tauri/__test__/client.test.ts
bun test apps/pos-app/src/store/__test__/sync.test.ts apps/pos-app/src/components/__test__/sync-status.test.tsx
```

Optional desktop smoke verification:

```bash
bun run e2e:desktop:sync
```

Optional Android smoke verification:

```bash
maestro test e2e/android/sync-smoke.yaml
```

## Phase 15: App Migration To Public-Like Surface

**Files:**

- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src-tauri/Cargo.toml`
- Modify: `apps/pos-app/src/store/sync.ts`
- Modify: `packages/protobuf/sync-proto.config.ts`
- Modify: `packages/database/src/local-schema.ts`
- Modify: `packages/database/src/api-schema.ts`

**Tasks:**

1. Replace direct app sync module calls with plugin calls.
2. Replace direct app Drizzle proxy wrappers with `createTauriDrizzleDatabase`.
3. Replace direct app DB init/migration runtime with plugin DB runtime.
4. Keep any Sakti-specific commands that are not generic outside the plugin.
5. Convert selected schema tables to use row-state helpers where it is low risk.
6. Do not attempt to rewrite every table in the first pass if it creates migration noise.
7. Confirm generated artifacts still match current runtime behavior.
8. Re-run manual sync flows:
   - fresh install baseline pull
   - offline create then push
   - server soft delete wins
   - rejected/server-wins reconciliation if feasible
   - manual cloud icon sync

**Verification:**

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/pos-app/src/db/__test__/sync-schema.test.ts apps/pos-app/src/store/__test__/sync.test.ts
cargo test --workspace
bun run sync-proto:check
bun x ultracite check
```

## Phase 16: Public Documentation

**Files:**

- Create: `packages/sync/README.md`
- Create: `docs/knowledge/PUBLIC-SYNC-PLUGIN.md`
- Create: `docs/knowledge/PUBLIC-SYNC-PLUGIN-GENERATOR.md`
- Create: `docs/knowledge/PUBLIC-SYNC-PLUGIN-LOCAL-DB.md`
- Create: `docs/knowledge/PUBLIC-SYNC-PLUGIN-SERVER.md`
- Create: `docs/adr/0010-public-tauri-sync-plugin.md`
- Modify: `docs/knowledge/SYNC-LIMITS.md`
- Modify: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`

**Tasks:**

1. Document product scope:
   - Tauri-only
   - SQLite/libSQL-first
   - consumer-run generation
   - JSON default encoding
   - optional protobuf encoding
   - row-state protocol
2. Document install flow:
   - npm/Bun package
   - Rust crate dependency
   - Tauri plugin registration
3. Document schema definition flow.
4. Document local DB setup:
   - SQLite path
   - WAL mode
   - migration embedding
   - Drizzle sqlite-proxy
   - transaction behavior
5. Document generator flow.
   - `doctor`
   - `generate --check`
   - `generate --warnings-as-errors`
   - diagnostic codes
   - actionable fixes
   - manifest file
6. Document generated table order:
   - FK-derived upsert order
   - reverse delete order
   - cycle and required external FK failures
7. Document server integration flow:
   - low-level primitives as the default path
   - batteries-included server as an optional shortcut
   - batteries-included 1:1 schema limitations
   - library-managed idempotency guard
   - safe `sync_batch_requests` cleanup primitive
   - cron route examples
   - Elysia adapter
   - Fetch/Cloudflare Worker handler
   - app-owned `resolveScope` callback
   - error mapping
8. Document index guidance:
   - recommended scope/watermark indexes
   - generator warnings for missing performance indexes
   - no auto-added indexes
9. Document automated testing strategy:
   - host-only JS server simulation
   - Rust local engine simulation
   - cross-language fixtures
   - plugin command simulation
   - JS mocked invoke simulation
   - desktop Tauri smoke
   - minimal Android smoke
10. Document operational limits.
11. Document compatibility/versioning policy:
   - sync contract version
   - generator version
   - generated artifact version
   - incompatible version errors
12. Document observability contract:
   - stable sync event names
   - logging hooks
   - metrics fields
   - no secrets or raw rows by default
13. Document security model:
   - untrusted `scopeId`
   - forced server-side scope fields
   - cleanup route auth requirements
   - safe SQL/proxy boundaries
14. Document schema evolution:
   - additive changes
   - dangerous changes
   - protobuf field reservations
   - JSON unknown field behavior
15. Document debugging and log expectations.
16. Document non-goals:
   - no browser runtime v1
   - no React Native v1
   - no Postgres client v1
   - no hidden build-time generation v1
17. Add ADR for the public package architecture.

**Verification:**

```bash
bun x ultracite check docs packages/sync/README.md
```

## Phase 17: Example App

**Files:**

- Create: `examples/tauri-basic-sync/package.json`
- Create: `examples/tauri-basic-sync/src-tauri/Cargo.toml`
- Create: `examples/tauri-basic-sync/src-tauri/src/lib.rs`
- Create: `examples/tauri-basic-sync/src/schema.ts`
- Create: `examples/tauri-basic-sync/sync.config.ts`
- Create: `examples/tauri-basic-sync/README.md`

**Tasks:**

1. Add a tiny example with `categories` and `products`.
2. Use low-level primitives as the main example path.
3. Use the public package API, not internal Sakti imports.
4. Default the example to `encoding: "json"`.
5. Include an optional protobuf config note.
6. Include generator command.
7. Include plugin registration.
8. Include Drizzle proxy DB setup through `createTauriDrizzleDatabase`.
9. Include embedded migration generation.
10. Include manual sync button or CLI call.
11. Add a separate batteries-included docs page/example section that explains 1:1 schema limitations.
12. Keep example server integration as a mock or documented companion until reusable server helpers are mature.

**Verification:**

```bash
bun install
bun run sync:generate
cargo test --manifest-path examples/tauri-basic-sync/src-tauri/Cargo.toml
```

## Phase 18: Publishing Readiness

**Files:**

- Modify: `packages/sync/package.json`
- Modify: `crates/sakti-sync-core/Cargo.toml`
- Modify: `crates/tauri-plugin-sakti-sync/Cargo.toml`
- Create: `packages/sync/CHANGELOG.md`
- Create: `crates/tauri-plugin-sakti-sync/README.md`
- Create: `crates/sakti-sync-core/README.md`

**Tasks:**

1. Decide final package names.
2. Add license metadata.
3. Add repository metadata.
4. Add keywords.
5. Add semver policy.
6. Add compatibility matrix:
   - Tauri 2
   - Rust 2021
   - Drizzle version
   - SQLite/libSQL
   - Bun/Node support for generator
   - JSON encoding
   - protobuf encoding
7. Mark unstable APIs clearly:
   - server helpers
   - low-level Rust extension traits
   - generated mapper trait boundary
8. Do not publish until the Sakti app runs against the extracted plugin.

**Verification:**

```bash
bun pack --dry-run packages/sync
cargo package -p sakti-sync-core --allow-dirty
cargo package -p tauri-plugin-sakti-sync --allow-dirty
```

## Compatibility And Versioning Guardrails

The public sync stack needs explicit compatibility rules before it is published. Without this, generated clients and server handlers can drift silently.

Required version identifiers:

- package version
- sync contract version
- generator version
- generated artifact version
- minimum compatible server version
- minimum compatible client/plugin version

Recommended generated metadata:

```ts
export const SYNC_CONTRACT_VERSION = "0.1.0";
export const SYNC_GENERATOR_VERSION = "0.1.0";
export const SYNC_ARTIFACT_VERSION = "0.1.0";
```

Recommended runtime behavior:

- Client sends contract/generator metadata in `status`, `push`, and `pull` requests.
- Server validates known incompatible versions before doing DB work.
- Server returns a stable error code for incompatible clients.
- The error response should be readable enough for UI/support logs.
- Minor compatible changes can warn but continue.
- Breaking changes must fail fast.

Stable error code examples:

```text
sync_contract_incompatible
sync_encoding_unsupported
sync_artifact_stale
sync_scope_invalid
sync_cursor_invalid
sync_payload_too_large
sync_idempotency_conflict
```

Do not rely only on package semver. Generated artifacts can be stale even when package versions are correct.

## Observability Guardrails

The public plugin should define stable sync events and metrics hooks. Logs are support evidence, especially for offline-first devices.

Required event categories:

- sync started
- sync completed
- sync failed
- push started
- push chunk sent
- push chunk accepted
- push chunk rejected
- push chunk split on `413`
- pull started
- pull page applied
- server-wins/rejected rows reconciled
- deleted IDs applied
- outbox rows cleared
- migration started/completed/failed
- idempotency replay/conflict/cleanup

Public JS hook:

```ts
createSyncClient({
  onSyncEvent(event) {
    logger.info(event.name, event);
  },
});
```

Rust/plugin hook should map to the same event names where practical.

Event requirements:

- stable `name`
- stable `level`
- stable `scopeId`
- stable `operationId` or sync attempt ID
- counts for rows/chunks/deletes/rejections
- duration in milliseconds where useful
- no secrets or tokens
- no raw payload rows by default

The Sakti app can keep `[JS] [SYNC:*]` and `[RUST] [SYNC:*]` prefixes, but the public package should expose structured events first and let apps decide logging format.

## Security Guardrails

Sync is security-sensitive. The library should make safe behavior easy but cannot own application authorization.

Rules:

- Treat `scopeId` as untrusted client input.
- Never trust scope/tenant fields inside incoming rows.
- Batteries-included mode must force scope columns from `resolveScope().scope`.
- Low-level docs must explicitly tell users to force scope fields in their own writes.
- Cleanup routes must require an app-owned cron secret, admin session, or equivalent authorization.
- Do not log auth tokens, session cookies, raw request bodies, or full synced rows by default.
- Validate request size before expensive decode/mapping work where possible.
- Preserve parameterized SQL for Drizzle proxy and server helpers.
- Keep `run_sql` documented as a local trusted app bridge, not a remote API.

Low-level warning that must appear in docs:

```ts
// Do not trust row.merchantId/row.workspaceId from the client.
// Force server-side scope fields from your resolved scope.
```

## Schema Evolution Guardrails

The generator should provide a clear evolution policy before public use.

Supported v1 operations:

- add nullable synced column
- add synced column with safe default
- add local-only column
- add server-only column
- add new synced table with FK-safe generated order
- add recommended indexes

Dangerous operations requiring explicit docs/review:

- remove synced column
- rename synced column
- change column type
- change table name
- change primary key semantics
- change scope column
- change conflict strategy
- change delete strategy
- reorder or reuse protobuf field numbers

For protobuf:

- reserve removed field numbers and names
- append new fields by default
- never reuse field numbers
- test old fixture decode where possible

For JSON:

- tolerate unknown fields
- document whether missing fields map to `null`, defaults, or validation errors
- keep stable field names unless a migration guide exists

For runtime compatibility:

- old clients should continue to pull data after additive changes
- old clients may ignore unknown fields
- breaking changes should fail with `sync_contract_incompatible`
- migrations must land before generated contract changes that depend on them

## Risk Register

### Risk: Extracting too much too early

Mitigation: Keep Sakti app behavior as the compatibility suite. Move pure code first, then DB functions, then Tauri commands.

### Risk: Generic API hides necessary tenant rules

Mitigation: Batteries-included helpers accept app-owned `resolveScope`; low-level primitives do not accept tenant config at all. Do not bake Sakti `userMerchants`, `merchantId`, or `outletId` into the public package.

### Risk: Low-level users still have to understand sync idempotency internals

Mitigation: Provide `createIdempotencyGuard({ db })` and `syncServerSchema.syncBatchRequests`. Do not require users to pass or manually operate on the `sync_batch_requests` table in the common path.

### Risk: API idempotency table grows forever

Mitigation: Provide `cleanupSyncBatchRequests({ db })` with conservative retention, bounded deletes, dry-run support, and explicit stale-pending cleanup. Document cron route usage.

### Risk: Cleanup deletes rows needed for safe idempotent retries

Mitigation: Default to long retention, preserve recent rows, preserve pending rows by default, and require an explicit stale-pending threshold for in-progress cleanup.

### Risk: Drizzle helper cannot truly append columns

Mitigation: Phrase the helper as composition/validation, not mutation. It can provide row-state column objects and validate synced tables include them.

### Risk: Generated Rust becomes hard to wire

Mitigation: Use a generated module boundary first. Introduce traits only when the concrete generated module compiles and tests pass.

### Risk: Public API stabilizes before internals are proven

Mitigation: Keep package private or pre-1.0 until Sakti runs through the public-like API and the example app works.

### Risk: Cloudflare Worker limits regress

Mitigation: Keep 256 KiB POS target and 2 MiB API hard request as shared constants with tests.

### Risk: Postgres expectations creep into v1

Mitigation: Document PostgreSQL as future server-adapter work only. Keep v1 SQLite/libSQL-first.

### Risk: JSON and protobuf drift into separate protocols

Mitigation: Generate both encodings from the same reflected contract and test representative rows through both codecs.

### Risk: Generated table order misses a foreign-key dependency

Mitigation: Derive order from Drizzle metadata, fail on required external references and cycles, and add tests with parent/child/grandchild schemas.

### Risk: Batteries-included generated operations perform poorly on larger tables

Mitigation: Generate concrete table adapters, not runtime reflection loops. Document recommended scope/watermark indexes and emit warnings for missing performance indexes.

### Risk: Batteries-included mode is used for non-1:1 data models

Mitigation: Make low-level primitives the default docs path. Document batteries-included as optional and limited to 1:1 logical sync models with explicit local-only/server-only differences.

### Risk: Local DB proxy becomes an unsafe SQL escape hatch

Mitigation: Treat `run_sql` as a local trusted app bridge, document that it is not a remote API, keep parameters bound, and keep batch writes transactional.

### Risk: Migration runner masks real schema drift

Mitigation: Use strict migration mode as the public default. Keep tolerant duplicate/already-exists handling only as an explicit compatibility mode.

### Risk: E2E tests become a maintenance trap

Mitigation: Keep mobile and desktop E2E as smoke tests only. Put sync correctness in deterministic JS/Rust simulations. Require state reset, stable selectors, and short critical flows for every scripted E2E.

### Risk: Desktop Tauri smoke gives false confidence for Android

Mitigation: Treat desktop smoke as IPC/plugin-registration confidence only. Keep a minimal Android smoke for lifecycle, filesystem, packaging, and logcat confidence.

### Risk: Client and server generated contracts drift silently

Mitigation: Generate contract/generator/artifact metadata and validate it in requests before DB work. Return stable incompatibility errors.

### Risk: Observability becomes app-specific and support cannot debug sync

Mitigation: Define stable sync event names and structured event fields in the public package. Let apps map those events to their own log format.

### Risk: Public users trust client-provided scope fields

Mitigation: Document `scopeId` as untrusted and require batteries-included mode to force scope columns from `resolveScope`. Low-level docs must show server-side scope stamping.

### Risk: Schema evolution breaks old clients

Mitigation: Publish schema evolution rules, reserve protobuf fields, tolerate unknown JSON fields, and fail fast on incompatible contract versions.

### Risk: Generator errors are technically correct but not actionable

Mitigation: Require every diagnostic to include `why`, `fix`, and optional docs link. Test diagnostic messages, not only error codes.

### Risk: Generator writes partial stale artifacts after validation failure

Mitigation: Run diagnostics before file writes and stop generation if any error exists. Use `generate --check` in CI.

## Definition Of Done

- Sakti POS still passes the focused sync verification suite.
- Sakti POS runs sync through `tauri-plugin-sakti-sync`.
- Sakti POS uses plugin-provided local SQLite initialization, Drizzle proxy commands, and migration runner.
- Generator can be invoked from `packages/sync`.
- Generator has `doctor`, `generate --check`, and `--warnings-as-errors` modes.
- Generator diagnostics include stable codes, severity, why, fix, and docs links.
- Generator writes and checks `sync-contract.manifest.json`.
- Existing `bun run sync-proto:check` passes.
- Generated artifacts include contract/generator/artifact version metadata.
- Runtime validates incompatible sync contract versions before DB work.
- Stable sync error codes are documented.
- Stable sync event names and observability hooks are documented.
- Security docs state `scopeId` and row scope fields are untrusted client input.
- Schema evolution policy is documented.
- Public runtime config supports `encoding: "json" | "protobuf"`.
- JSON is the public default encoding.
- Protobuf remains available as an optional encoding.
- Public API has two server levels: low-level primitives and optional batteries-included.
- Low-level primitives are the default documented API path.
- Batteries-included docs explain 1:1 logical schema limitations.
- Low-level idempotency is available through `createIdempotencyGuard({ db })` without manually passing `sync_batch_requests`.
- Idempotency cleanup is available through `cleanupSyncBatchRequests({ db })` with safe retention defaults and cron docs.
- Public schema helpers expose `syncServerSchema.syncBatchRequests`.
- Public server API is scope-agnostic and does not hardcode Sakti tenant fields.
- Generated table upsert/delete order comes from Drizzle foreign-key metadata.
- Generator warns, but does not fail, on missing recommended performance indexes.
- Host-only simulation tests cover JS server primitives, Rust local engine behavior, and shared protocol fixtures without Android/device runtime.
- Device-like simulation tests cover plugin commands and JS `invoke` behavior without Android/device runtime.
- Desktop Tauri smoke is documented and opt-in.
- Minimal Android smoke is documented and opt-in.
- Row-state schema helpers exist and are documented.
- `createTauriDrizzleDatabase` exists and wraps `drizzle-orm/sqlite-proxy`.
- Public JS subpath exports exist.
- Rust core crate has meaningful unit tests independent of Tauri.
- Tauri plugin crate registers sync and DB commands.
- Docs explain install, local DB setup, schema, generator, server, limits, and debugging.
- Example app demonstrates the intended public usage.
- No generated artifact drift is present.

## Final Full Verification

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/pos-app/src/db/__test__/sync-schema.test.ts apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/db/__test__/sync-outbox.test.ts apps/pos-app/src/store/__test__/sync.test.ts
bun test packages/sync/src
bun test packages/sync/src/server/__test__/simulation.test.ts packages/sync/src/server/__test__/idempotency.test.ts packages/sync/src/server/__test__/encoding-fixtures.test.ts
bun test packages/sync/src/tauri/__test__/client.test.ts
bun test packages/sync-proto-generator/src
cargo test --workspace
cargo test -p sakti-sync-core --test simulation
cargo test -p sakti-sync-core --test adaptive_chunking
cargo test -p tauri-plugin-sakti-sync --test commands
bun run sync-proto:check
bun x ultracite check
```

Optional smoke verification:

```bash
bun run e2e:desktop:sync
maestro test e2e/android/sync-smoke.yaml
```

## Manual Verification Guide

Use the same field-tested Sakti flows after the app migrates to the plugin:

1. Fresh install, login, confirm baseline pull restores category/product data.
2. Create category/product offline, restore API, trigger sync, confirm push succeeds.
3. Soft delete category/product on API with `deleted_at` and bumped `sync_updated_at`, reopen app, confirm server delete wins.
4. Trigger manual cloud-icon sync, confirm success toast and logs.
5. Reinstall app and confirm no duplicate synced rows.
6. Confirm pending outbox count returns to zero after successful push/pull.
7. Confirm migrations run on fresh install and are skipped on second launch.
8. Confirm Drizzle writes still use `run_sql_batch` transactions.
9. Run the example app with JSON encoding.
10. Run Sakti POS with protobuf encoding until the app is explicitly migrated.

Device testing should not be required for the main correctness loop. Run it only as final integration confidence after the host-only and device-like simulation suites pass.

Useful log checks:

```bash
logs/capture-adb-logcat.sh
grep -iE '\[RUST\] \[SYNC:TRACE\]|\[JS\] \[SYNC:|push_batch|sync_push|server_wins|payload_too_large|manual_sync' logs/app.log
grep -iE '\[RUST\] \[DB:MIGRATION|\[JS\] \[DB:|run_sql|run_sql_batch' logs/app.log
```

Useful DB checks:

```sql
SELECT table_name, row_id, operation, synced_at FROM sync_outbox WHERE synced_at IS NULL;
SELECT scope_type, scope_id, last_server_watermark FROM sync_cursors;
SELECT hash, created_at FROM __drizzle_migrations ORDER BY id;
SELECT id, name, deleted_at, is_synced FROM categories;
SELECT id, name, deleted_at, is_synced FROM products;
```

## Recommended Commit Boundaries

1. `chore(sync): add public sync package and rust workspace shells`
2. `refactor(sync): expose contract generator through sync package`
3. `feat(sync): add json and protobuf encoding contract`
4. `feat(sync): generate sync table order from drizzle foreign keys`
5. `feat(sync): add drizzle row-state schema helpers`
6. `feat(sync): extract local sqlite drizzle proxy runtime`
7. `refactor(sync): extract reusable server sync helpers`
8. `refactor(sync): extract rust sync core crate`
9. `test(sync): add host-only sync simulation harness`
10. `test(sync): add device-like plugin simulation harness`
11. `feat(sync): add tauri sync plugin wrapper`
12. `refactor(pos): run db and sync through tauri plugin`
13. `docs(sync): document public tauri sync plugin`
14. `test(sync): add public plugin example app`
