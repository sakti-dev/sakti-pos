# Sync Proto Generator Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change. Write the failing test first, run it, confirm the expected failure, then write the minimal implementation.

**Goal:** Make the typed sync protobuf generator the reliable source of truth for sync contracts and runtime mappers, with compile-safe generated Rust, drift checks, strict manifest validation, correct delete semantics, and end-to-end sync coverage.

**Architecture:** Keep `packages/sync-proto-generator` as the schema-aware generator, but promote its output from comparison artifacts to checked runtime artifacts. Split generated runtime mapper code from handwritten sync orchestration: generated files own table row mapping, change wrapper construction, proto field naming, and pull decode conversion; handwritten files own HTTP, auth, hashing, outbox, conflict policy, logging, and transaction flow. Add strict generator validation and drift tests so schema/manifest/runtime divergence fails locally and in CI.

**Tech Stack:** Bun, TypeScript, Vitest/Bun tests, Drizzle runtime reflection, protobuf/ts-proto with `forceLong=bigint`, Rust prost, rustfmt, Cargo tests, Tauri/sqlx SQLite sync, Elysia API sync routes, Ultracite/Biome.

---

## Current Problems To Fix

The current branch implements the broad typed sync goal, but the generator is not yet robust enough to maintain the feature safely.

1. `packages/sync-proto-generator/generated/pos-sync-mappers.rs` is invalid Rust and fails `rustfmt --check`.
2. Generated Rust uses TypeScript-style camelCase for Prost fields such as `orderItems`, while actual Prost fields are snake_case such as `order_items`.
3. Generated Rust helper names are inconsistent for multi-word messages, for example `orderItem_row_from_value` instead of `order_item_row_from_value`.
4. Runtime API and Rust mapper files are still manually maintained, while generated mapper artifacts are only side-by-side comparison files.
5. `sync-proto:check` only verifies `sync.proto` drift, not API/Rust mapper drift.
6. Generated API mapper reads service result keys like `result.orderItems`, but the service uses `result.order_items`.
7. Server push deletes reject existing rows when the request contains only `deletedIds`, so normal client deletes may not propagate.
8. Manifest validation silently drops bad `fieldOrder` entries instead of failing generation.
9. Tests mostly compare strings and hot-table snippets; they do not prove the full generator output compiles or matches runtime behavior.

## Target End State

- `packages/protobuf/proto/sync.proto` is generated and drift-checked.
- API generated mapper lives in a runtime path and is imported by handwritten API sync helpers.
- Rust generated mapper lives in a runtime path and is imported by handwritten POS sync helpers.
- `bun run generate:sync-proto:write` writes all checked-in generated runtime artifacts, not just proto.
- `bun run sync-proto:check` fails if any checked-in generated artifact is stale.
- Generated Rust is formatted with `rustfmt` and compile-checked by Cargo tests.
- Generated API mapper supports service keys such as `order_items` and ts-proto fields such as `orderItems` explicitly.
- Delete pushes for existing rows are handled intentionally and tested.
- Manifest/schema drift fails with descriptive errors.
- All 10 sync tables have push and pull mapper coverage.

## Non-Goals

- Do not reintroduce backward-compatible JSON row transport.
- Do not support launched clients with older `json_tables`.
- Do not redesign conflict resolution beyond fixing delete semantics required by hardcut typed sync.
- Do not remove the current JSON bridge inside POS pull application in this plan.
- Do not optimize Rust push mapping directly from `sqlx::Row`; keep that as a later performance follow-up.
- Do not change asset binary upload/download behavior.

## Required Verification Commands

Run the scoped command listed in each task. Before final handoff, run the full gate:

```bash
bun run generate:sync-proto:write
bun run sync-proto:check
bun test packages/sync-proto-generator/src
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
bun x ultracite check packages/sync-proto-generator apps/api/src/sync apps/pos-app/src-tauri/src/sync packages/protobuf/proto/sync.proto
```

If generated Rust remains under `packages/sync-proto-generator/generated/` during an intermediate task, also run:

```bash
rustfmt --edition 2021 --check packages/sync-proto-generator/generated/pos-sync-mappers.rs
```

---

## Task 1: Add Compile-Safety Regression Tests For Generated Rust

**Files:**

- Modify: `packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/rust-mapper-compare.test.ts`
- Create: `packages/sync-proto-generator/src/__test__/rust-generated-validity.test.ts`
- No production code changes in this task.

**Step 1: Write the failing rustfmt validity test**

Create `packages/sync-proto-generator/src/__test__/rust-generated-validity.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderRustSyncMappers } from "../rust-mapper-writer";

const localSchema = await import("@repo/database");

describe("generated Rust sync mapper validity", () => {
  test("generated Rust mapper is syntactically valid rustfmt input", async () => {
    const source = renderRustSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );
    const dir = mkdtempSync(join(tmpdir(), "sync-rust-mapper-"));
    const file = join(dir, "protobuf_generated.rs");
    writeFileSync(file, source);

    try {
      const proc = Bun.spawnSync([
        "rustfmt",
        "--edition",
        "2021",
        "--check",
        file,
      ]);

      expect(proc.exitCode, new TextDecoder().decode(proc.stderr)).toBe(0);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
```

**Step 2: Run the test and verify RED**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/rust-generated-validity.test.ts
```

Expected: FAIL with the current generated syntax error near `staff: Option<StaffChanges>),`.

**Step 3: Add precise writer tests for Rust names**

In `packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts`, add tests:

```ts
test("renders Rust snake_case function names for multi-word rows", () => {
  const source = renderRustSyncMappers(syncManifest, tables);

  expect(source).toContain("fn order_item_row_from_value(row: &Value)");
  expect(source).toContain("fn outlet_product_row_from_value(row: &Value)");
  expect(source).not.toContain("fn orderItem_row_from_value");
  expect(source).not.toContain("fn outletProduct_row_from_value");
});

test("renders Prost snake_case fields for multi-word table changes", () => {
  const source = renderRustSyncMappers(syncManifest, tables);

  expect(source).toContain("order_items: Option<OrderItemChanges>");
  expect(source).toContain("outlet_products: Option<OutletProductChanges>");
  expect(source).toContain("response.order_items");
  expect(source).toContain("response.outlet_products");
  expect(source).not.toContain("orderItems: Option<OrderItemChanges>");
  expect(source).not.toContain("response.orderItems");
});
```

**Step 4: Run writer tests and verify RED**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts
```

Expected: FAIL because the generator currently emits camelCase Rust identifiers for some names.

**Step 5: Commit tests only**

```bash
git add packages/sync-proto-generator/src/__test__/rust-generated-validity.test.ts packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts
git commit -m "test(sync-proto-generator): require valid generated Rust"
```

---

## Task 2: Fix Rust Generator Naming And Syntax

**Files:**

- Modify: `packages/sync-proto-generator/src/rust-mapper-writer.ts`
- Modify: `packages/sync-proto-generator/generated/pos-sync-mappers.rs`

**Step 1: Replace Rust name helpers**

In `packages/sync-proto-generator/src/rust-mapper-writer.ts`, replace the current `toSnakeBase` implementation with a true Pascal/camel to snake helper:

```ts
const ACRONYM_BOUNDARY_PATTERN = /([A-Z]+)([A-Z][a-z])/g;
const LOWER_TO_UPPER_PATTERN = /([a-z0-9])([A-Z])/g;
const NON_IDENTIFIER_PATTERN = /[^a-zA-Z0-9]+/g;

function toRustSnakeIdentifier(value: string): string {
  return value
    .replace(ROW_SUFFIX_PATTERN, "")
    .replace(ACRONYM_BOUNDARY_PATTERN, "$1_$2")
    .replace(LOWER_TO_UPPER_PATTERN, "$1_$2")
    .replace(NON_IDENTIFIER_PATTERN, "_")
    .toLowerCase()
    .replace(LEADING_UNDERSCORE_PATTERN, "");
}

function rowFromValueFuncName(rowMessageName: string): string {
  return `${toRustSnakeIdentifier(rowMessageName)}_row_from_value`;
}

function rowToValueFuncName(rowMessageName: string): string {
  return `${toRustSnakeIdentifier(rowMessageName)}_row_to_value`;
}
```

**Step 2: Add explicit Rust field name helper**

Add:

```ts
function rustFieldNameForTable(tableName: string): string {
  return tableName;
}
```

Use `rustFieldNameForTable(table.tableName)` everywhere the generator writes a Prost field identifier:

- `build_sync_push_batch_request` parameters
- `SyncPushBatchRequest` struct fields
- `decode_pull_batch_response_tables` accessors

**Step 3: Fix build function parameter closing syntax**

Replace the parameter rendering logic so the closing parenthesis is emitted on its own line:

```ts
return [
  "pub(super) fn build_sync_push_batch_request(",
  ...params.map((p) => `    ${p},`),
  ") -> SyncPushBatchRequest {",
  "    SyncPushBatchRequest {",
  ...fields.map((f) => `        ${f},`),
  "    }",
  "}",
].join("\n");
```

**Step 4: Regenerate comparison artifacts**

Run:

```bash
bun run generate:sync-proto:compare
```

Expected: rewrites `packages/sync-proto-generator/generated/pos-sync-mappers.rs`.

**Step 5: Run tests and verify GREEN**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/rust-generated-validity.test.ts
bun x vitest run packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts
bun x vitest run packages/sync-proto-generator/src/__test__/rust-mapper-compare.test.ts
rustfmt --edition 2021 --check packages/sync-proto-generator/generated/pos-sync-mappers.rs
```

Expected: PASS. If `rust-mapper-compare.test.ts` fails because it expected old invalid names, update the assertions to expect `order_item_row_from_value` and `outlet_product_row_from_value`.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src/rust-mapper-writer.ts packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts packages/sync-proto-generator/src/__test__/rust-mapper-compare.test.ts packages/sync-proto-generator/generated/pos-sync-mappers.rs
git commit -m "fix(sync-proto-generator): emit valid Rust mapper identifiers"
```

---

## Task 3: Add Explicit Runtime Naming Metadata To Manifest

**Files:**

- Modify: `packages/sync-proto-generator/src/manifest.ts`
- Modify: `packages/sync-proto-generator/src/drizzle-reflection.ts`
- Modify: `packages/sync-proto-generator/src/__test__/manifest.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts`

**Step 1: Write failing manifest tests**

In `manifest.test.ts`, add:

```ts
test("declares separate runtime names for multi-word sync tables", () => {
  const orderItems = syncManifest.tables.find(
    (table) => table.tableName === "order_items"
  );
  const outletProducts = syncManifest.tables.find(
    (table) => table.tableName === "outlet_products"
  );

  expect(orderItems).toMatchObject({
    protoFieldName: "order_items",
    rustFieldName: "order_items",
    serviceKey: "order_items",
    tsProtoFieldName: "orderItems",
  });
  expect(outletProducts).toMatchObject({
    protoFieldName: "outlet_products",
    rustFieldName: "outlet_products",
    serviceKey: "outlet_products",
    tsProtoFieldName: "outletProducts",
  });
});
```

**Step 2: Run and verify RED**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/manifest.test.ts
```

Expected: FAIL because the metadata does not exist.

**Step 3: Extend manifest types**

In `manifest.ts`, add fields to `SyncTableManifest`:

```ts
protoFieldName: string;
rustFieldName: string;
serviceKey: string;
tsProtoFieldName: string;
```

Populate every table:

```ts
{
  tableName: "order_items",
  serviceKey: "order_items",
  protoFieldName: "order_items",
  tsProtoFieldName: "orderItems",
  rustFieldName: "order_items",
  rowMessageName: "OrderItemRow",
  changeMessageName: "OrderItemChanges",
  scope: "outlet",
  currentlyManualTyped: true,
  ...
}
```

For simple table names, `tableName`, `serviceKey`, `protoFieldName`, `tsProtoFieldName`, and `rustFieldName` are the same except ts-proto camelCase where needed.

**Step 4: Extend reflected table metadata**

In `drizzle-reflection.ts`, add these fields to `ReflectedSyncTable` and copy them from manifest entries.

**Step 5: Run tests and verify GREEN**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/manifest.test.ts
bun x vitest run packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src/manifest.ts packages/sync-proto-generator/src/drizzle-reflection.ts packages/sync-proto-generator/src/__test__/manifest.test.ts packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
git commit -m "feat(sync-proto-generator): add explicit runtime naming metadata"
```

---

## Task 4: Use Manifest Naming In Proto, API, And Rust Writers

**Files:**

- Modify: `packages/sync-proto-generator/src/proto-writer.ts`
- Modify: `packages/sync-proto-generator/src/ts-mapper-writer.ts`
- Modify: `packages/sync-proto-generator/src/rust-mapper-writer.ts`
- Modify: writer tests under `packages/sync-proto-generator/src/__test__/`
- Modify generated artifacts under `packages/sync-proto-generator/generated/`

**Step 1: Write failing API writer test for service keys**

In `ts-mapper-writer.test.ts`, add:

```ts
test("encodes pull responses from service keys, not ts-proto keys", () => {
  const source = renderApiSyncMappers(syncManifest, tables);

  expect(source).toContain(
    "orderItems: mapTableChanges(result.order_items, orderItemRowToProto)"
  );
  expect(source).toContain(
    "outletProducts: mapTableChanges(result.outlet_products, outletProductRowToProto)"
  );
  expect(source).not.toContain("result.orderItems");
  expect(source).not.toContain("result.outletProducts");
});
```

**Step 2: Run and verify RED**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts
```

Expected: FAIL because generated API mapper currently reads `result.orderItems`.

**Step 3: Update writers**

Use reflected table metadata:

- Proto writer request/response field: `table.protoFieldName`
- TS decode request accessor: `request[table.tsProtoFieldName]`
- TS decoded changes key: `changes[table.serviceKey]`
- TS encode result accessor: `result[table.serviceKey]`
- TS returned field: `table.tsProtoFieldName`
- Rust request parameter and struct field: `table.rustFieldName`
- Rust response accessor: `response.${table.rustFieldName}`
- Rust output map key: `table.serviceKey`

**Step 4: Regenerate comparison artifacts**

Run:

```bash
bun run generate:sync-proto:compare
```

Expected: generated artifacts change only where naming was previously wrong.

**Step 5: Run tests and verify GREEN**

Run:

```bash
bun test packages/sync-proto-generator/src
rustfmt --edition 2021 --check packages/sync-proto-generator/generated/pos-sync-mappers.rs
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src packages/sync-proto-generator/generated
git commit -m "fix(sync-proto-generator): honor explicit runtime field names"
```

---

## Task 5: Promote Generated API Mapper To Runtime Source

**Files:**

- Create: `apps/api/src/sync/protobuf.generated.ts`
- Modify: `packages/sync-proto-generator/src/file-output.ts`
- Modify: `packages/sync-proto-generator/src/cli.ts`
- Modify: `apps/api/src/sync/protobuf.ts`
- Modify: `apps/api/src/sync/__test__/protobuf.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/file-output.test.ts`
- Create or modify: `packages/sync-proto-generator/src/__test__/api-mapper-drift.test.ts`

**Step 1: Write failing file-output test**

In `file-output.test.ts`, add:

```ts
test("write mode targets checked-in API generated mapper", () => {
  expect(resolveGeneratorOutputPath("write", "api-sync-mappers.ts")).toMatch(
    /apps\/api\/src\/sync\/protobuf\.generated\.ts$/
  );
});
```

**Step 2: Run and verify RED**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/file-output.test.ts
```

Expected: FAIL because write mode currently keeps API mapper under package generated output.

**Step 3: Update output paths**

In `file-output.ts`, map write mode:

```ts
if (fileName === "api-sync-mappers.ts") {
  return join(repoRoot, "apps", "api", "src", "sync", "protobuf.generated.ts");
}
```

Keep compare mode unchanged.

**Step 4: Generate runtime API mapper**

Run:

```bash
bun run generate:sync-proto:write
```

Expected: creates `apps/api/src/sync/protobuf.generated.ts`.

**Step 5: Refactor handwritten API wrapper**

In `apps/api/src/sync/protobuf.ts`:

- Keep handwritten exports:
  - `protobufInt64ToSafeNumber`
  - `computePushBatchRequestHash`
  - `encodeStatusResponse`
  - `encodePushBatchResponse`
  - exported interfaces/types that routes/services depend on
- Import generated functions:

```ts
import {
  decodeGeneratedPushBatchRequest,
  encodeGeneratedPullBatchResponse,
} from "./protobuf.generated";
```

- Implement wrappers:

```ts
export function decodePushBatchRequest(
  request: SyncPushBatchRequest
): PushBatchChanges {
  return decodeGeneratedPushBatchRequest(request) as PushBatchChanges;
}

export function encodePullBatchResponse(
  result: PullBatchResult
): SyncPullBatchResponse {
  return SyncPullBatchResponse.create(
    encodeGeneratedPullBatchResponse(result)
  );
}
```

Do not duplicate generated row mapper code in `protobuf.ts`.

**Step 6: Add API mapper drift test**

Create `api-mapper-drift.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderApiSyncMappers } from "../ts-mapper-writer";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const localSchema = await import("@repo/database");

describe("generated API mapper drift", () => {
  test("runtime API generated mapper matches generator output", () => {
    const generated = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );
    const checkedIn = readFileSync(
      join(repoRoot, "apps", "api", "src", "sync", "protobuf.generated.ts"),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });
});

function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
```

**Step 7: Run tests and verify GREEN**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/file-output.test.ts
bun x vitest run packages/sync-proto-generator/src/__test__/api-mapper-drift.test.ts
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 8: Commit**

```bash
git add packages/sync-proto-generator/src apps/api/src/sync/protobuf.generated.ts apps/api/src/sync/protobuf.ts apps/api/src/sync/__test__/protobuf.test.ts
git commit -m "feat(sync): use generated API sync protobuf mapper"
```

---

## Task 6: Promote Generated Rust Mapper To Runtime Source

**Files:**

- Create: `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`
- Modify: `packages/sync-proto-generator/src/file-output.ts`
- Modify: `packages/sync-proto-generator/src/__test__/file-output.test.ts`
- Create or modify: `packages/sync-proto-generator/src/__test__/rust-runtime-drift.test.ts`

**Step 1: Write failing file-output test**

In `file-output.test.ts`, add:

```ts
test("write mode targets checked-in Rust generated mapper", () => {
  expect(resolveGeneratorOutputPath("write", "pos-sync-mappers.rs")).toMatch(
    /apps\/pos-app\/src-tauri\/src\/sync\/protobuf_generated\.rs$/
  );
});
```

**Step 2: Run and verify RED**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/file-output.test.ts
```

Expected: FAIL because write mode currently keeps Rust mapper under package generated output.

**Step 3: Update output paths**

In `file-output.ts`, map write mode:

```ts
if (fileName === "pos-sync-mappers.rs") {
  return join(
    repoRoot,
    "apps",
    "pos-app",
    "src-tauri",
    "src",
    "sync",
    "protobuf_generated.rs"
  );
}
```

**Step 4: Generate runtime Rust mapper**

Run:

```bash
bun run generate:sync-proto:write
rustfmt --edition 2021 apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: creates formatted `protobuf_generated.rs`.

**Step 5: Refactor Rust handwritten wrapper**

In `apps/pos-app/src-tauri/src/sync/mod.rs`, add:

```rust
mod protobuf_generated;
```

In `apps/pos-app/src-tauri/src/sync/protobuf.rs`, remove generated row mapper bodies and re-export generated functions/types:

```rust
pub(super) use super::protobuf_generated::{
    build_asset_changes, build_category_changes, build_merchant_changes,
    build_order_changes, build_order_item_changes, build_outlet_changes,
    build_outlet_product_changes, build_product_changes, build_register_changes,
    build_staff_changes, build_sync_pull_batch_request,
    build_sync_push_batch_request, decode_pull_batch_response_tables,
    pull_batch_response_has_more, pull_batch_response_latest_event_id,
    pull_batch_response_needs_full_resync, pull_batch_response_next_cursor,
    pull_batch_response_server_time, TablePushChanges,
};
```

If response helper functions are currently handwritten and not generated, either:

- Move them into the generator, or
- Keep only those small helpers handwritten in `protobuf.rs`.

Do not keep duplicate row mapping logic in both files.

**Step 6: Add Rust runtime drift test**

Create `rust-runtime-drift.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderRustSyncMappers } from "../rust-mapper-writer";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const localSchema = await import("@repo/database");

describe("generated Rust mapper drift", () => {
  test("runtime Rust generated mapper matches generator output", () => {
    const generated = renderRustSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );
    const checkedIn = readFileSync(
      join(
        repoRoot,
        "apps",
        "pos-app",
        "src-tauri",
        "src",
        "sync",
        "protobuf_generated.rs"
      ),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });
});

function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
```

If `rustfmt` changes formatting, update `renderRustSyncMappers` to emit rustfmt-stable formatting, or make the generator run rustfmt before writing Rust. Prefer generator-run rustfmt so drift tests compare formatted output.

**Step 7: Run tests and verify GREEN**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/file-output.test.ts
bun x vitest run packages/sync-proto-generator/src/__test__/rust-runtime-drift.test.ts
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::protobuf --lib
```

Expected: PASS.

**Step 8: Commit**

```bash
git add packages/sync-proto-generator/src apps/pos-app/src-tauri/src/sync/protobuf_generated.rs apps/pos-app/src-tauri/src/sync/protobuf.rs apps/pos-app/src-tauri/src/sync/mod.rs
git commit -m "feat(sync): use generated Rust sync protobuf mapper"
```

---

## Task 7: Expand Drift Check To All Generated Runtime Artifacts

**Files:**

- Modify: `packages/sync-proto-generator/src/__test__/drift.test.ts`
- Modify: `package.json`
- Optional modify: `packages/sync-proto-generator/package.json`

**Step 1: Write failing all-artifact drift test**

Extend `drift.test.ts` to verify:

- `packages/protobuf/proto/sync.proto`
- `apps/api/src/sync/protobuf.generated.ts`
- `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`

Use the same render functions used by CLI.

**Step 2: Run and verify RED if artifacts are stale**

Run:

```bash
bun run sync-proto:check
```

Expected before prior tasks are fully integrated: FAIL on missing/stale generated runtime files. After Tasks 5-6, it should pass.

**Step 3: Add generated check script**

In root `package.json`, keep:

```json
"sync-proto:check": "cd packages/sync-proto-generator && bun x vitest run src/__test__/drift.test.ts"
```

Add a stronger command:

```json
"sync-proto:verify": "bun run generate:sync-proto:write && bun run sync-proto:check && bun test packages/sync-proto-generator/src"
```

If `generate:sync-proto:write` changes files, the follow-up `sync-proto:check` should still pass, and `git diff --exit-code` should be run manually before commit.

**Step 4: Run tests and verify GREEN**

Run:

```bash
bun run sync-proto:check
bun test packages/sync-proto-generator/src
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json packages/sync-proto-generator/src/__test__/drift.test.ts
git commit -m "test(sync-proto-generator): guard runtime generated artifact drift"
```

---

## Task 8: Make Manifest Validation Strict

**Files:**

- Modify: `packages/sync-proto-generator/src/drizzle-reflection.ts`
- Modify: `packages/sync-proto-generator/src/manifest.ts`
- Modify: `packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/manifest.test.ts`

**Step 1: Write failing tests for bad field order**

Add to `drizzle-reflection.test.ts`:

```ts
test("throws when fieldOrder references a missing property", () => {
  expect(() =>
    reflectSyncTables(localSchema, {
      ...syncManifest,
      tables: syncManifest.tables.map((table) =>
        table.tableName === "products"
          ? { ...table, fieldOrder: ["id", "missingField"] }
          : table
      ),
    })
  ).toThrow(/products.*missingField/);
});
```

**Step 2: Write failing tests for omitted fields**

Add:

```ts
test("throws when fieldOrder omits reflected transport columns", () => {
  expect(() =>
    reflectSyncTables(localSchema, {
      ...syncManifest,
      tables: syncManifest.tables.map((table) =>
        table.tableName === "products" ? { ...table, fieldOrder: ["id"] } : table
      ),
    })
  ).toThrow(/products.*fieldOrder.*omits/);
});
```

**Step 3: Write failing tests for invalid aliases**

Add:

```ts
test("throws when field alias references a missing property", () => {
  expect(() =>
    reflectSyncTables(localSchema, {
      ...syncManifest,
      tables: syncManifest.tables.map((table) =>
        table.tableName === "products"
          ? {
              ...table,
              fieldAliases: {
                ...table.fieldAliases,
                missingField: { protoName: "missing_field", protoType: "int64" },
              },
            }
          : table
      ),
    })
  ).toThrow(/products.*missingField/);
});
```

**Step 4: Run and verify RED**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
```

Expected: FAIL because current reflection silently filters missing ordered fields.

**Step 5: Implement validation**

In `drizzle-reflection.ts`:

- Build `reflectedByProperty = new Map(...)`.
- Validate each alias key exists.
- Validate each `fieldOrder` entry exists.
- Validate each reflected transport column is present in `fieldOrder` unless explicitly excluded.
- Validate `protoName` uniqueness per table.
- Validate `columnName` uniqueness per table.

Use descriptive errors:

```ts
throw new Error(
  `Invalid sync manifest for ${manifestTable.tableName}: fieldOrder references missing property ${name}`
);
```

**Step 6: Add explicit per-table excluded columns if needed**

If some table intentionally omits a column beyond `globalExcludeColumns`, add to manifest type:

```ts
excludeColumns?: string[];
```

Use this instead of silently omitting fields.

**Step 7: Run tests and verify GREEN**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
bun test packages/sync-proto-generator/src
```

Expected: PASS.

**Step 8: Commit**

```bash
git add packages/sync-proto-generator/src/drizzle-reflection.ts packages/sync-proto-generator/src/manifest.ts packages/sync-proto-generator/src/__test__
git commit -m "fix(sync-proto-generator): fail fast on invalid manifest drift"
```

---

## Task 9: Fix Server Push Delete Semantics

**Files:**

- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Possibly modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`

**Step 1: Write failing service test for normal delete**

Add to `service.test.ts`:

```ts
test("accepts deletedIds for existing server rows and soft-deletes them", async () => {
  const set = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  const update = vi.fn().mockReturnValue({ set });
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });

  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: "product-1", updatedAt: "2026-05-17T00:00:00.000Z" },
              ]),
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  { id: "product-1", updatedAt: "2026-05-17T00:00:00.000Z" },
                ]),
              }),
            }),
          }),
        }),
        insert,
        update,
      };
      return await fn(tx);
    }
  );

  const result = await handlePushBatch(
    "outlet-1",
    "merchant-1",
    {
      products: {
        created: [],
        updated: [],
        deletedIds: ["product-1"],
      },
    },
    "idem-1",
    "request-hash-1"
  );

  expect(result.tables[0]?.acceptedDeletedIds).toEqual(["product-1"]);
  expect(result.tables[0]?.rejected).toEqual([]);
  expect(update).toHaveBeenCalled();
});
```

**Step 2: Run and verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current code rejects existing delete IDs as `server_newer`.

**Step 3: Decide hardcut delete policy**

Use this policy for this plan:

- `deletedIds` from the authenticated outlet is accepted for rows in that table scope.
- If the row exists, soft-delete it and emit a delete sync event.
- If the row does not exist, ack the delete as accepted idempotently and emit no duplicate row mutation unless current event model requires a tombstone.
- Keep future timestamp-aware delete conflicts as a later enhancement using typed tombstone rows.

**Step 4: Implement minimal change**

In `processTimestamplessDeletedIds`:

- Remove rejection of IDs that already exist.
- Call `softDeleteRowsForTableName` with all `deletedIds`.
- Add every `deletedId` to `acceptedDeletedIds`.
- Insert delete sync events for every accepted delete.

Keep idempotency behavior consistent with `sync_push_requests` request hash logic.

**Step 5: Update or remove old rejection test**

The existing test named `"rejects timestamp-less delete ids when server row exists"` now describes old behavior. Replace it with the new accepted-delete test or change the assertion.

**Step 6: Run tests and verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
git commit -m "fix(sync): accept typed delete ids for existing rows"
```

---

## Task 10: Add All-Table API Mapper Behavior Coverage

**Files:**

- Modify: `apps/api/src/sync/__test__/protobuf.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/ts-mapper-compare.test.ts`

**Step 1: Write failing parameterized API tests**

Add a test that covers all 10 table fields in one encode/decode round trip:

```ts
test("encodePullBatchResponse maps all sync tables into typed protobuf fields", () => {
  const encoded = encodePullBatchResponse({
    latestEventId: 12,
    needsFullResync: false,
    serverTime: "2026-05-17T00:00:00.000Z",
    hasMore: false,
    nextPageCursor: "",
    merchants: { created: [{ id: "merchant-1", name: "Toko" }], updated: [], deletedIds: [] },
    outlets: { created: [{ id: "outlet-1", merchantId: "merchant-1", name: "Outlet", timezone: "Asia/Jakarta", isActive: true }], updated: [], deletedIds: [] },
    registers: { created: [{ id: "register-1", outletId: "outlet-1", name: "Kasir", shortId: "R1", isActive: true }], updated: [], deletedIds: [] },
    categories: { created: [{ id: "cat-1", merchantId: "merchant-1", name: "Minuman", sortOrder: 1, isActive: true }], updated: [], deletedIds: [] },
    assets: { created: [{ id: "asset-1", merchantId: "merchant-1", objectKey: "assets/1", contentType: "image/jpeg", byteSize: 123, contentHash: "hash", kind: "product_photo", width: 10, height: 20, status: "ready" }], updated: [], deletedIds: [] },
    products: { created: [{ id: "product-1", merchantId: "merchant-1", name: "Kopi", price: 15000, sortOrder: 1, isActive: true }], updated: [], deletedIds: [] },
    orders: { created: [{ id: "order-1", outletId: "outlet-1", orderNumber: "001", total: 15000, amountPaid: 20000, changeAmount: 5000, paymentMethod: "cash", status: "paid" }], updated: [], deletedIds: [] },
    order_items: { created: [{ id: "item-1", orderId: "order-1", outletId: "outlet-1", productName: "Kopi", quantity: 1, unitPrice: 15000, originalPrice: 15000, subtotal: 15000 }], updated: [], deletedIds: [] },
    outlet_products: { created: [{ id: "op-1", outletId: "outlet-1", productId: "product-1", price: 15000, isAvailable: true, sortOrder: 1 }], updated: [], deletedIds: [] },
    staff: { created: [{ id: "staff-1", merchantId: "merchant-1", name: "Owner", role: "owner", isActive: true }], updated: [], deletedIds: [] },
  });

  expect(encoded.merchants?.created).toHaveLength(1);
  expect(encoded.outlets?.created).toHaveLength(1);
  expect(encoded.registers?.created).toHaveLength(1);
  expect(encoded.categories?.created[0]?.sortOrder).toBe(1n);
  expect(encoded.assets?.created[0]?.byteSize).toBe(123n);
  expect(encoded.products?.created[0]?.priceMinorUnits).toBe(15000n);
  expect(encoded.orders?.created[0]?.totalMinorUnits).toBe(15000n);
  expect(encoded.orderItems?.created[0]?.unitPriceMinorUnits).toBe(15000n);
  expect(encoded.outletProducts?.created[0]?.priceMinorUnits).toBe(15000n);
  expect(encoded.staff?.created).toHaveLength(1);
});
```

**Step 2: Run and verify RED or GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: If earlier tasks are incomplete, FAIL on `order_items` or `outlet_products`; after Tasks 3-5, PASS.

**Step 3: Add generated mapper mirror test**

In `ts-mapper-compare.test.ts`, add the same service-key shape using `encodeGeneratedPullBatchResponse` to prove generator behavior.

**Step 4: Run tests**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/ts-mapper-compare.test.ts
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/__test__/protobuf.test.ts packages/sync-proto-generator/src/__test__/ts-mapper-compare.test.ts
git commit -m "test(sync): cover generated API mapping for all sync tables"
```

---

## Task 11: Add All-Table Rust Push/Pull Mapper Coverage

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Possibly modify: `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`
- Modify: `packages/sync-proto-generator/src/__test__/rust-mapper-compare.test.ts`

**Step 1: Write Rust all-table push builder test**

In `apps/pos-app/src-tauri/src/sync/protobuf.rs` tests, add a test that builds at least one created row for every table and asserts the resulting request has all 10 change wrappers populated.

Use compact `serde_json::json!` rows. Include the tricky fields:

- `products.price`
- `orders.total`, `orders.amountPaid`, `orders.changeAmount`
- `order_items.unitPrice`, `order_items.originalPrice`, `order_items.subtotal`
- `outlet_products.price`
- nullable string fields on assets/register/staff

**Step 2: Run and verify RED or GREEN**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::protobuf::tests::build_sync_push_batch_request_maps_all_sync_tables --lib
```

Expected: If generated runtime integration is incomplete, FAIL; after Tasks 2 and 6, PASS.

**Step 3: Write Rust all-table pull decoder test**

Add a test that constructs `SyncPullBatchResponse` with all 10 table change wrappers and asserts the decoded map contains all service keys:

```rust
assert!(tables.contains_key("merchants"));
assert!(tables.contains_key("outlets"));
assert!(tables.contains_key("registers"));
assert!(tables.contains_key("categories"));
assert!(tables.contains_key("assets"));
assert!(tables.contains_key("products"));
assert!(tables.contains_key("orders"));
assert!(tables.contains_key("order_items"));
assert!(tables.contains_key("outlet_products"));
assert!(tables.contains_key("staff"));
```

Also assert aliased local JSON keys:

```rust
assert_eq!(tables["order_items"][0]["unitPrice"], json!(15000));
assert_eq!(tables["outlet_products"][0]["price"], json!(15000));
```

**Step 4: Run and verify**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::protobuf --lib
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync/protobuf.rs packages/sync-proto-generator/src/__test__/rust-mapper-compare.test.ts
git commit -m "test(sync): cover Rust generated mapping for all sync tables"
```

---

## Task 12: Add Route-Level Typed Push/Pull Coverage For Multi-Word Tables

**Files:**

- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`

**Step 1: Write failing push route test for `order_items` and `outlet_products`**

Add a test that sends `SyncPushBatchRequest` with:

- `orderItems.created`
- `outletProducts.created`

Assert `handlePushBatch` receives:

- `changes.order_items`
- `changes.outlet_products`

**Step 2: Run and verify RED or GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: If generated API decode still uses wrong keys, FAIL; after Tasks 3-5, PASS.

**Step 3: Write pull route test for service keys**

Mock `handlePullBatch` returning:

```ts
{
  order_items: { created: [...], updated: [], deletedIds: [] },
  outlet_products: { created: [...], updated: [], deletedIds: [] },
  ...
}
```

Assert decoded `SyncPullBatchResponse` has:

- `decoded.orderItems?.created`
- `decoded.outletProducts?.created`

**Step 4: Run and verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/__test__/routes-protobuf.test.ts
git commit -m "test(sync): cover typed route mapping for multi-word tables"
```

---

## Task 13: Make Generator CLI Format Rust Before Writing

**Files:**

- Modify: `packages/sync-proto-generator/src/cli.ts`
- Modify: `packages/sync-proto-generator/src/__test__/file-output.test.ts` or create `cli-format.test.ts`

**Step 1: Write failing test for Rust formatting hook**

Prefer extracting a helper from CLI:

```ts
export function formatGeneratedRust(source: string): string {
  ...
}
```

Then test:

```ts
test("formats generated Rust before writing", () => {
  const formatted = formatGeneratedRust("fn main(){println!(\"x\");}\n");
  expect(formatted).toContain("fn main() {");
});
```

**Step 2: Run and verify RED**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/cli-format.test.ts
```

Expected: FAIL because no formatting helper exists.

**Step 3: Implement formatting helper**

Use `Bun.spawnSync` with stdin:

```ts
export function formatGeneratedRust(source: string): string {
  const proc = Bun.spawnSync(["rustfmt", "--edition", "2021"], {
    stdin: source,
  });
  if (proc.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(proc.stderr));
  }
  return new TextDecoder().decode(proc.stdout);
}
```

If Bun's stdin API does not accept string in this repo version, use a temporary file helper. Keep the helper tested.

**Step 4: Apply helper in CLI**

Before writing `pos-sync-mappers.rs` / `protobuf_generated.rs`, run `formatGeneratedRust`.

**Step 5: Run tests and verify GREEN**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/cli-format.test.ts
bun run generate:sync-proto:write
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
bun run sync-proto:check
```

Expected: PASS and no diff after repeated generation:

```bash
git diff -- apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: empty diff after committing generated output.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
git commit -m "fix(sync-proto-generator): format generated Rust output"
```

---

## Task 14: Add Payload And Contract Size Regression Tests For All Tables

**Files:**

- Modify: `apps/api/src/sync/__test__/payload-size.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/no-json-sync-contract.test.ts`

**Step 1: Expand payload size test**

Add a test that constructs representative rows for all 10 tables and compares:

- typed protobuf `SyncPushBatchRequest.encode(...).finish().byteLength`
- old JSON fallback equivalent with `createdJson` and `updatedJson`

Use enough rows to make the bandwidth difference meaningful, for example 20 rows per table.

**Step 2: Run and verify**

Run:

```bash
bun test apps/api/src/sync/__test__/payload-size.test.ts
```

Expected: PASS and typed protobuf remains smaller.

**Step 3: Strengthen no-JSON contract test**

Ensure the test checks both source proto and generated ts-proto output:

```ts
expect(proto).not.toMatch(/json_tables|created_json|updated_json|SyncJsonTableChanges/);
expect(generatedTs).not.toMatch(/jsonTables|createdJson|updatedJson|SyncJsonTableChanges/);
```

**Step 4: Run and verify**

Run:

```bash
bun x vitest run packages/sync-proto-generator/src/__test__/no-json-sync-contract.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/__test__/payload-size.test.ts packages/sync-proto-generator/src/__test__/no-json-sync-contract.test.ts
git commit -m "test(sync): guard all-table typed protobuf payload contract"
```

---

## Task 15: Update Logs And Verification Docs For Typed Sync Generator

**Files:**

- Read before editing: `docs/knowledge/APP-LOGGING-DOCS.md`
- Modify if prefixes changed: `docs/knowledge/APP-LOGGING-DOCS.md`
- Modify: `logs/capture-adb-logcat.sh`
- Modify or create: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`

**Step 1: Read logging docs**

Run:

```bash
sed -n '1,220p' docs/knowledge/APP-LOGGING-DOCS.md
```

**Step 2: Add generator docs**

Create `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md` with:

- What is generated.
- What remains handwritten.
- How to regenerate.
- How to check drift.
- How to add a synced column.
- How to add a synced table.
- Required verification commands.
- Known follow-up: direct Rust `sqlx::Row` to Prost mapping.

**Step 3: Update log filter**

If this work adds or depends on `[RUST] [SYNC:TRACE]` or `[JS] [SYNC:*]`, ensure `logs/capture-adb-logcat.sh` includes the exact sync path:

```bash
LOG_FILTER='\\[(JS|RUST)\\] \\[(SYNC|DB):|sync_proto|push_batch|pull_batch|upsert_row'
```

Do not remove existing useful filters unless they are unrelated noise.

**Step 4: Run docs/lint check**

Run:

```bash
bun x ultracite check docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md logs/capture-adb-logcat.sh
```

Expected: PASS or only documented markdown warnings that must be fixed before commit.

**Step 5: Commit**

```bash
git add docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md docs/knowledge/APP-LOGGING-DOCS.md logs/capture-adb-logcat.sh
git commit -m "docs(sync): document typed protobuf generator workflow"
```

---

## Task 16: Full Verification Gate And Cleanup

**Files:**

- No planned source changes unless verification reveals issues.

**Step 1: Regenerate artifacts**

Run:

```bash
bun run generate:sync-proto:write
```

Expected: no unexpected changes after committed generator output.

**Step 2: Check generated drift**

Run:

```bash
bun run sync-proto:check
```

Expected: PASS for proto, API generated mapper, and Rust generated mapper.

**Step 3: Run generator tests**

Run:

```bash
bun test packages/sync-proto-generator/src
```

Expected: PASS.

**Step 4: Run API sync tests**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/api/src/sync/__test__/payload-size.test.ts
```

Expected: PASS.

**Step 5: Run Rust sync tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: PASS.

**Step 6: Run Rust formatting check**

Run:

```bash
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: PASS.

**Step 7: Run lint**

Run:

```bash
bun x ultracite check packages/sync-proto-generator apps/api/src/sync apps/pos-app/src-tauri/src/sync packages/protobuf/proto/sync.proto docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md logs/capture-adb-logcat.sh
```

Expected: PASS.

**Step 8: Check git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intentional changes from this plan.

**Step 9: Commit final cleanup if needed**

If verification required cleanup changes:

```bash
git add <changed-files>
git commit -m "chore(sync): verify typed protobuf generator hardening"
```

---

## Manual Verification Guide

Use this after automated verification passes.

**Manual UI Steps:**

1. Launch POS app against local/dev API.
2. Create or update one category, product, staff member, order, and order item.
3. Trigger sync push.
4. Trigger sync pull from a fresh local database or reset cursor.
5. Delete one product or category locally and trigger sync push.
6. Pull again and confirm tombstone is applied locally.

**Log Checks:**

Use the project capture script:

```bash
bash logs/capture-adb-logcat.sh
```

Or PID-scoped sync logs:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(SYNC|DB):|push_batch|pull_batch|upsert_row'
```

Look for:

- `push_batch: table=..., created=..., updated=..., deleted=...`
- `push_batch response: tables=...`
- `pull_batch: table=..., rows_from_server=...`
- `upsert_row OK`

**State Checks:**

Use SQLite inspection on local app DB if available:

```sql
select id, is_synced, deleted_at, updated_at from products order by updated_at desc limit 10;
select table_name, row_id, operation, synced_at from sync_outbox order by changed_at desc limit 20;
select outlet_id, last_server_event_id from sync_cursors;
```

Use API DB inspection for server rows:

```sql
select id, deleted_at, updated_at from products order by updated_at desc limit 10;
select table_name, row_id, operation, changed_at from sync_events order by id desc limit 20;
```

**Edge Cases To Simulate:**

1. Multi-word table pull: create `order_items` and `outlet_products` on server and verify POS receives them.
2. Delete existing row: create product, sync it, delete it locally, push, and verify server `deleted_at` is set.
3. Generator drift: manually edit `apps/api/src/sync/protobuf.generated.ts`, run `bun run sync-proto:check`, and verify it fails. Revert the manual edit after the check.

---

## Follow-Ups After This Plan

- Refactor Rust push mappers to map directly from `sqlx::Row` to Prost structs without `serde_json::Value`.
- Refactor Rust pull application to apply typed rows directly to SQLite without rehydrating JSON maps.
- Add schema evolution policy for field-number reservation and deprecation once the app is launched.
- Add CI job that runs `bun run sync-proto:verify` plus Cargo sync tests on every PR touching schema/sync/proto files.
