# Dumb Typed Protobuf Sync Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild typed protobuf sync around a generic, reusable, 1:1 Drizzle-to-Protobuf generator while keeping Sakti POS tenant authorization and sync-event routing outside the generator.

**Architecture:** The sync generator becomes a dumb infrastructure library: it imports explicit synced table exports, validates local/API schema drift, emits 1:1 protobuf rows, generates generic TypeScript/Rust mappers, and emits FK-safe upsert/delete order. Sakti-specific behavior moves to API-owned modules for tenant guarding and sync-event routing. Local synced tables must mirror cloud synced tables closely so protobuf can carry complete row state without field aliases or business policy.

**Tech Stack:** Bun, TypeScript, Drizzle ORM runtime reflection via `getTableConfig`, ts-proto with native `bigint`, Prost/Rust, rusqlite, Elysia API, Vitest, Cargo tests, Ultracite/Biome.

---

## Core Rules

- Use TDD for every behavior change: write failing test, run it, implement minimal code, run it green, then refactor.
- Do not use AST parsing. Use Drizzle runtime reflection only.
- Do not put `merchant`, `outlet`, `tenant`, `scope`, or Sakti table semantics in `packages/sync-proto-generator`.
- Do not hand-edit generated artifacts for durable changes.
- Generated protobuf row fields should use Drizzle property names as the typed sync contract.
- SQLite column names are used only where SQL generation needs physical database columns.
- Local synced schema and API synced schema should match structurally except explicitly configured local-only columns.
- API must still enforce tenant access before DB writes and before returning pull rows.
- Keep sync outbox as the local durable queue, but send final row state in `changed_rows`.
- Commit after each green task.

## Target Boundary

```txt
packages/database
  src/local-schema.ts
  src/api-schema.ts
  src/synced-schema.ts

packages/sync-proto-generator
  generic reflection, drift validation, proto writer, TS writer, Rust writer, order writer
  no Sakti business vocabulary

packages/protobuf/proto/sync.proto
  generated 1:1 transport schema

apps/api/src/sync
  generated protobuf adapters and generic bulk helpers
  handwritten tenant guard
  handwritten event routing
  handwritten orchestration/idempotency/pull pagination

apps/pos-app/src-tauri/src/sync
  generated protobuf/Rust row mappers
  handwritten outbox orchestration
```

## Phase 0: Baseline And Safety

### Task 1: Capture Baseline State

**Files:**
- Read: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`
- Read: `packages/sync-proto-generator/src/manifest.ts`
- Read: `packages/sync-proto-generator/src/drizzle-reflection.ts`
- Read: `apps/api/src/sync/service.ts`
- Read: `apps/api/src/sync/push-adapters.generated.ts`
- Read: `apps/pos-app/src-tauri/src/sync/schema.rs`
- Read: `apps/pos-app/src-tauri/src/sync/push.rs`

**Step 1: Run baseline generator verification**

Run:

```bash
bun run sync-proto:verify
```

Expected: PASS. If it fails, stop and fix current drift before starting the migration.

**Step 2: Run baseline API sync tests**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/chunking.test.ts
```

Expected: PASS.

**Step 3: Run baseline Rust sync tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 4: Commit only if baseline needed repair**

Run:

```bash
git status --short
```

Expected: clean. If baseline repairs were needed, commit them before continuing.

## Phase 1: Introduce Explicit Synced Schema Exports

### Task 2: Add Synced Schema Export Contract

**Files:**
- Create: `packages/database/src/synced-schema.ts`
- Test: `packages/sync-proto-generator/src/__test__/synced-schema.test.ts`

**Step 1: Write the failing test**

Add a test that imports `@repo/database/synced-schema` or the local relative path used by the package and asserts only intended synced table names are exported.

Example test intent:

```ts
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as syncedSchema from "@repo/database/synced-schema";

const EXPECTED_SYNCED_TABLES = [
  "merchants",
  "outlets",
  "registers",
  "staff",
  "categories",
  "assets",
  "products",
  "outlet_products",
  "orders",
  "order_items",
];

test("synced schema exports only runtime synced tables", () => {
  const tableNames = Object.values(syncedSchema)
    .map((table) => getTableConfig(table).name)
    .sort();

  expect(tableNames).toEqual([...EXPECTED_SYNCED_TABLES].sort());
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/synced-schema.test.ts
```

Expected: FAIL because `synced-schema.ts` or export path does not exist.

**Step 3: Implement minimal synced schema export**

Create `packages/database/src/synced-schema.ts` exporting only the synced tables from the local schema:

```ts
export {
  assets,
  categories,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
} from "./local-schema";
```

If package exports are required, update `packages/database/package.json` to expose `./synced-schema`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/synced-schema.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/database/src/synced-schema.ts packages/database/package.json packages/sync-proto-generator/src/__test__/synced-schema.test.ts
git commit -m "feat(sync): add explicit synced schema exports"
```

### Task 3: Add API Synced Schema Export Contract

**Files:**
- Create: `packages/database/src/api-synced-schema.ts`
- Test: `packages/sync-proto-generator/src/__test__/synced-schema.test.ts`

**Step 1: Write the failing test**

Extend the synced schema test to import API synced exports and assert the same SQLite table names as local synced exports.

Example:

```ts
import * as apiSyncedSchema from "@repo/database/api-synced-schema";
import * as localSyncedSchema from "@repo/database/synced-schema";

test("api and local synced schema export the same table names", () => {
  expect(getTableNames(apiSyncedSchema).sort()).toEqual(
    getTableNames(localSyncedSchema).sort()
  );
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/synced-schema.test.ts
```

Expected: FAIL because API synced schema export does not exist.

**Step 3: Implement minimal API synced schema export**

Create `packages/database/src/api-synced-schema.ts`:

```ts
export {
  assets,
  categories,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
} from "./api-schema";
```

Expose it from `packages/database/package.json` if needed.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/synced-schema.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/database/src/api-synced-schema.ts packages/database/package.json packages/sync-proto-generator/src/__test__/synced-schema.test.ts
git commit -m "feat(sync): add api synced schema exports"
```

## Phase 2: Align Local Synced Schema With Cloud Schema

### Task 4: Add Generic Schema Drift Detector

**Files:**
- Create: `packages/sync-proto-generator/src/schema-drift.ts`
- Test: `packages/sync-proto-generator/src/__test__/schema-drift.test.ts`

**Step 1: Write failing tests**

Test these behaviors using small in-test Drizzle tables:

- reports missing local column;
- reports missing API column;
- reports SQLite column name mismatch;
- reports scalar type mismatch;
- reports nullability mismatch;
- ignores configured local-only columns;
- passes when synced columns match.

Example test shape:

```ts
test("ignores configured local-only columns", () => {
  const issues = compareSyncedSchemas({
    apiTables: [apiProducts],
    localOnlyColumns: ["isSynced"],
    localTables: [localProductsWithIsSynced],
  });

  expect(issues).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/schema-drift.test.ts
```

Expected: FAIL because `compareSyncedSchemas` does not exist.

**Step 3: Implement minimal drift detector**

Implement `compareSyncedSchemas(input)` using `getTableConfig`.

Required output:

```ts
export interface SchemaDriftIssue {
  columnName?: string;
  code:
    | "missing_api_table"
    | "missing_local_table"
    | "missing_api_column"
    | "missing_local_column"
    | "type_mismatch"
    | "nullability_mismatch"
    | "primary_key_mismatch";
  message: string;
  tableName: string;
}
```

Compare by SQLite table name and SQLite column name, not Drizzle property name.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/schema-drift.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator/src/schema-drift.ts packages/sync-proto-generator/src/__test__/schema-drift.test.ts
git commit -m "feat(sync): add generic synced schema drift detector"
```

### Task 5: Enforce Local/API Synced Drift In Generator

**Files:**
- Modify: `packages/sync-proto-generator/src/cli.ts`
- Modify: `packages/sync-proto-generator/src/index.ts`
- Test: `packages/sync-proto-generator/src/__test__/drift.test.ts`

**Step 1: Write failing test**

Add a test asserting the real local/API synced schemas have no drift after ignoring local-only columns.

```ts
test("real api and local synced schemas do not drift", async () => {
  const apiSchema = await import("@repo/database/api-synced-schema");
  const localSchema = await import("@repo/database/synced-schema");

  const issues = compareSyncedSchemas({
    apiTables: Object.values(apiSchema),
    localOnlyColumns: ["isSynced"],
    localTables: Object.values(localSchema),
  });

  expect(issues).toEqual([]);
});
```

**Step 2: Run test to verify it fails if schemas currently differ**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/drift.test.ts
```

Expected: likely FAIL until local schema is aligned with API schema.

**Step 3: Align local synced schema**

Modify `packages/database/src/local-schema.ts` only where synced table shape differs from `api-schema.ts`.

Likely checks:

- `order_items.updated_at` nullability must match API/local.
- Synced table tenant columns should exist locally.
- Column names and integer/text/bool modes should match.
- Keep `isSynced` only as explicitly local-only.

Do not change local-only operational tables.

**Step 4: Add/update migrations**

Add migration files for POS local DB and API DB only if schema changes require them. Because the app is pre-launch, hard-cut migrations are acceptable, but the local development DB still needs deterministic migration behavior.

**Step 5: Run drift test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/drift.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/database packages/sync-proto-generator/src packages/sync-proto-generator/src/__test__/drift.test.ts
git commit -m "refactor(sync): align synced local and api schemas"
```

## Phase 3: Replace Manifest With Generic Generator Config

### Task 6: Add Generic Generator Config

**Files:**
- Create: `packages/sync-proto-generator/src/config.ts`
- Test: `packages/sync-proto-generator/src/__test__/config.test.ts`

**Step 1: Write failing test**

Test that config contains only generic terms.

```ts
test("sync generator config contains no Sakti business policy", () => {
  const serialized = JSON.stringify(syncGeneratorConfig);

  expect(serialized).not.toMatch(/merchant|outlet|tenant|scope/i);
  expect(syncGeneratorConfig.localOnlyColumns).toEqual(["isSynced"]);
  expect(syncGeneratorConfig.primaryKeyColumn).toBe("id");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/config.test.ts
```

Expected: FAIL because config does not exist.

**Step 3: Implement minimal config**

Create:

```ts
export const syncGeneratorConfig = {
  changeMessageSuffix: "Changes",
  changedRowsFieldName: "changed_rows",
  deletedIdsFieldName: "deleted_ids",
  localOnlyColumns: ["isSynced"],
  packageName: "sakti.sync.v1",
  primaryKeyColumn: "id",
  rowMessageSuffix: "Row",
} as const;
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/config.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator/src/config.ts packages/sync-proto-generator/src/__test__/config.test.ts
git commit -m "refactor(sync): add generic sync generator config"
```

### Task 7: Rewrite Reflection To Use Synced Schema And Generic Config

**Files:**
- Modify: `packages/sync-proto-generator/src/drizzle-reflection.ts`
- Modify: `packages/sync-proto-generator/src/index.ts`
- Test: `packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts`

**Step 1: Write failing tests**

Required tests:

- reflected tables come from exported synced schema object;
- table names derive from SQLite table names;
- row message name derives from table name, e.g. `order_items` -> `OrderItemRow`;
- change message name derives from table name, e.g. `order_items` -> `OrderItemChanges`;
- protobuf field name derives from table name, e.g. `outlet_products`;
- TypeScript property name derives mechanically, e.g. `order_items` -> `orderItems`;
- Rust field name derives mechanically, e.g. `order_items`;
- columns are ordered by Drizzle table column order;
- configured local-only columns are excluded;
- no manifest is required.

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/drizzle-reflection.test.ts
```

Expected: FAIL because reflection still requires `syncManifest`.

**Step 3: Implement minimal reflection rewrite**

Target public API:

```ts
export function reflectSyncTables(input: {
  config: SyncGeneratorConfig;
  schemaModule: Record<string, unknown>;
}): ReflectedSyncTable[];
```

Remove manifest-dependent fields from reflection input.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/drizzle-reflection.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator/src/drizzle-reflection.ts packages/sync-proto-generator/src/index.ts packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
git commit -m "refactor(sync): reflect synced tables without manifest"
```

### Task 8: Remove Manifest Dependency From CLI

**Files:**
- Modify: `packages/sync-proto-generator/src/cli.ts`
- Modify: `packages/sync-proto-generator/src/__test__/manifest.test.ts`
- Delete: `packages/sync-proto-generator/src/manifest.ts` after replacement is complete

**Step 1: Write failing CLI test**

Add or update a CLI/generator test proving `cli.ts` imports:

- `@repo/database/synced-schema`
- `@repo/database/api-synced-schema`
- `syncGeneratorConfig`

and does not import `syncManifest`.

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/index.test.ts src/__test__/manifest.test.ts
```

Expected: FAIL while CLI still depends on manifest.

**Step 3: Implement CLI rewrite**

CLI flow:

1. Import local synced schema.
2. Import API synced schema.
3. Compare drift with `localOnlyColumns`.
4. Throw readable error if drift exists.
5. Reflect local synced schema.
6. Render proto, TS mappers, API push/bulk helpers, Rust mappers, and FK order.

**Step 4: Replace manifest tests**

Delete manifest-specific tests and replace them with generic config/synced-schema/drift tests. Do not keep a test file that asserts business scope in the generator package.

**Step 5: Run tests to verify they pass**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run
```

Expected: PASS.

**Step 6: Delete manifest only after green**

Delete `packages/sync-proto-generator/src/manifest.ts`.

**Step 7: Commit**

```bash
git add packages/sync-proto-generator/src packages/database
git add -u packages/sync-proto-generator/src/manifest.ts
git commit -m "refactor(sync): remove manifest from protobuf generator"
```

## Phase 4: Generate Flat 1:1 Protobuf Contract

### Task 9: Change Proto Writer To `changed_rows`

**Files:**
- Modify: `packages/sync-proto-generator/src/proto-writer.ts`
- Test: `packages/sync-proto-generator/src/__test__/proto-writer.test.ts`
- Generated: `packages/protobuf/proto/sync.proto`

**Step 1: Write failing tests**

Tests must assert:

- each `*Changes` message has `repeated *Row changed_rows = 1;`;
- each `*Changes` message has `repeated string deleted_ids = 2;`;
- no `created =`;
- no `updated =`;
- no `json_tables`;
- row fields use DB column snake_case names;
- `int64` is used for integer columns;
- `bool` is used for boolean columns;
- `string` is used for text columns.

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/proto-writer.test.ts src/__test__/no-json-sync-contract.test.ts
```

Expected: FAIL because current proto uses `created` and `updated`.

**Step 3: Implement proto writer change**

Render changes messages as:

```proto
message ProductChanges {
  repeated ProductRow changed_rows = 1;
  repeated string deleted_ids = 2;
}
```

Keep file-level generated warning comments.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/proto-writer.test.ts src/__test__/no-json-sync-contract.test.ts
```

Expected: PASS.

**Step 5: Generate artifacts**

Run:

```bash
bun run generate:sync-proto:write
```

Expected: generated `sync.proto` contains `changed_rows`.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src/proto-writer.ts packages/sync-proto-generator/src/__test__/proto-writer.test.ts packages/protobuf/proto/sync.proto
git commit -m "refactor(sync): generate flat changed row protobuf changes"
```

### Task 10: Ensure `ts-proto` Native BigInt Is Preserved

**Files:**
- Modify: `packages/protobuf/package.json` if needed
- Test: `packages/sync-proto-generator/src/__test__/proto-compare.test.ts`

**Step 1: Write failing test**

Add a test or script assertion that protobuf generation command includes native BigInt config, e.g. `forceLong=bigint`.

**Step 2: Run test to verify it fails if config is missing**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/proto-compare.test.ts
```

Expected: FAIL if `forceLong=bigint` is not explicitly present.

**Step 3: Implement config fix**

Update protobuf package script to include `forceLong=bigint` or the equivalent current `ts-proto` option.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/proto-compare.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/protobuf/package.json packages/sync-proto-generator/src/__test__/proto-compare.test.ts
git commit -m "chore(sync): enforce native bigint protobuf generation"
```

## Phase 5: Generate Generic API Row Mappers And Bulk Applier

### Task 11: Rewrite API Mapper Writer For `changedRows`

**Files:**
- Modify: `packages/sync-proto-generator/src/ts-mapper-writer.ts`
- Test: `packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts`
- Generated: `apps/api/src/sync/protobuf.generated.ts`

**Step 1: Write failing tests**

Tests must assert:

- decode reads `changedRows`;
- encode writes `changedRows`;
- old `created` and `updated` fields are absent from generated mapper logic;
- `bigint` int64 values are converted safely at DB boundary, not silently truncated;
- nullable int64 remains null/undefined rather than becoming zero.

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/ts-mapper-writer.test.ts src/__test__/ts-mapper-compare.test.ts
```

Expected: FAIL because current writer uses `created` and `updated`.

**Step 3: Implement minimal writer rewrite**

Target internal changes shape:

```ts
export interface TableChangeSet {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
}
```

Generated decoding should map from `request.products?.changedRows`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/ts-mapper-writer.test.ts src/__test__/ts-mapper-compare.test.ts
```

Expected: PASS.

**Step 5: Generate artifacts**

Run:

```bash
bun run generate:sync-proto:write
```

Expected: `apps/api/src/sync/protobuf.generated.ts` uses `changedRows`.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src/ts-mapper-writer.ts packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts packages/sync-proto-generator/src/__test__/ts-mapper-compare.test.ts apps/api/src/sync/protobuf.generated.ts
git commit -m "refactor(sync): generate api mappers for changed rows"
```

### Task 12: Generate Generic API Bulk Applier

**Files:**
- Rename or replace: `packages/sync-proto-generator/src/api-push-adapter-writer.ts`
- Generated: `apps/api/src/sync/bulk-applier.generated.ts`
- Test: `packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts`

**Step 1: Write failing tests**

Tests must assert generated applier:

- has no `merchant`, `outlet`, `scope`, or `tenant` strings except table/column names naturally reflected from schema;
- exposes `SYNC_UPSERT_ORDER`;
- exposes `SYNC_DELETE_ORDER`;
- chunks bulk writes by bind parameter count;
- builds `ON CONFLICT(id) DO UPDATE` using SQLite `excluded.column_name`;
- excludes primary key from conflict update set;
- excludes local-only columns;
- soft-delete behavior is not generic unless explicitly selected. Prefer generic hard-delete helper plus Sakti service can choose soft-delete if needed.

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/api-push-adapter-writer.test.ts
```

Expected: FAIL because current generated adapter still contains Sakti-specific ownership behavior.

**Step 3: Implement generic writer**

The generated file should expose generic table adapters:

```ts
export interface GenericSyncTableAdapter {
  tableName: string;
  writeColumnCount: number;
  mapProtoRow(row: Record<string, unknown>): Record<string, unknown>;
  upsertRows(tx: TransactionLike, rows: Record<string, unknown>[]): Promise<void>;
  deleteRows(tx: TransactionLike, ids: string[]): Promise<void>;
}
```

Do not include tenant forcing or event routing in generated code.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/api-push-adapter-writer.test.ts
```

Expected: PASS.

**Step 5: Generate artifacts**

Run:

```bash
bun run generate:sync-proto:write
```

Expected: generated API file is generic and still typechecks.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src/api-push-adapter-writer.ts packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts apps/api/src/sync/bulk-applier.generated.ts
git add -u apps/api/src/sync/push-adapters.generated.ts
git commit -m "refactor(sync): generate generic api bulk sync applier"
```

### Task 13: Generate FK Topological Orders

**Files:**
- Create: `packages/sync-proto-generator/src/fk-order.ts`
- Create or modify writer for generated order output
- Test: `packages/sync-proto-generator/src/__test__/fk-order.test.ts`
- Generated: `apps/api/src/sync/bulk-applier.generated.ts`

**Step 1: Write failing tests**

Tests must assert:

- parent tables appear before child tables in `SYNC_UPSERT_ORDER`;
- child tables appear before parent tables in `SYNC_DELETE_ORDER`;
- cycles throw a readable error;
- unknown FK references outside synced table set are ignored only if nullable or explicitly safe;
- real synced schema order puts `orders` before `order_items`;
- real synced schema order puts `products` before `outlet_products`.

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/fk-order.test.ts
```

Expected: FAIL because generic topological sorter does not exist.

**Step 3: Implement topological sorter**

Use `getTableConfig(table).foreignKeys` if available from the current Drizzle runtime. If Drizzle's internal FK shape is unstable, isolate access in one small function with tests.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/fk-order.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator/src/fk-order.ts packages/sync-proto-generator/src/__test__/fk-order.test.ts apps/api/src/sync/bulk-applier.generated.ts
git commit -m "feat(sync): generate foreign key safe sync table order"
```

## Phase 6: Move Sakti Business Policy Into API Modules

### Task 14: Add Tenant Guard Module

**Files:**
- Create: `apps/api/src/sync/tenant-guard.ts`
- Test: `apps/api/src/sync/__test__/tenant-guard.test.ts`

**Step 1: Write failing tests**

Tests must prove:

- rows with `merchantId` different from session are rejected or overwritten according to chosen policy;
- rows with `outletId` different from session outlet are rejected or overwritten according to chosen policy;
- rows without tenant columns are allowed only if table policy says no direct tenant column;
- every synced table in generated order has tenant guard coverage;
- guard module rejects unknown synced table names.

Recommended policy:

- overwrite direct tenant columns from trusted context before write;
- reject rows whose relationship references cannot belong to context;
- never trust client tenant IDs.

**Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/api/src/sync/__test__/tenant-guard.test.ts
```

Expected: FAIL because guard module does not exist.

**Step 3: Implement minimal tenant guard**

Example public API:

```ts
export interface SyncTenantContext {
  merchantId: string;
  outletId: string;
}

export function applyTenantContextToPush(input: {
  changes: PushBatchChanges;
  context: SyncTenantContext;
}): PushBatchChanges;
```

This module may contain Sakti-specific table names and columns. That is intentional.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/sync/__test__/tenant-guard.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/tenant-guard.ts apps/api/src/sync/__test__/tenant-guard.test.ts
git commit -m "feat(sync): add api tenant guard for pushed rows"
```

### Task 15: Add Event Routing Module

**Files:**
- Create: `apps/api/src/sync/event-routing.ts`
- Test: `apps/api/src/sync/__test__/event-routing.test.ts`
- Modify: `apps/api/src/sync/service.ts`

**Step 1: Write failing tests**

Tests must assert:

- `products`, `categories`, `assets`, `staff`, `outlets`, `merchants` create merchant-visible events;
- `registers`, `outlet_products`, `orders`, `order_items` create outlet-visible events;
- every synced table in generated `SYNC_UPSERT_ORDER` has routing coverage;
- unknown table throws;
- module lives in API and generator tests assert the generator does not import it.

**Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/api/src/sync/__test__/event-routing.test.ts
```

Expected: FAIL because module does not exist.

**Step 3: Implement event routing**

Example:

```ts
export function getSyncEventRoute(input: {
  merchantId: string;
  outletId: string;
  tableName: string;
}) {
  switch (input.tableName) {
    case "registers":
    case "outlet_products":
    case "orders":
    case "order_items":
      return { scopeId: input.outletId, scopeType: "outlet" as const };
    default:
      return { scopeId: input.merchantId, scopeType: "merchant" as const };
  }
}
```

**Step 4: Wire service to event routing**

Replace current inline `getSyncEventScope` with `getSyncEventRoute`.

**Step 5: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/sync/__test__/event-routing.test.ts apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/sync/event-routing.ts apps/api/src/sync/service.ts apps/api/src/sync/__test__/event-routing.test.ts
git commit -m "refactor(sync): move event routing to api policy"
```

## Phase 7: Rewrite API Push Around Generic `changedRows`

### Task 16: Update API Service Push Types

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Test: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing tests**

Update existing service tests from `created`/`updated` to `changedRows`.

Required behaviors:

- changed rows are bulk upserted;
- deleted IDs are processed;
- newer server row rejects older client row;
- deleted row with `deletedAt` in changed row produces delete event;
- idempotency still reserves response before row writes;
- sync events still inserted after row writes;
- chunking still respects bind parameter limits.

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because service still expects `created` and `updated`.

**Step 3: Implement minimal service migration**

Change:

```ts
interface TableChangeSet {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
}
```

Processing:

1. Apply tenant guard once after decode and before writes.
2. For each table in `SYNC_UPSERT_ORDER`, process `changedRows`.
3. For deletes, use `SYNC_DELETE_ORDER` if performing hard deletes. If still soft-deleting by setting `deletedAt`, keep existing semantics but document it.
4. Use generated generic adapter for mapping/upsert/delete.
5. Use API event routing module for sync event rows.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "refactor(sync): process push changed rows through generic applier"
```

### Task 17: Update API Routes Protobuf Tests

**Files:**
- Modify: `apps/api/src/sync/routes.ts`
- Modify: `apps/api/src/sync/protobuf.ts`
- Test: `apps/api/src/sync/__test__/routes-protobuf.test.ts`
- Test: `apps/api/src/sync/__test__/protobuf.test.ts`

**Step 1: Write failing tests**

Update request/response fixtures to use `changedRows`.

Tests must assert:

- protobuf push route accepts binary payload with `changedRows`;
- decoded payload reaches service with `changedRows`;
- idempotency hash remains stable for same binary body;
- response ack remains correct or is simplified intentionally.

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: FAIL until wrappers and route code are updated.

**Step 3: Implement minimal route/protobuf wrapper updates**

Keep `apps/api/src/sync/protobuf.ts` as a thin wrapper. Do not add table-specific business logic there.

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/routes.ts apps/api/src/sync/protobuf.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/protobuf.test.ts
git commit -m "refactor(sync): update api protobuf routes for changed rows"
```

## Phase 8: Rewrite Rust Push And Pull Mappers

### Task 18: Generate Rust Row Mappers Directly From SQLite Rows

**Files:**
- Modify: `packages/sync-proto-generator/src/rust-mapper-writer.ts`
- Test: `packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts`
- Generated: `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`

**Step 1: Write failing tests**

Tests must assert generated Rust contains:

- `*_row_from_sqlite_row(row: &rusqlite::Row) -> rusqlite::Result<*Row>`;
- direct `row.get("column_name")` calls;
- no `serde_json::Value` bridge for push row mapping;
- nullable int64 maps to `Option<i64>`;
- non-null int64 maps to `i64`;
- `changed_rows` builder exists.

**Step 2: Run tests to verify they fail**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/rust-mapper-writer.test.ts src/__test__/rust-mapper-compare.test.ts
```

Expected: FAIL because current generator uses JSON bridge.

**Step 3: Implement direct Rust mapper generation**

Generate functions per table:

```rust
pub fn product_row_from_sqlite_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProductRow> {
    Ok(ProductRow {
        id: row.get("id")?,
        merchant_id: row.get("merchant_id")?,
        price_minor_units: row.get("price_minor_units")?,
        // ...
    })
}
```

**Step 4: Run tests to verify they pass**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/rust-mapper-writer.test.ts src/__test__/rust-mapper-compare.test.ts
```

Expected: PASS.

**Step 5: Generate artifacts and Rust format**

Run:

```bash
bun run generate:sync-proto:write
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src/rust-mapper-writer.ts packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts packages/sync-proto-generator/src/__test__/rust-mapper-compare.test.ts apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
git commit -m "refactor(sync): generate direct rust sqlite protobuf mappers"
```

### Task 19: Simplify Rust Push Builder To Final Row State

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/schema.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Test: `apps/pos-app/src-tauri/src/sync/mod.rs` or dedicated sync tests

**Step 1: Write failing Rust tests**

Tests must assert:

- insert outbox entry produces one `changed_rows` row;
- update outbox entry produces one `changed_rows` row;
- repeated insert/update outbox entries for same table/id produce one final row if coalescing remains;
- delete outbox entry produces `deleted_ids`;
- missing row for insert/update is skipped or converted to delete according to chosen behavior;
- generated mapper is used rather than JSON conversion.

**Step 2: Run tests to verify they fail**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: FAIL because push builder still uses `created`/`updated` and JSON bridge.

**Step 3: Implement minimal Rust push rewrite**

For each outbox row:

1. If operation is `delete`, append `row_id` to `deleted_ids`.
2. If operation is `insert` or `update`, run `SELECT * FROM {table} WHERE id = ?`.
3. Pass the row to generated `*_row_from_sqlite_row`.
4. Append to `changed_rows`.

Keep safe SQL table selection through a static generated table registry. Do not concatenate arbitrary table names from untrusted input without validation.

**Step 4: Run Rust tests to verify they pass**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync/schema.rs apps/pos-app/src-tauri/src/sync/push.rs apps/pos-app/src-tauri/src/sync/mod.rs
git commit -m "refactor(sync): push final changed rows from local outbox"
```

### Task 20: Rewrite Rust Pull Application For `changedRows`

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Test: Rust sync tests

**Step 1: Write failing Rust tests**

Tests must assert:

- pull `changed_rows` upserts full row into local SQLite;
- local `is_synced` is set to true after applying pulled row;
- stale local unsynced row is not overwritten if current LWW guard says local wins;
- `deleted_ids` marks rows deleted or deletes according to current local semantics;
- tenant columns from payload are persisted locally.

**Step 2: Run tests to verify they fail**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: FAIL until pull path understands `changed_rows`.

**Step 3: Implement minimal pull rewrite**

Use generated row-to-SQL value helpers or generate full typed upsert SQL. Preserve current LWW condition:

```sql
WHERE table.is_synced = 1 OR excluded.updated_at >= table.updated_at
```

unless a specific table uses `created_at` as its conflict timestamp.

**Step 4: Run Rust tests to verify they pass**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync/pull.rs apps/pos-app/src-tauri/src/sync/protobuf.rs apps/pos-app/src-tauri/src/sync/mod.rs
git commit -m "refactor(sync): apply pulled changed rows directly"
```

## Phase 9: API Pull And Baseline Sync

### Task 21: Update API Pull Result Shape

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Test: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing tests**

Update pull tests to expect:

- inserted/updated event rows appear under `changedRows`;
- deleted events appear under `deletedIds`;
- baseline first sync returns full authorized rows as `changedRows`;
- pagination still respects event cursor;
- needs-full-resync still works.

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL until pull result shape changes.

**Step 3: Implement minimal pull shape rewrite**

Replace `created`/`updated` accumulation with `changedRows`.

If operation distinction is still needed for ack or metrics, keep it outside protobuf payload.

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "refactor(sync): return pull changed rows"
```

## Phase 10: Cleanup Old Manifest And Created/Updated Concepts

### Task 22: Remove Old Created/Updated Transport Assumptions

**Files:**
- Search all: `packages/sync-proto-generator`, `apps/api/src/sync`, `apps/pos-app/src-tauri/src/sync`, `packages/protobuf/proto/sync.proto`
- Modify tests and docs as needed

**Step 1: Write failing contract test**

Add a test asserting generated/runtime sync transport files do not contain old transport fields:

```ts
test("sync transport does not use created updated row buckets", async () => {
  const files = [
    "packages/protobuf/proto/sync.proto",
    "apps/api/src/sync/protobuf.generated.ts",
    "apps/pos-app/src-tauri/src/sync/protobuf_generated.rs",
  ];

  for (const file of files) {
    const source = await Bun.file(file).text();
    expect(source).not.toMatch(/\bcreated\b/);
    expect(source).not.toMatch(/\bupdated\b/);
    expect(source).toContain("changed");
  }
});
```

Adjust regex to avoid legitimate `created_at`/`updated_at` column names.

**Step 2: Run test to verify it fails**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/no-json-sync-contract.test.ts
```

Expected: FAIL until old bucket logic is removed.

**Step 3: Remove stale code**

Remove:

- manifest imports;
- created/updated protobuf bucket code;
- JSON fallback tests;
- stale comparison artifacts;
- old generated adapter file names if replaced.

Do not remove `created_at` or `updated_at` DB columns.

**Step 4: Run test to verify it passes**

Run:

```bash
cd packages/sync-proto-generator && bun x vitest run src/__test__/no-json-sync-contract.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add -A packages/sync-proto-generator apps/api/src/sync apps/pos-app/src-tauri/src/sync packages/protobuf/proto/sync.proto
git commit -m "chore(sync): remove old sync transport buckets"
```

### Task 23: Update Documentation And Agent Instructions

**Files:**
- Modify: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`
- Modify: `AGENTS.md`
- Modify: `logs/capture-adb-logcat.sh` only if new log prefixes are added

**Step 1: Write docs checklist**

Docs must explain:

- generator is generic and business-agnostic;
- synced tables are selected through `packages/database/src/synced-schema.ts` and `api-synced-schema.ts`;
- protobuf row shape follows DB column names 1:1;
- `changed_rows` replaces created/updated buckets;
- API tenant guard is Sakti-specific and mandatory;
- API event routing is Sakti-specific and mandatory;
- local schema should mirror API synced schema;
- exact regeneration and verification commands.

**Step 2: Update docs**

Revise the knowledge doc and `AGENTS.md` sync section.

**Step 3: Run docs lint**

Run:

```bash
bun x ultracite check docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md AGENTS.md
```

Expected: PASS.

**Step 4: Commit**

```bash
git add docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md AGENTS.md logs/capture-adb-logcat.sh
git commit -m "docs(sync): document dumb typed protobuf sync layer"
```

## Phase 11: Full Verification

### Task 24: Regenerate And Check Drift

**Files:**
- Generated artifacts only

**Step 1: Run generator write**

Run:

```bash
bun run generate:sync-proto:write
```

Expected: no errors.

**Step 2: Run drift check**

Run:

```bash
bun run sync-proto:check
```

Expected: PASS.

**Step 3: Verify no disposable generated directories are committed**

Run:

```bash
find packages/protobuf -path '*/generated/*' -print
find packages/sync-proto-generator -path '*/generated/*' -print
```

Expected: both print nothing.

**Step 4: Commit if generator output changed**

```bash
git add packages/protobuf/proto/sync.proto apps/api/src/sync apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
git commit -m "chore(sync): regenerate flat typed protobuf artifacts"
```

### Task 25: Run Focused Automated Verification

**Files:**
- No edits expected

**Step 1: Run generator tests**

Run:

```bash
bun test packages/sync-proto-generator/src
```

Expected: PASS.

**Step 2: Run API sync tests**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/chunking.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/payload-size.test.ts apps/api/src/sync/__test__/tenant-guard.test.ts apps/api/src/sync/__test__/event-routing.test.ts
```

Expected: PASS.

**Step 3: Run API typecheck**

Run:

```bash
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 4: Run Rust sync tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 5: Run Rust format check**

Run:

```bash
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: PASS.

**Step 6: Run POS app focused tests**

Run:

```bash
bun run --cwd apps/pos-app test src/db/__test__/orders.test.ts src/db/__test__/menu.test.ts src/db/__test__/dashboard.test.ts src/store/__test__/cart.test.ts src/pages/pos/__test__/pos-utils.test.ts src/pages/pos/__test__/pos.test.tsx
```

Expected: PASS.

**Step 7: Run POS app typecheck**

Run:

```bash
bun run --cwd apps/pos-app typecheck
```

Expected: PASS.

**Step 8: Run Ultracite**

Run:

```bash
bun x ultracite check packages/sync-proto-generator/src apps/api/src/sync apps/pos-app/src-tauri/src/sync docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md AGENTS.md
```

Expected: PASS.

### Task 26: Manual Device Verification Guide

**Files:**
- Modify: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md` if this checklist is not already documented

**Manual UI Steps:**

1. Install app on a real Android device against a dev API.
2. Login/pair device to one outlet.
3. Go offline.
4. Create category, product, outlet product override, order, and order item.
5. Update product price and category name offline.
6. Soft-delete one product or category offline.
7. Go online and trigger sync.
8. Pair/login a second device or reset local DB and pull.
9. Confirm rows appear with correct tenant columns and no cross-outlet data.

**Log Checks:**

Use:

```bash
bash logs/capture-adb-logcat.sh
grep -iE '\[RUST\] \[SYNC:|\[JS\] \[SYNC:' logs/app.log
```

Expected:

- push request includes changed row counts;
- no protobuf decode error;
- no FK constraint error;
- no tenant guard rejection for valid rows;
- pull applies changed rows.

**State/Database Checks:**

Check local SQLite:

```sql
SELECT id, merchant_id, name, updated_at, is_synced FROM products ORDER BY updated_at DESC LIMIT 10;
SELECT id, outlet_id, total_minor_units, updated_at, is_synced FROM orders ORDER BY updated_at DESC LIMIT 10;
```

Check cloud DB through existing Turso/Drizzle inspection command used by the project.

Expected:

- pushed rows have server-authorized `merchant_id` / `outlet_id`;
- deleted rows have expected `deleted_at` semantics;
- `sync_events` rows route to expected merchant/outlet scope.

**Edge Cases:**

- Large offline batch: create at least 1,200 order items and verify chunking avoids bind parameter errors.
- Tenant tamper simulation: send a protobuf payload with a wrong `merchant_id` or `outlet_id` and verify API rejects or overwrites it before DB write.

**Commit:**

```bash
git add docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md
git commit -m "docs(sync): add flat protobuf device verification guide"
```

## Phase 12: Final Branch Completion

### Task 27: Full Test Suite And Final Commit

**Step 1: Run full monorepo test**

Run:

```bash
bun test packages/sync-proto-generator/src
bun run --cwd apps/api typecheck
bun run --cwd apps/pos-app typecheck
bun run --cwd apps/pos-app test
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 2: Run final status**

Run:

```bash
git status --short
```

Expected: only intended files changed, or clean if all tasks committed.

**Step 3: Final commit if needed**

```bash
git add -A
git commit -m "feat(sync): implement dumb typed protobuf sync layer"
```

**Step 4: Handoff summary**

Final response must include:

- architecture summary;
- list of generated artifacts;
- list of Sakti-specific API policy modules;
- verification commands run;
- manual device test checklist;
- known follow-ups.

## Known Follow-Ups

- Consider extracting `packages/sync-proto-generator` into a standalone package after the Sakti integration is stable.
- Add CI job for `bun run sync-proto:verify` when schema/generator/protobuf files change.
- Add a schema evolution policy before launch if any external clients exist.
- Benchmark large push payloads on real device and Turso dev database.
- Evaluate whether generated generic bulk applier can use `db.batch()` safely outside interactive transaction boundaries without weakening idempotency semantics.
