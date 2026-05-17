# Sync Typed Protobuf Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a sync-aware generator that reads the Drizzle schema plus an explicit sync manifest and produces a fully typed protobuf sync contract, with side-by-side validation against the current hand-written contract before replacing JSON row payloads.

**Architecture:** Add a reusable `packages/sync-proto-generator` package that uses Drizzle runtime reflection to extract table and column metadata, then applies a reviewed sync manifest for table inclusion, local-only columns, field aliases, transport field names, scopes, and message numbering. The generator first writes comparison artifacts under `packages/sync-proto-generator/generated/` so the team can prove equivalence with the current manual hot-table protobuf and mappers, then later switches checked-in sync files to generated output and removes `SyncJsonTableChanges` from the runtime path.

**Tech Stack:** Bun, TypeScript, Drizzle ORM runtime reflection, ts-proto, protobuf/prost, Rust/sqlx/Tauri, Elysia, Bun tests, Cargo tests, Ultracite/Biome.

---

## Current Sync Contract

The existing sync system already has the right semantic envelope but only partially typed row payloads.

- POS local writes create `sync_outbox` rows with `table_name`, `row_id`, `operation`, `scope_type`, `scope_id`, and `changed_at`.
- Rust reads unsynced outbox rows, joins them back to source tables, and coalesces multiple operations for the same row into one logical operation.
- The coalesced local shape is `TablePushChanges { created, updated, deleted_ids }`.
- Push sends typed protobuf changes for `products`, `outlet_products`, `orders`, and `order_items`.
- Push sends stringified JSON changes for `merchants`, `outlets`, `registers`, `categories`, `assets`, and `staff`.
- Pull mirrors the same split: typed hot tables and JSON fallback tables.
- Rust pull application converts row field names to local SQLite column names and marks rows `is_synced = 1`.

Important existing files:

- `packages/protobuf/proto/sync.proto`
- `packages/protobuf/package.json`
- `packages/database/src/local-schema.ts`
- `packages/database/src/api-schema.ts`
- `apps/pos-app/src-tauri/build.rs`
- `apps/pos-app/src-tauri/src/sync/mod.rs`
- `apps/pos-app/src-tauri/src/sync/schema.rs`
- `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- `apps/pos-app/src-tauri/src/sync/push.rs`
- `apps/pos-app/src-tauri/src/sync/pull.rs`
- `apps/api/src/sync/protobuf.ts`
- `apps/api/src/sync/service.ts`
- `apps/api/src/sync/routes.ts`

## Target End State

The sync transport should have no stringified JSON row payloads.

This is a hardcut migration. The app is not launched, so this plan deliberately does not preserve protobuf compatibility with older JSON-fallback sync clients. Do not mark `json_tables` as deprecated and leave it in the active contract for this feature. Delete the JSON row transport once the generated typed contract is switched on and the tests pass.

Every synced table should have:

- A generated row message, for example `ProductRow`.
- A generated change wrapper, for example `ProductChanges`.
- One field in `SyncPushBatchRequest`.
- One field in `SyncPullBatchResponse`.
- Generated TypeScript row mappers for API encode/decode.
- Generated Rust row mappers for POS push and pull translation.
- Tests that prove generated artifacts match the current hand-written hot-table contract before replacement.

The generator should not own:

- Conflict resolution.
- Event paging.
- Local outbox coalescing behavior.
- Authentication or outlet access checks.
- Business decisions about when a row is dirty.
- Asset binary upload/download behavior.

Those remain handwritten sync behavior.

## Sync Tables

The sync manifest must include only tables that actually sync:

```ts
const SYNC_TABLES = [
  "merchants",
  "outlets",
  "registers",
  "categories",
  "assets",
  "products",
  "orders",
  "order_items",
  "outlet_products",
  "staff",
] as const;
```

Local-only tables must not be generated:

```ts
const LOCAL_ONLY_TABLES = [
  "sync_meta",
  "sync_outbox",
  "sync_cursors",
  "local_asset_cache",
  "pending_product_photo_jobs",
  "pending_asset_processing_jobs",
] as const;
```

## Field Rules

Global rules:

- Exclude `isSynced` / `is_synced` from the transport contract.
- Keep `id`, `created_at`, `updated_at`, and `deleted_at` where they exist.
- Use proto field names in `snake_case`.
- Generate TypeScript properties through ts-proto as `camelCase`.
- Generate Rust prost fields in `snake_case`.
- Map Drizzle `text` to protobuf `string`.
- Map Drizzle `integer({ mode: "boolean" })` to protobuf `bool`.
- Map all other Drizzle `integer` columns to protobuf `int64` unless explicitly overridden.
- Do not generate `optional` fields in phase 1. Use proto3 scalar defaults and keep existing runtime behavior.

Per-field semantic aliases:

```ts
const FIELD_ALIASES = {
  products: {
    price: { protoName: "price_minor_units", protoType: "int64" },
  },
  outlet_products: {
    price: { protoName: "price_minor_units", protoType: "int64" },
  },
  orders: {
    total: { protoName: "total_minor_units", protoType: "int64" },
    amountPaid: { protoName: "amount_paid_minor_units", protoType: "int64" },
    changeAmount: { protoName: "change_amount_minor_units", protoType: "int64" },
  },
  order_items: {
    unitPrice: { protoName: "unit_price_minor_units", protoType: "int64" },
    originalPrice: { protoName: "original_price_minor_units", protoType: "int64" },
    subtotal: { protoName: "subtotal_minor_units", protoType: "int64" },
  },
} as const;
```

Field numbering rule:

- Existing manually typed field numbers for hot tables must be preserved exactly.
- New tables receive deterministic field numbers by manifest order.
- Request/response table field numbers must use reserved ranges:
  - `1-9`: envelope fields and legacy compatibility during migration.
  - `10-99`: typed table changes.
  - `100-199`: future typed metadata fields.

## Migration Phases

1. Add generator package and tests.
2. Add sync manifest and schema reflection.
3. Generate side-by-side artifacts under `packages/sync-proto-generator/generated/`.
4. Cross-compare generated hot-table proto/mappers against current manual artifacts.
5. Reconcile generator output until the comparison is approved.
6. Switch `packages/protobuf/proto/sync.proto` to generated typed output.
7. Regenerate ts-proto and prost outputs.
8. Replace API and Rust JSON fallback mapping with generated typed mappers.
9. Remove runtime JSON row payloads from push and pull.
10. Remove compatibility code only after tests and manual sync verification pass.

## Task 1: Create Generator Package Skeleton

**Files:**

- Create: `packages/sync-proto-generator/package.json`
- Create: `packages/sync-proto-generator/tsconfig.json`
- Create: `packages/sync-proto-generator/src/index.ts`
- Create: `packages/sync-proto-generator/src/__test__/index.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

Create `packages/sync-proto-generator/src/__test__/index.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { generatorVersion } from "../index";

describe("sync proto generator package", () => {
  test("exports a generator version", () => {
    expect(generatorVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/index.test.ts
```

Expected: FAIL because the package and export do not exist.

**Step 3: Add package files**

Create `packages/sync-proto-generator/package.json`:

```json
{
  "name": "@repo/sync-proto-generator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test src",
    "typecheck": "tsc --noEmit",
    "generate:compare": "bun run src/cli.ts --mode compare",
    "generate:write": "bun run src/cli.ts --mode write"
  },
  "dependencies": {
    "@repo/database": "*",
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "@repo/typescript-config": "*",
    "typescript": "5.9.2"
  }
}
```

Create `packages/sync-proto-generator/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/sync-proto-generator/src/index.ts`:

```ts
export const generatorVersion = "0.1.0";
```

Modify root `package.json` scripts:

```json
"generate:sync-proto:compare": "bun --cwd packages/sync-proto-generator run generate:compare",
"generate:sync-proto:write": "bun --cwd packages/sync-proto-generator run generate:write"
```

**Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/index.test.ts
```

Expected: PASS.

**Step 5: Run typecheck**

Run:

```bash
bun --cwd packages/sync-proto-generator run typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add package.json packages/sync-proto-generator
git commit -m "feat(sync): add sync proto generator package"
```

## Task 2: Add Explicit Sync Manifest

**Files:**

- Create: `packages/sync-proto-generator/src/manifest.ts`
- Create: `packages/sync-proto-generator/src/__test__/manifest.test.ts`
- Modify: `packages/sync-proto-generator/src/index.ts`

**Step 1: Write failing tests**

Create `packages/sync-proto-generator/src/__test__/manifest.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { syncManifest } from "../manifest";

describe("sync manifest", () => {
  test("contains exactly the runtime sync tables", () => {
    expect(syncManifest.tables.map((table) => table.tableName)).toEqual([
      "merchants",
      "outlets",
      "registers",
      "categories",
      "assets",
      "products",
      "orders",
      "order_items",
      "outlet_products",
      "staff",
    ]);
  });

  test("excludes local-only columns globally", () => {
    expect(syncManifest.globalExcludeColumns).toEqual(["isSynced"]);
  });

  test("preserves current hot-table message names", () => {
    expect(
      syncManifest.tables
        .filter((table) => table.currentlyManualTyped)
        .map((table) => table.rowMessageName)
    ).toEqual(["ProductRow", "OrderRow", "OrderItemRow", "OutletProductRow"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/manifest.test.ts
```

Expected: FAIL because `manifest.ts` does not exist.

**Step 3: Implement manifest**

Create `packages/sync-proto-generator/src/manifest.ts`:

```ts
export type SyncScope = "merchant" | "outlet";

export interface FieldAlias {
  protoName: string;
  protoType: "bool" | "int64" | "string";
}

export interface SyncTableManifest {
  changeMessageName: string;
  currentlyManualTyped: boolean;
  fieldAliases?: Record<string, FieldAlias>;
  rowMessageName: string;
  scope: SyncScope;
  tableName: string;
}

export interface SyncManifest {
  globalExcludeColumns: string[];
  packageName: string;
  requestTypedFieldStart: number;
  tables: SyncTableManifest[];
}

export const syncManifest: SyncManifest = {
  globalExcludeColumns: ["isSynced"],
  packageName: "sakti.sync.v1",
  requestTypedFieldStart: 10,
  tables: [
    {
      changeMessageName: "MerchantChanges",
      currentlyManualTyped: false,
      rowMessageName: "MerchantRow",
      scope: "merchant",
      tableName: "merchants",
    },
    {
      changeMessageName: "OutletChanges",
      currentlyManualTyped: false,
      rowMessageName: "OutletRow",
      scope: "merchant",
      tableName: "outlets",
    },
    {
      changeMessageName: "RegisterChanges",
      currentlyManualTyped: false,
      rowMessageName: "RegisterRow",
      scope: "outlet",
      tableName: "registers",
    },
    {
      changeMessageName: "CategoryChanges",
      currentlyManualTyped: false,
      rowMessageName: "CategoryRow",
      scope: "merchant",
      tableName: "categories",
    },
    {
      changeMessageName: "AssetChanges",
      currentlyManualTyped: false,
      rowMessageName: "AssetRow",
      scope: "merchant",
      tableName: "assets",
    },
    {
      changeMessageName: "ProductChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        price: { protoName: "price_minor_units", protoType: "int64" },
      },
      rowMessageName: "ProductRow",
      scope: "merchant",
      tableName: "products",
    },
    {
      changeMessageName: "OrderChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        amountPaid: { protoName: "amount_paid_minor_units", protoType: "int64" },
        changeAmount: { protoName: "change_amount_minor_units", protoType: "int64" },
        total: { protoName: "total_minor_units", protoType: "int64" },
      },
      rowMessageName: "OrderRow",
      scope: "outlet",
      tableName: "orders",
    },
    {
      changeMessageName: "OrderItemChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        originalPrice: { protoName: "original_price_minor_units", protoType: "int64" },
        subtotal: { protoName: "subtotal_minor_units", protoType: "int64" },
        unitPrice: { protoName: "unit_price_minor_units", protoType: "int64" },
      },
      rowMessageName: "OrderItemRow",
      scope: "outlet",
      tableName: "order_items",
    },
    {
      changeMessageName: "OutletProductChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        price: { protoName: "price_minor_units", protoType: "int64" },
      },
      rowMessageName: "OutletProductRow",
      scope: "outlet",
      tableName: "outlet_products",
    },
    {
      changeMessageName: "StaffChanges",
      currentlyManualTyped: false,
      rowMessageName: "StaffRow",
      scope: "merchant",
      tableName: "staff",
    },
  ],
};
```

Modify `packages/sync-proto-generator/src/index.ts`:

```ts
export { syncManifest } from "./manifest";
export const generatorVersion = "0.1.0";
```

**Step 4: Run tests**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/manifest.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator/src
git commit -m "feat(sync): define typed sync manifest"
```

## Task 3: Reflect Drizzle Tables at Runtime

**Files:**

- Create: `packages/sync-proto-generator/src/drizzle-reflection.ts`
- Create: `packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts`
- Modify: `packages/sync-proto-generator/src/index.ts`

**Step 1: Write failing tests**

Create `packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import * as localSchema from "@repo/database";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";

describe("Drizzle runtime reflection", () => {
  test("reflects all manifest tables from local schema", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);

    expect(tables.map((table) => table.tableName)).toEqual(
      syncManifest.tables.map((table) => table.tableName)
    );
  });

  test("reflects product columns without local-only isSynced", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const products = tables.find((table) => table.tableName === "products");

    expect(products?.columns.map((column) => column.propertyName)).toContain("price");
    expect(products?.columns.map((column) => column.propertyName)).not.toContain("isSynced");
  });

  test("detects Drizzle boolean integer mode", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const products = tables.find((table) => table.tableName === "products");
    const isActive = products?.columns.find((column) => column.propertyName === "isActive");

    expect(isActive?.protoType).toBe("bool");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
```

Expected: FAIL because reflection module does not exist.

**Step 3: Implement runtime reflection**

Create `packages/sync-proto-generator/src/drizzle-reflection.ts`:

```ts
import { getTableConfig, type AnySQLiteTable } from "drizzle-orm/sqlite-core";
import type { SyncManifest } from "./manifest";

export type ProtoScalarType = "bool" | "int64" | "string";

export interface ReflectedColumn {
  columnName: string;
  notNull: boolean;
  propertyName: string;
  protoName: string;
  protoType: ProtoScalarType;
}

export interface ReflectedSyncTable {
  changeMessageName: string;
  columns: ReflectedColumn[];
  rowMessageName: string;
  tableName: string;
}

function isSQLiteTable(value: unknown): value is AnySQLiteTable {
  if (!value || typeof value !== "object") {
    return false;
  }
  try {
    getTableConfig(value as AnySQLiteTable);
    return true;
  } catch {
    return false;
  }
}

function getColumnPropertyName(table: AnySQLiteTable, column: unknown): string {
  const columns = table as unknown as Record<string, unknown>;
  for (const [propertyName, candidate] of Object.entries(columns)) {
    if (candidate === column) {
      return propertyName;
    }
  }
  throw new Error("Unable to resolve Drizzle column property name");
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function inferProtoType(column: unknown): ProtoScalarType {
  const config = column as {
    dataType?: string;
    mode?: string;
  };

  if (config.dataType === "boolean" || config.mode === "boolean") {
    return "bool";
  }

  if (config.dataType === "number" || config.dataType === "bigint") {
    return "int64";
  }

  return "string";
}

export function reflectSyncTables(
  schemaModule: Record<string, unknown>,
  manifest: SyncManifest
): ReflectedSyncTable[] {
  const schemaTables = Object.values(schemaModule).filter(isSQLiteTable);

  return manifest.tables.map((manifestTable) => {
    const table = schemaTables.find(
      (schemaTable) => getTableConfig(schemaTable).name === manifestTable.tableName
    );
    if (!table) {
      throw new Error(`Missing Drizzle table for sync table ${manifestTable.tableName}`);
    }

    const tableConfig = getTableConfig(table);
    const columns = tableConfig.columns
      .map((column) => {
        const propertyName = getColumnPropertyName(table, column);
        const alias = manifestTable.fieldAliases?.[propertyName];
        return {
          columnName: column.name,
          notNull: column.notNull,
          propertyName,
          protoName: alias?.protoName ?? camelToSnake(propertyName),
          protoType: alias?.protoType ?? inferProtoType(column),
        };
      })
      .filter(
        (column) => !manifest.globalExcludeColumns.includes(column.propertyName)
      );

    return {
      changeMessageName: manifestTable.changeMessageName,
      columns,
      rowMessageName: manifestTable.rowMessageName,
      tableName: manifestTable.tableName,
    };
  });
}
```

**Step 4: Run test**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
```

Expected: PASS.

**Step 5: Run typecheck**

Run:

```bash
bun --cwd packages/sync-proto-generator run typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src
git commit -m "feat(sync): reflect sync tables from drizzle schema"
```

## Task 4: Generate Row and Changes Proto Messages

**Files:**

- Create: `packages/sync-proto-generator/src/proto-writer.ts`
- Create: `packages/sync-proto-generator/src/__test__/proto-writer.test.ts`
- Modify: `packages/sync-proto-generator/src/index.ts`

**Step 1: Write failing tests**

Create `packages/sync-proto-generator/src/__test__/proto-writer.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import * as localSchema from "@repo/database";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderSyncProto } from "../proto-writer";

describe("proto writer", () => {
  test("renders product row with current manual field names", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const proto = renderSyncProto(syncManifest, tables);

    expect(proto).toContain("message ProductRow");
    expect(proto).toContain("string merchant_id = 2;");
    expect(proto).toContain("int64 price_minor_units = 5;");
    expect(proto).toContain("string image_asset_id = 7;");
  });

  test("renders change wrappers for every sync table", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const proto = renderSyncProto(syncManifest, tables);

    expect(proto).toContain("message StaffChanges");
    expect(proto).toContain("repeated StaffRow created = 1;");
    expect(proto).toContain("repeated StaffRow updated = 2;");
    expect(proto).toContain("repeated string deleted_ids = 3;");
  });

  test("does not render SyncJsonTableChanges", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const proto = renderSyncProto(syncManifest, tables);

    expect(proto).not.toContain("SyncJsonTableChanges");
    expect(proto).not.toContain("created_json");
    expect(proto).not.toContain("updated_json");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/proto-writer.test.ts
```

Expected: FAIL because `proto-writer.ts` does not exist.

**Step 3: Implement proto writer**

Create `packages/sync-proto-generator/src/proto-writer.ts`:

```ts
import type { ReflectedSyncTable } from "./drizzle-reflection";
import type { SyncManifest } from "./manifest";

function renderRowMessage(table: ReflectedSyncTable): string {
  const lines = [`message ${table.rowMessageName} {`];
  for (const [index, column] of table.columns.entries()) {
    lines.push(`  ${column.protoType} ${column.protoName} = ${index + 1};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function renderChangesMessage(table: ReflectedSyncTable): string {
  return [
    `message ${table.changeMessageName} {`,
    `  repeated ${table.rowMessageName} created = 1;`,
    `  repeated ${table.rowMessageName} updated = 2;`,
    "  repeated string deleted_ids = 3;",
    "}",
  ].join("\n");
}

function tableFieldName(tableName: string): string {
  return tableName;
}

function renderPushRequest(manifest: SyncManifest): string {
  const lines = [
    "message SyncPushBatchRequest {",
    "  string outlet_id = 1;",
    "  string idempotency_key = 2;",
  ];
  for (const [index, table] of manifest.tables.entries()) {
    lines.push(
      `  ${table.changeMessageName} ${tableFieldName(table.tableName)} = ${
        manifest.requestTypedFieldStart + index
      };`
    );
  }
  lines.push("}");
  return lines.join("\n");
}

function renderPullResponse(manifest: SyncManifest): string {
  const lines = ["message SyncPullBatchResponse {"];
  for (const [index, table] of manifest.tables.entries()) {
    lines.push(
      `  ${table.changeMessageName} ${tableFieldName(table.tableName)} = ${
        manifest.requestTypedFieldStart + index
      };`
    );
  }
  lines.push("  int64 latest_event_id = 100;");
  lines.push("  bool needs_full_resync = 101;");
  lines.push("  string server_time = 102;");
  lines.push("  bool has_more = 103;");
  lines.push("  string next_page_cursor = 104;");
  lines.push("}");
  return lines.join("\n");
}

export function renderSyncProto(
  manifest: SyncManifest,
  tables: ReflectedSyncTable[]
): string {
  return [
    'syntax = "proto3";',
    "",
    `package ${manifest.packageName};`,
    "",
    "message SyncStatusRequest {",
    "  string outlet_id = 1;",
    "  int64 last_server_event_id = 2;",
    "}",
    "",
    "message SyncStatusResponse {",
    "  repeated string changed_tables = 1;",
    "  bool has_changes = 2;",
    "  int64 latest_event_id = 3;",
    "  bool needs_full_resync = 4;",
    "  int64 oldest_available_event_id = 5;",
    "  bool has_oldest_available_event_id = 6;",
    "}",
    "",
    "message SyncRejectedRow {",
    "  string id = 1;",
    "  string reason = 2;",
    "}",
    "",
    "message SyncTableAck {",
    "  string table = 1;",
    "  repeated string accepted_created_ids = 2;",
    "  repeated string accepted_updated_ids = 3;",
    "  repeated string accepted_deleted_ids = 4;",
    "  repeated SyncRejectedRow rejected = 5;",
    "}",
    "",
    ...tables.flatMap((table) => [renderRowMessage(table), ""]),
    ...tables.flatMap((table) => [renderChangesMessage(table), ""]),
    renderPushRequest(manifest),
    "",
    "message SyncPushBatchResponse {",
    "  repeated SyncTableAck tables = 1;",
    "  string server_time = 2;",
    "  int64 latest_event_id = 3;",
    "}",
    "",
    "message SyncPullBatchRequest {",
    "  string outlet_id = 1;",
    "  int64 after_event_id = 2;",
    "  repeated string tables = 3;",
    "  int32 limit = 4;",
    "  string page_cursor = 5;",
    "}",
    "",
    renderPullResponse(manifest),
    "",
  ].join("\n");
}
```

**Step 4: Run test**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/proto-writer.test.ts
```

Expected initially: FAIL if generated field order differs from current manual hot-table order.

If field order differs, update the manifest with explicit `fieldOrder` arrays for currently manual typed tables. Do not reorder current hot fields casually because this changes wire compatibility.

**Step 5: Add explicit field order support if needed**

If the previous test fails on field numbers, update manifest types:

```ts
fieldOrder?: string[];
```

Then use `fieldOrder` to sort reflected columns before rendering. Add a failing test that proves product `price` stays field number `5`.

**Step 6: Run tests**

Run:

```bash
bun test packages/sync-proto-generator/src
```

Expected: PASS.

**Step 7: Commit**

```bash
git add packages/sync-proto-generator/src
git commit -m "feat(sync): generate typed sync proto messages"
```

## Task 5: Generate Side-by-Side Comparison Artifacts

**Files:**

- Create: `packages/sync-proto-generator/src/cli.ts`
- Create: `packages/sync-proto-generator/src/file-output.ts`
- Create: `packages/sync-proto-generator/src/__test__/file-output.test.ts`
- Create directory output: `packages/sync-proto-generator/generated/`

**Step 1: Write failing tests**

Create `packages/sync-proto-generator/src/__test__/file-output.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { resolveGeneratorOutputPath } from "../file-output";

describe("generator file output", () => {
  test("compare mode writes under package generated directory", () => {
    expect(resolveGeneratorOutputPath("compare", "sync.proto").endsWith(
      "packages/sync-proto-generator/generated/sync.proto"
    )).toBe(true);
  });

  test("write mode targets checked-in protobuf contract", () => {
    expect(resolveGeneratorOutputPath("write", "sync.proto").endsWith(
      "packages/protobuf/proto/sync.proto"
    )).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/file-output.test.ts
```

Expected: FAIL because output helpers do not exist.

**Step 3: Implement output helpers**

Create `packages/sync-proto-generator/src/file-output.ts`:

```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type GenerateMode = "compare" | "write";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));

export function resolveGeneratorOutputPath(
  mode: GenerateMode,
  fileName: "sync.proto"
): string {
  if (mode === "compare") {
    return join(packageRoot, "generated", fileName);
  }
  return join(repoRoot, "packages", "protobuf", "proto", fileName);
}
```

Create `packages/sync-proto-generator/src/cli.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as localSchema from "@repo/database";
import { reflectSyncTables } from "./drizzle-reflection";
import { resolveGeneratorOutputPath, type GenerateMode } from "./file-output";
import { syncManifest } from "./manifest";
import { renderSyncProto } from "./proto-writer";

function parseMode(argv: string[]): GenerateMode {
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : "compare";
  if (mode === "compare" || mode === "write") {
    return mode;
  }
  throw new Error(`Invalid generator mode: ${mode}`);
}

const mode = parseMode(Bun.argv);
const tables = reflectSyncTables(localSchema, syncManifest);
const proto = renderSyncProto(syncManifest, tables);
const outputPath = resolveGeneratorOutputPath(mode, "sync.proto");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, proto);
console.log(`[SYNC_PROTO_GENERATOR] wrote ${outputPath}`);
```

**Step 4: Run test**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/file-output.test.ts
```

Expected: PASS.

**Step 5: Generate comparison proto**

Run:

```bash
bun run generate:sync-proto:compare
```

Expected: creates `packages/sync-proto-generator/generated/sync.proto`.

**Step 6: Commit**

```bash
git add package.json packages/sync-proto-generator
git commit -m "feat(sync): generate side-by-side sync proto artifact"
```

## Task 6: Add Proto Contract Diff Tests Against Current Manual Proto

**Files:**

- Create: `packages/sync-proto-generator/src/proto-compare.ts`
- Create: `packages/sync-proto-generator/src/__test__/proto-compare.test.ts`

**Step 1: Write failing tests**

Create `packages/sync-proto-generator/src/__test__/proto-compare.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as localSchema from "@repo/database";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { compareManualHotTableContract } from "../proto-compare";
import { renderSyncProto } from "../proto-writer";

const currentProtoPath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "protobuf",
  "proto",
  "sync.proto"
);

describe("proto comparison with manual contract", () => {
  test("generated hot-table rows match current manual field numbers and types", () => {
    const currentProto = readFileSync(currentProtoPath, "utf8");
    const generatedProto = renderSyncProto(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(compareManualHotTableContract(currentProto, generatedProto)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/proto-compare.test.ts
```

Expected: FAIL because `proto-compare.ts` does not exist.

**Step 3: Implement a focused proto parser**

Create `packages/sync-proto-generator/src/proto-compare.ts`:

```ts
interface ProtoField {
  fieldNumber: number;
  label: string;
  name: string;
  type: string;
}

const HOT_MESSAGES = [
  "ProductRow",
  "OutletProductRow",
  "OrderRow",
  "OrderItemRow",
  "ProductChanges",
  "OutletProductChanges",
  "OrderChanges",
  "OrderItemChanges",
] as const;

function parseMessage(source: string, messageName: string): ProtoField[] {
  const pattern = new RegExp(`message ${messageName} \\\\{([\\\\s\\\\S]*?)\\\\n\\\\}`, "m");
  const match = source.match(pattern);
  if (!match) {
    return [];
  }
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .map((line) =>
      line.match(/^(?:(repeated)\s+)?([A-Za-z0-9_]+)\s+([a-z0-9_]+)\s+=\s+(\d+);$/)
    )
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => ({
      fieldNumber: Number(match[4]),
      label: match[1] ?? "",
      name: match[3],
      type: match[2],
    }));
}

export function compareManualHotTableContract(
  currentProto: string,
  generatedProto: string
): string[] {
  const errors: string[] = [];
  for (const messageName of HOT_MESSAGES) {
    const current = parseMessage(currentProto, messageName);
    const generated = parseMessage(generatedProto, messageName);
    if (current.length === 0) {
      errors.push(`Current proto is missing ${messageName}`);
      continue;
    }
    if (generated.length === 0) {
      errors.push(`Generated proto is missing ${messageName}`);
      continue;
    }
    if (JSON.stringify(current) !== JSON.stringify(generated)) {
      errors.push(`${messageName} differs from current manual contract`);
    }
  }
  return errors;
}
```

**Step 4: Run the comparison test**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/proto-compare.test.ts
```

Expected: likely FAIL on the first run because generated field order or request field numbers differ.

**Step 5: Reconcile generator output**

Do not update the current manual proto to satisfy this test. Update the manifest and generator until the generated hot-table messages match the checked-in manual messages exactly.

Expected reconciliation work:

- Add `fieldOrder` to each currently manual typed table in `manifest.ts`.
- Add `typedFieldNumber` to each manifest table so existing manual request and response numbers are preserved for hot tables.
- Keep newly generated table fields outside the current manual range or append them after existing typed fields.

**Step 6: Run all generator tests**

Run:

```bash
bun test packages/sync-proto-generator/src
```

Expected: PASS.

**Step 7: Commit**

```bash
git add packages/sync-proto-generator/src
git commit -m "test(sync): compare generated proto with manual contract"
```

## Task 7: Generate API TypeScript Mappers

**Files:**

- Create: `packages/sync-proto-generator/src/ts-mapper-writer.ts`
- Create: `packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts`
- Generated compare: `packages/sync-proto-generator/generated/api-sync-mappers.ts`

**Step 1: Write failing tests**

Create `packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import * as localSchema from "@repo/database";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderApiSyncMappers } from "../ts-mapper-writer";

describe("TypeScript API sync mapper writer", () => {
  test("renders product money alias from DB field to proto field", () => {
    const source = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain("priceMinorUnits: int64Field(row.price ?? row.priceMinorUnits");
  });

  test("renders typed decode for all sync tables", () => {
    const source = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain("if (request.staff)");
    expect(source).toContain("changes.staff = {");
    expect(source).not.toContain("JSON.parse");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts
```

Expected: FAIL because mapper writer does not exist.

**Step 3: Implement writer**

Create `packages/sync-proto-generator/src/ts-mapper-writer.ts` with functions that generate:

- `int64Field`
- `stringField`
- `boolField`
- one `tableRowToProto(row)` function per sync table
- one `decodePushBatchRequest(request)` function with no JSON fallback
- one `encodePullBatchResponse(result)` function with typed changes for every sync table

Generated rows must accept both DB property names and proto property names for alias fields during migration. For example:

```ts
priceMinorUnits: int64Field(row.price ?? row.priceMinorUnits, "products.price")
```

**Step 4: Run tests**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts
```

Expected: PASS.

**Step 5: Extend CLI compare output**

Modify `packages/sync-proto-generator/src/cli.ts` so compare mode also writes:

```text
packages/sync-proto-generator/generated/api-sync-mappers.ts
```

**Step 6: Generate compare artifacts**

Run:

```bash
bun run generate:sync-proto:compare
```

Expected: compare mappers are generated.

**Step 7: Commit**

```bash
git add packages/sync-proto-generator/src packages/sync-proto-generator/generated
git commit -m "feat(sync): generate API sync mappers"
```

## Task 8: Cross-Compare Generated API Mappers With Manual Hot-Table Logic

**Files:**

- Create: `packages/sync-proto-generator/src/__test__/ts-mapper-compare.test.ts`
- Modify: `packages/sync-proto-generator/src/ts-mapper-writer.ts`

**Step 1: Write failing tests**

Create `packages/sync-proto-generator/src/__test__/ts-mapper-compare.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  SyncPushBatchRequest,
  SyncPullBatchResponse,
} from "@repo/protobuf/sync";
import {
  decodePushBatchRequest,
  encodePullBatchResponse,
} from "../../../../apps/api/src/sync/protobuf";
import {
  decodeGeneratedPushBatchRequest,
  encodeGeneratedPullBatchResponse,
} from "../../generated/api-sync-mappers";

describe("generated API mapper comparison", () => {
  test("decodes current typed product push exactly like manual mapper", () => {
    const request = SyncPushBatchRequest.create({
      outletId: "outlet-1",
      idempotencyKey: "idem-1",
      products: {
        created: [
          {
            id: "product-1",
            merchantId: "merchant-1",
            name: "Kopi",
            priceMinorUnits: 15000n,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        updated: [],
        deletedIds: [],
      },
    });

    expect(decodeGeneratedPushBatchRequest(request).products).toEqual(
      decodePushBatchRequest(request).products
    );
  });

  test("encodes current typed order item pull exactly like manual mapper", () => {
    const input = {
      latestEventId: 12,
      needsFullResync: false,
      orderItems: {
        created: [
          {
            id: "item-1",
            orderId: "order-1",
            outletId: "outlet-1",
            productId: "product-1",
            productName: "Kopi",
            quantity: 2,
            unitPrice: 15000,
            originalPrice: 20000,
            subtotal: 30000,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        updated: [],
        deletedIds: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    };

    const manual = encodePullBatchResponse(input);
    const generated = encodeGeneratedPullBatchResponse(input);

    expect(SyncPullBatchResponse.encode(generated).finish()).toEqual(
      SyncPullBatchResponse.encode(manual).finish()
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun run generate:sync-proto:compare
bun test packages/sync-proto-generator/src/__test__/ts-mapper-compare.test.ts
```

Expected: FAIL until generated API mapper names and imports are correct.

**Step 3: Reconcile generated mapper behavior**

Update the generated mapper writer until current hot-table typed rows encode/decode exactly like the manual mapper.

Do not include JSON table cases in this comparison. The purpose is to prove the generated typed path matches the existing typed path before expanding coverage.

**Step 4: Run tests**

Run:

```bash
bun run generate:sync-proto:compare
bun test packages/sync-proto-generator/src
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator
git commit -m "test(sync): compare generated API mappers with manual typed path"
```

## Task 9: Generate Rust POS Mappers

**Files:**

- Create: `packages/sync-proto-generator/src/rust-mapper-writer.ts`
- Create: `packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts`
- Generated compare: `packages/sync-proto-generator/generated/pos-sync-mappers.rs`

**Step 1: Write failing tests**

Create `packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import * as localSchema from "@repo/database";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderRustSyncMappers } from "../rust-mapper-writer";

describe("Rust POS sync mapper writer", () => {
  test("renders product mapper from serde_json value to ProductRow", () => {
    const source = renderRustSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain("fn product_row_from_value(row: &Value) -> ProductRow");
    expect(source).toContain('price_minor_units: value_to_i64(row, &["priceMinorUnits", "price"])');
  });

  test("renders typed changes builders for every sync table", () => {
    const source = renderRustSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain("pub(super) fn build_staff_changes");
    expect(source).toContain("StaffChanges {");
    expect(source).not.toContain("build_json_table_changes");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts
```

Expected: FAIL because writer does not exist.

**Step 3: Implement Rust mapper writer**

Generate Rust helpers matching current style in `apps/pos-app/src-tauri/src/sync/protobuf.rs`:

- `value_to_string`
- `value_to_bool`
- `value_to_i64`
- one `*_row_from_value(row: &Value) -> *Row` per sync table
- one `build_*_changes(changes: &TablePushChanges) -> *Changes` per sync table
- `decode_pull_batch_response_tables(response: &SyncPullBatchResponse) -> Result<BTreeMap<String, Value>, String>` with typed table decoding for every sync table

Rows should be converted back into `serde_json::Value` maps for the existing `upsert_row` path during the first runtime migration. This keeps the pull SQL application behavior unchanged while removing JSON transport.

**Step 4: Run tests**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts
```

Expected: PASS.

**Step 5: Generate compare artifacts**

Modify CLI to write:

```text
packages/sync-proto-generator/generated/pos-sync-mappers.rs
```

Run:

```bash
bun run generate:sync-proto:compare
```

Expected: generated Rust mapper file exists.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator
git commit -m "feat(sync): generate POS Rust sync mappers"
```

## Task 10: Cross-Compare Generated Rust Mappers With Manual Hot-Table Logic

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Create: `apps/pos-app/src-tauri/src/sync/generated_compare.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Step 1: Write failing Rust comparison tests**

Add a test-only module in `apps/pos-app/src-tauri/src/sync/mod.rs`:

```rust
#[cfg(test)]
mod generated_compare;
```

Create `apps/pos-app/src-tauri/src/sync/generated_compare.rs`:

```rust
use serde_json::json;

use super::protobuf::{
    build_order_item_changes, build_product_changes, TablePushChanges,
};

include!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/sync-proto-generator/generated/pos-sync-mappers.rs"
));

#[test]
fn generated_product_mapper_matches_manual_mapper() {
    let changes = TablePushChanges {
        created: vec![json!({
            "id": "product-1",
            "merchantId": "merchant-1",
            "name": "Kopi",
            "price": 15000,
            "updatedAt": "2026-05-17T00:00:00.000Z"
        })],
        updated: Vec::new(),
        deleted_ids: Vec::new(),
    };

    assert_eq!(
        build_generated_product_changes(&changes),
        build_product_changes(&changes)
    );
}

#[test]
fn generated_order_item_mapper_matches_manual_mapper() {
    let changes = TablePushChanges {
        created: vec![json!({
            "id": "item-1",
            "orderId": "order-1",
            "outletId": "outlet-1",
            "productName": "Kopi",
            "quantity": 2,
            "unitPrice": 15000,
            "originalPrice": 20000,
            "subtotal": 30000
        })],
        updated: Vec::new(),
        deleted_ids: Vec::new(),
    };

    assert_eq!(
        build_generated_order_item_changes(&changes),
        build_order_item_changes(&changes)
    );
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml generated_compare --lib
```

Expected: FAIL until generated Rust names and derives line up with prost structs.

**Step 3: Reconcile generated Rust mapper**

Update the Rust mapper writer until the test passes for all currently manual hot-table mappers.

Generated helper function names should use a `generated_` prefix during comparison, for example:

```rust
build_generated_product_changes
```

This avoids name collisions with current manual functions.

**Step 4: Run Rust comparison tests**

Run:

```bash
bun run generate:sync-proto:compare
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml generated_compare --lib
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sync-proto-generator apps/pos-app/src-tauri/src/sync
git commit -m "test(sync): compare generated Rust mappers with manual typed path"
```

## Task 11: Write Generated Proto to Checked-In Contract

**Files:**

- Modify generated: `packages/protobuf/proto/sync.proto`
- Modify generated: `packages/protobuf/src/proto/sync.ts`
- Modify or verify: `packages/protobuf/package.json`

**Step 1: Write failing high-level protobuf tests**

Modify `apps/api/src/sync/__test__/protobuf.test.ts` to add:

```ts
test("encodes every sync table as typed protobuf without json fallback", () => {
  const request = SyncPushBatchRequest.create({
    outletId: "outlet-1",
    idempotencyKey: "sync-request-1",
    merchants: {
      created: [{ id: "merchant-1", name: "Toko", updatedAt: "2026-05-17T00:00:00.000Z" }],
      updated: [],
      deletedIds: [],
    },
    categories: {
      created: [{ id: "cat-1", merchantId: "merchant-1", name: "Minuman" }],
      updated: [],
      deletedIds: [],
    },
    staff: {
      created: [{ id: "staff-1", merchantId: "merchant-1", name: "Owner", role: "owner" }],
      updated: [],
      deletedIds: [],
    },
  });

  const decoded = SyncPushBatchRequest.decode(
    SyncPushBatchRequest.encode(request).finish()
  );

  expect(decoded.merchants?.created[0]?.name).toBe("Toko");
  expect(decoded.categories?.created[0]?.name).toBe("Minuman");
  expect(decoded.staff?.created[0]?.role).toBe("owner");
  expect("jsonTables" in decoded).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: FAIL because checked-in protobuf has not been replaced yet.

**Step 3: Verify ts-proto BigInt generation**

Open `packages/protobuf/package.json` and verify the `generate` script includes:

```bash
--ts_proto_opt=esModuleInterop=true,forceLong=bigint,outputServices=false,useExactTypes=false
```

If `forceLong=bigint` is missing, add it before regenerating protobuf output.

Run:

```bash
rg -n "forceLong=bigint" packages/protobuf/package.json
```

Expected: PASS with one match in the protobuf generation script.

**Step 4: Write generated proto**

Run:

```bash
bun run generate:sync-proto:write
bun --cwd packages/protobuf run generate
```

Expected:

- `packages/protobuf/proto/sync.proto` is replaced with fully typed table changes.
- `packages/protobuf/src/proto/sync.ts` is regenerated.
- Generated TypeScript uses native `bigint` for all `int64` fields, not `long.js` objects.

**Step 5: Verify generated TypeScript uses BigInt**

Run:

```bash
rg -n "bigint|Long" packages/protobuf/src/proto/sync.ts
```

Expected:

- `bigint` appears in generated `int64` fields.
- `Long` does not appear as an imported runtime type.

**Step 6: Run protobuf tests**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun --cwd packages/protobuf run typecheck
```

Expected: protobuf test now fails in runtime mappers until JSON fallback code is migrated. The new "typed every table" test should pass at the raw protobuf encode/decode level.

**Step 7: Commit**

Commit only after API/Rust runtime migrations in later tasks compile. Do not commit a broken intermediate state unless using a dedicated WIP branch and the team agrees.

## Task 12: Replace API Sync Protobuf Mapper With Generated Typed Mapper

**Files:**

- Modify: `apps/api/src/sync/protobuf.ts`
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/protobuf.test.ts`
- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing API tests**

Update tests that currently expect JSON fallback:

- Replace `"typed hot table rows and json fallback rows"` with `"returns typed rows for every sync table from events"`.
- Replace `createdJson` assertions with typed table assertions.
- Add route test that invalid JSON row payloads cannot exist because there is no JSON field.

Example service test:

```ts
test("returns typed category rows from events", async () => {
  // mock event rows for categories and product snapshots
  const result = await handlePullBatch({
    afterEventId: 9,
    limit: 2000,
    merchantId: "merchant-1",
    outletId: "outlet-1",
    pageCursor: "",
    tables: ["categories"],
  });

  expect(result.categories?.created[0]).toMatchObject({
    id: "cat-1",
    name: "Minuman",
  });
  expect("jsonTables" in result).toBe(false);
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: FAIL because API service and mappers still expose JSON fallback fields.

**Step 3: Replace mapper implementation**

Use the generated compare mapper as the implementation source for `apps/api/src/sync/protobuf.ts`.

Required changes:

- Remove `SyncJsonTableChanges` import.
- Remove `jsonTables` from `PullBatchResult`.
- Remove `parseJsonRows`.
- Update `decodePushBatchRequest` to read every table from typed fields.
- Update `encodePullBatchResponse` to emit every table as typed changes.
- Keep `computePushBatchRequestHash`, `encodeStatusResponse`, and `encodePushBatchResponse`.

**Step 4: Update service result shape**

In `apps/api/src/sync/service.ts`:

- Remove `HOT_SYNC_TABLE_NAMES`.
- Remove `PullBatchEntry.kind`.
- Remove `jsonTables` maps.
- Change `applyPullBatchEntries` to initialize typed table properties for all sync tables.
- Make baseline pull use typed table changes for every table.

**Step 5: Run API tests**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 6: Run typecheck**

Run:

```bash
bun --cwd apps/api run typecheck
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api packages/protobuf
git commit -m "feat(sync): use typed protobuf for API sync tables"
```

## Task 13: Replace Rust POS Sync Protobuf Mapper With Generated Typed Mapper

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Step 1: Write failing Rust tests**

Add or update tests in `apps/pos-app/src-tauri/src/sync/mod.rs`:

```rust
#[test]
fn push_batch_builds_typed_categories_without_json_tables() {
    let changes = super::protobuf::TablePushChanges {
        created: vec![serde_json::json!({
            "id": "cat-1",
            "merchantId": "merchant-1",
            "name": "Minuman",
            "sortOrder": 1,
            "isActive": true,
            "updatedAt": "2026-05-17T00:00:00.000Z"
        })],
        updated: Vec::new(),
        deleted_ids: Vec::new(),
    };

    let request = super::protobuf::build_sync_push_batch_request(
        "outlet-1",
        "idem-1",
        Some(super::protobuf::build_category_changes(&changes)),
        // pass empty typed changes for other tables
    );

    assert_eq!(request.categories.unwrap().created[0].name, "Minuman");
}
```

Use the exact function signature implemented by the generated Rust mapper. The purpose is to force typed non-hot table support.

**Step 2: Run test to verify failure**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: FAIL because Rust still builds JSON table changes for non-hot tables.

**Step 3: Replace Rust mapper implementation**

Use generated Rust mapper output to replace hand-written row conversion in `apps/pos-app/src-tauri/src/sync/protobuf.rs`.

Required changes:

- Remove `build_json_table_changes`.
- Add `build_*_changes` for every sync table.
- Update `build_sync_push_batch_request` signature to accept typed changes for every sync table.
- Update `decode_pull_batch_response_tables` to decode every typed table into the existing `BTreeMap<String, Value>` shape used by `apply_pull_batch_tables_tx`.

**Step 4: Update push request construction**

In `apps/pos-app/src-tauri/src/sync/push.rs`:

- Replace `json_tables` vector with one `TablePushChanges` variable per sync table.
- Assign changes by table name for all sync tables.
- Build `SyncPushBatchRequest` with typed changes for every table.
- Keep outbox reading and coalescing unchanged.

**Step 5: Run Rust tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync
git commit -m "feat(sync): use typed protobuf for POS sync tables"
```

## Task 14: Remove SyncJsonTableChanges From Runtime Contract

**Files:**

- Modify: `packages/protobuf/proto/sync.proto`
- Modify generated: `packages/protobuf/src/proto/sync.ts`
- Modify: `apps/api/src/sync/protobuf.ts`
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`

**Step 1: Write failing grep-style test**

This is an intentional hardcut. Do not keep `SyncJsonTableChanges` as a deprecated compatibility field in this plan.

Create `packages/sync-proto-generator/src/__test__/no-json-sync-contract.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const packagesRoot = join(import.meta.dir, "..", "..", "..");

describe("typed sync contract cleanup", () => {
  test("sync protobuf contract has no JSON row table payload", () => {
    const proto = readFileSync(
      join(packagesRoot, "protobuf", "proto", "sync.proto"),
      "utf8"
    );

    expect(proto).not.toContain("SyncJsonTableChanges");
    expect(proto).not.toContain("created_json");
    expect(proto).not.toContain("updated_json");
  });
});
```

**Step 2: Run test**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/no-json-sync-contract.test.ts
```

Expected: PASS only after checked-in generated proto no longer contains JSON rows.

**Step 3: Search for runtime JSON fallback**

Run:

```bash
rg -n "SyncJsonTableChanges|createdJson|updatedJson|created_json|updated_json|jsonTables|build_json_table_changes|parseJsonRows" packages apps
```

Expected after cleanup: no runtime matches outside tests that intentionally document old behavior. Remove or rewrite those tests.

**Step 4: Regenerate protobuf**

Run:

```bash
bun --cwd packages/protobuf run generate
```

Expected: generated TypeScript no longer exposes `SyncJsonTableChanges`.

**Step 5: Run targeted tests**

Run:

```bash
bun test packages/sync-proto-generator/src
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages apps
git commit -m "refactor(sync): remove JSON row payload fallback"
```

## Task 15: Add Generator Drift Check

**Files:**

- Create: `packages/sync-proto-generator/src/__test__/drift.test.ts`
- Modify: `packages/sync-proto-generator/package.json`
- Modify: root `package.json`

**Step 1: Write failing drift test**

Create `packages/sync-proto-generator/src/__test__/drift.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as localSchema from "@repo/database";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderSyncProto } from "../proto-writer";

describe("generated sync proto drift", () => {
  test("checked-in sync.proto matches generator output", () => {
    const generated = renderSyncProto(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );
    const checkedIn = readFileSync(
      join(import.meta.dir, "..", "..", "..", "protobuf", "proto", "sync.proto"),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });
});
```

**Step 2: Run test to verify failure if drift exists**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/drift.test.ts
```

Expected: PASS only after generator output and checked-in proto match exactly.

**Step 3: Add check script**

Modify `packages/sync-proto-generator/package.json`:

```json
"check:drift": "bun test src/__test__/drift.test.ts"
```

Modify root `package.json`:

```json
"sync-proto:check": "bun --cwd packages/sync-proto-generator run check:drift"
```

**Step 4: Run drift check**

Run:

```bash
bun run sync-proto:check
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json packages/sync-proto-generator
git commit -m "test(sync): guard generated protobuf drift"
```

## Task 16: Add End-to-End Payload Size Comparison Tests

**Files:**

- Create: `apps/api/src/sync/__test__/payload-size.test.ts`
- Optional create: `docs/reports/sync-protobuf-payload-size.md`

**Step 1: Write failing payload size test**

Create `apps/api/src/sync/__test__/payload-size.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SyncPushBatchRequest } from "@repo/protobuf/sync";

function repeatedProducts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `product-${index}`,
    merchantId: "merchant-1",
    name: `Product ${index}`,
    priceMinorUnits: 15000n,
    isActive: true,
    sortOrder: BigInt(index),
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:00:00.000Z",
  }));
}

describe("typed protobuf sync payload size", () => {
  test("typed protobuf product batch is smaller than JSON row batch", () => {
    const rows = repeatedProducts(100);
    const typedBytes = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        outletId: "outlet-1",
        idempotencyKey: "idem-1",
        products: {
          created: rows,
          updated: [],
          deletedIds: [],
        },
      })
    ).finish().byteLength;

    const jsonBytes = new TextEncoder().encode(
      JSON.stringify({
        outletId: "outlet-1",
        idempotencyKey: "idem-1",
        jsonTables: [
          {
            table: "products",
            createdJson: rows.map((row) =>
              JSON.stringify({
                ...row,
                priceMinorUnits: row.priceMinorUnits.toString(),
                sortOrder: row.sortOrder.toString(),
              })
            ),
            updatedJson: [],
            deletedIds: [],
          },
        ],
      })
    ).byteLength;

    expect(typedBytes).toBeLessThan(jsonBytes);
  });
});
```

**Step 2: Run test**

Run:

```bash
bun test apps/api/src/sync/__test__/payload-size.test.ts
```

Expected: PASS after typed protobuf request exists for all tables.

**Step 3: Record observed sizes**

If useful, add a short report at `docs/reports/sync-protobuf-payload-size.md` with:

- table
- row count
- JSON bytes
- protobuf bytes
- percentage reduction

**Step 4: Commit**

```bash
git add apps/api/src/sync/__test__/payload-size.test.ts docs/reports/sync-protobuf-payload-size.md
git commit -m "test(sync): measure typed protobuf payload size"
```

## Task 17: Update Logging Filter and Docs

**Files:**

- Modify: `logs/capture-adb-logcat.sh`
- Modify: `docs/knowledge/APP-LOGGING-DOCS.md`

**Step 1: Read current logging docs**

Run:

```bash
sed -n '1,220p' docs/knowledge/APP-LOGGING-DOCS.md
```

Expected: identify current `[SYNC:TRACE]` documentation.

**Step 2: Add targeted generator/runtime log prefixes only if needed**

If runtime migration adds new logs, use existing prefix style:

```rust
log::info!(
    "[RUST] [SYNC:PROTO] push_batch typed payload: table={}, created={}, updated={}, deleted={}",
    table,
    created,
    updated,
    deleted
);
```

Do not add noisy per-row logs unless investigating a bug.

**Step 3: Update log capture filter**

Modify `logs/capture-adb-logcat.sh` `LOG_FILTER` to include the exact new prefix:

```bash
SYNC:PROTO
```

If no new prefix is added, ensure existing `[SYNC:TRACE]` still captures the changed sync path.

**Step 4: Update docs**

Document the prefix and example command in `docs/knowledge/APP-LOGGING-DOCS.md`.

**Step 5: Commit**

```bash
git add logs/capture-adb-logcat.sh docs/knowledge/APP-LOGGING-DOCS.md
git commit -m "docs(sync): document typed protobuf sync logs"
```

## Task 18: Full Verification Gate

**Files:**

- No code changes expected.

**Step 1: Run generator tests**

Run:

```bash
bun test packages/sync-proto-generator/src
```

Expected: PASS.

**Step 2: Run protobuf package checks**

Run:

```bash
bun --cwd packages/protobuf run generate
bun --cwd packages/protobuf run typecheck
```

Expected: PASS and no unexpected generated drift after a second run.

**Step 3: Run API sync tests**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/payload-size.test.ts
```

Expected: PASS.

**Step 4: Run POS Rust sync tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 5: Run typechecks**

Run:

```bash
bun --cwd apps/api run typecheck
bun --cwd packages/sync-proto-generator run typecheck
bun --cwd packages/protobuf run typecheck
```

Expected: PASS.

**Step 6: Run Ultracite**

Run:

```bash
bun x ultracite check
```

Expected: PASS, or only pre-existing unrelated issues. Fix touched-file issues before handoff.

**Step 7: Manual sync verification**

Manual setup:

1. Install or launch POS app with an authenticated outlet.
2. Create or modify one row in each sync table:
   - merchant or outlet metadata
   - register
   - staff
   - category
   - asset metadata
   - product
   - outlet product
   - order
   - order item
3. Trigger sync.
4. Pull on a second device or clean local DB and run full resync.

Expected:

- No `/api/sync/push` or `/api/sync/pull` JSON row payload errors.
- All changed rows arrive.
- `sync_outbox.synced_at` is set only for accepted rows.
- Dirty local rows remain unsynced when rejected.
- Pulled rows have `is_synced = 1`.

**Step 8: Log verification**

Run:

```bash
bash logs/capture-adb-logcat.sh
```

Expected:

- `logs/app.log` includes sync push and pull entries.
- If `SYNC:PROTO` was added, entries show typed table counts.
- No `Failed to decode pull batch response`.
- No `Invalid sync batch payload`.

**Step 9: State checks**

Use the app DB inspection path already used in project debugging. Confirm:

```sql
SELECT table_name, COUNT(*) FROM sync_outbox WHERE synced_at IS NULL GROUP BY table_name;
SELECT scope_id, last_server_event_id FROM sync_cursors;
SELECT id, is_synced, updated_at FROM products ORDER BY updated_at DESC LIMIT 5;
```

Expected:

- Outbox pending count is zero after accepted push.
- Cursor advances after pull.
- Pulled rows are marked synced.

**Step 10: Final commit**

```bash
git status --short
git add .
git commit -m "feat(sync): generate fully typed protobuf sync contract"
```

## Rollback Plan

If typed sync fails during runtime verification:

1. Keep generator package and comparison artifacts.
2. Revert only runtime switch commits:
   - API mapper switch.
   - Rust mapper switch.
   - `sync.proto` write-mode replacement if needed.
3. Preserve side-by-side comparison tests so reconciliation can continue.
4. Do not reintroduce new JSON fallback code beyond the current checked-in behavior.

## Future Follow-Ups

These are intentionally outside this feature because the first goal is to remove JSON from the wire protocol while keeping sync behavior stable.

1. Refactor Rust push mappers to bypass `serde_json::Value`. Rust should map directly from `sqlx::Row` to Prost protobuf structs for lower allocation and less CPU work on Android.
2. Refactor Rust pull application to write typed protobuf rows directly into SQLite instead of converting typed rows back into `serde_json::Value` maps for the existing `upsert_row` bridge.
3. Measure Android sync CPU time and memory before and after the direct row mapper refactor using representative multi-table batches.

## Definition Of Done

The feature is done when:

- `packages/sync-proto-generator` can regenerate `sync.proto`.
- Drift test proves checked-in `sync.proto` matches generator output.
- Generated side-by-side artifacts match current manual hot-table behavior before replacement.
- Every sync table uses typed protobuf changes.
- Runtime code has no `SyncJsonTableChanges`, `created_json`, or `updated_json`.
- API sync tests pass.
- Rust sync tests pass.
- Protobuf package typecheck passes.
- Manual sync verification passes for all sync tables.
- `logs/capture-adb-logcat.sh` captures the changed sync path.
