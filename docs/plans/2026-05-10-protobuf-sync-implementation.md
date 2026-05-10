# Protobuf Sync Transport Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace JSON HTTP bodies with protobuf bodies for all POS sync endpoints to reduce sync bandwidth while preserving existing sync behavior.

**Architecture:** Add a shared `packages/protobuf` workspace package containing `sync.proto` and generated TypeScript. The API uses a small local Elysia `tsProtoPlugin` to parse `application/x-protobuf`, decode route request bodies, and encode route responses, while sync-specific mappers keep the service layer JSON-object based. The Solid status client and Rust Tauri sync transport encode/decode protobuf while keeping existing local SQLite sync logic and `serde_json::Value` row handling.

**Tech Stack:** TypeScript, Bun, Elysia, ts-proto, protobufjs, Rust, Tauri, reqwest, prost, prost-build, serde_json, Bun test, Cargo test, Ultracite

---

## Protocol Contract

Use this schema as the initial contract in `packages/protobuf/proto/sync.proto`:

```proto
syntax = "proto3";

package sakti.sync.v1;

message SyncPushRequest {
  string outlet_id = 1;
  string payload_json = 2;
}

message SyncServerWin {
  string table = 1;
  repeated string ids = 2;
}

message SyncPushResponse {
  repeated SyncServerWin server_wins = 1;
  string server_time = 2;
}

message SyncStatusRequest {
  string outlet_id = 1;
  int64 last_server_event_id = 2;
}

message SyncStatusResponse {
  repeated string changed_tables = 1;
  bool has_changes = 2;
  int64 latest_event_id = 3;
  bool needs_full_resync = 4;
  int64 oldest_available_event_id = 5;
  bool has_oldest_available_event_id = 6;
}

message SyncPullEventsRequest {
  string outlet_id = 1;
  int64 after_event_id = 2;
}

message SyncTableRows {
  string table = 1;
  string rows_json = 2;
}

message SyncPullEventsResponse {
  repeated SyncTableRows tables = 1;
  int64 latest_event_id = 2;
  bool needs_full_resync = 3;
}

message SyncPullRequest {
  string outlet_id = 1;
  repeated string tables = 2;
  string since = 3;
}

message SyncPullResponse {
  repeated SyncTableRows tables = 1;
  string server_time = 2;
}
```

`oldest_available_event_id` uses an explicit `has_oldest_available_event_id` boolean because proto3 scalar fields do not preserve null presence across all toolchains.

## Task 1: Create the Shared Protobuf Package

**Files:**
- Create: `packages/protobuf/package.json`
- Create: `packages/protobuf/tsconfig.json`
- Create: `packages/protobuf/proto/sync.proto`
- Create: `packages/protobuf/src/.gitkeep`
- Modify: `package.json`

**Step 1: Write the failing workspace generation check**

Run:

```bash
bun run --filter=@repo/protobuf generate
```

Expected: FAIL because the package does not exist.

**Step 2: Add the package files**

Create `packages/protobuf/package.json`:

```json
{
  "name": "@repo/protobuf",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./sync": "./src/proto/sync.ts"
  },
  "scripts": {
    "generate": "protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=src --ts_proto_opt=esModuleInterop=true,forceLong=number,outputServices=false,useExactTypes=false proto/sync.proto",
    "lint": "ultracite check",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "protobufjs": "^7.5.4"
  },
  "devDependencies": {
    "@repo/typescript-config": "*",
    "ts-proto": "^2.8.3",
    "typescript": "5.9.2"
  }
}
```

Create `packages/protobuf/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/protobuf/proto/sync.proto` with the schema from the Protocol Contract section.

Create `packages/protobuf/src/.gitkeep`.

**Step 3: Generate TypeScript**

Run:

```bash
bun install
bun run --filter=@repo/protobuf generate
```

Expected: PASS and `packages/protobuf/src/proto/sync.ts` exists.

If `protoc` is missing, install it at the system level or replace the script with a repo-local protoc wrapper before continuing. Do not hand-write generated protobuf code.

**Step 4: Typecheck the package**

Run:

```bash
bun run --filter=@repo/protobuf typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json bun.lock packages/protobuf
git commit -m "feat: add shared protobuf sync schema"
```

## Task 2: Add API ts-proto Plugin and Protobuf Mapping Helpers

**Files:**
- Create: `apps/api/src/plugins/ts-proto.ts`
- Create: `apps/api/src/plugins/__test__/ts-proto.test.ts`
- Create: `apps/api/src/sync/protobuf.ts`
- Create: `apps/api/src/sync/__test__/protobuf.test.ts`
- Modify: `apps/api/package.json`

**Step 1: Add the failing plugin tests**

Create `apps/api/src/plugins/__test__/ts-proto.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { SyncStatusRequest, SyncStatusResponse } from "@repo/protobuf/sync";
import { Elysia } from "elysia";
import { tsProtoPlugin } from "../ts-proto";

describe("tsProtoPlugin", () => {
  test("decodes protobuf request bodies and encodes protobuf responses", async () => {
    const app = new Elysia()
      .use(tsProtoPlugin)
      .post(
        "/status",
        ({ body }) => {
          const request = body as SyncStatusRequest;
          return {
            changedTables: [request.outletId],
            hasChanges: true,
            hasOldestAvailableEventId: false,
            latestEventId: request.lastServerEventId + 1,
            needsFullResync: false,
            oldestAvailableEventId: 0,
          };
        },
        {
          proto: {
            req: SyncStatusRequest,
            res: SyncStatusResponse,
          },
        }
      )
      .compile();

    const requestBody = SyncStatusRequest.encode(
      SyncStatusRequest.create({
        lastServerEventId: 10,
        outletId: "outlet-1",
      })
    ).finish();

    const response = await app.handle(
      new Request("http://localhost/status", {
        body: requestBody,
        headers: { "Content-Type": "application/x-protobuf" },
        method: "POST",
      })
    );
    const decoded = SyncStatusResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/x-protobuf"
    );
    expect(decoded.latestEventId).toBe(11);
    expect(decoded.changedTables).toEqual(["outlet-1"]);
  });

  test("returns 400 for malformed protobuf request bodies", async () => {
    const app = new Elysia()
      .use(tsProtoPlugin)
      .post("/status", () => ({ latestEventId: 1 }), {
        proto: {
          req: SyncStatusRequest,
          res: SyncStatusResponse,
        },
      })
      .compile();

    const response = await app.handle(
      new Request("http://localhost/status", {
        body: new Uint8Array([255, 255, 255]),
        headers: { "Content-Type": "application/x-protobuf" },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
  });
});
```

**Step 2: Run plugin tests to verify they fail**

Run:

```bash
cd apps/api && bun test src/plugins/__test__/ts-proto.test.ts
```

Expected: FAIL because `../ts-proto` does not exist.

**Step 3: Add dependency**

Add this dependency to `apps/api/package.json`:

```json
"@repo/protobuf": "*"
```

**Step 4: Implement the plugin**

Create `apps/api/src/plugins/ts-proto.ts`:

```typescript
import { Elysia } from "elysia";

const PROTOBUF_CONTENT_TYPE = "application/x-protobuf";

export interface TsProtoClass<T> {
  decode(input: Uint8Array | number[], length?: number): T;
  encode(message: T, writer?: unknown): { finish(): Uint8Array };
}

interface ProtoSchemas {
  req?: TsProtoClass<unknown>;
  res?: TsProtoClass<unknown>;
}

export const tsProtoPlugin = new Elysia({ name: "elysia-ts-proto" })
  .onParse(({ contentType, request }) => {
    if (contentType === PROTOBUF_CONTENT_TYPE) {
      return request.arrayBuffer();
    }
  })
  .macro({
    proto(schemas: ProtoSchemas) {
      return {
        beforeHandle(context) {
          if (!schemas.req || !context.body) {
            return;
          }

          try {
            context.body = schemas.req.decode(
              new Uint8Array(context.body as ArrayBuffer)
            );
          } catch (error) {
            console.error("[protobuf] decode failed", error);
            return context.error(400, "Invalid Protobuf payload");
          }
        },
        mapResponse(context) {
          if (!schemas.res || context.responseValue == null) {
            return;
          }

          context.set.headers["Content-Type"] = PROTOBUF_CONTENT_TYPE;
          const binary = schemas.res.encode(context.responseValue).finish();
          return new Response(binary, {
            headers: context.set.headers as HeadersInit,
            status:
              typeof context.set.status === "number"
                ? context.set.status
                : undefined,
          });
        },
      };
    },
  });
```

Important implementation detail: do not return `{ body: decoded }` from `beforeHandle`. In Elysia 1.4, a non-`undefined` `beforeHandle` return is treated as an early response. Mutate `context.body` instead.

**Step 5: Run plugin tests**

Run:

```bash
cd apps/api && bun test src/plugins/__test__/ts-proto.test.ts
```

Expected: PASS.

**Step 6: Add the failing sync mapper tests**

Create `apps/api/src/sync/__test__/protobuf.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  decodePushRequestTables,
  encodePullResponse,
  encodeStatusResponse,
} from "../protobuf";

describe("sync protobuf helpers", () => {
  test("decodes push request payload JSON into table rows", () => {
    const tables = decodePushRequestTables(
      JSON.stringify({
        products: [{ id: "product-1", name: "Coffee" }],
      })
    );

    expect(tables).toEqual({
      products: [{ id: "product-1", name: "Coffee" }],
    });
  });

  test("rejects malformed push payload JSON", () => {
    expect(() => decodePushRequestTables("{bad-json")).toThrow(
      "Invalid sync payload JSON"
    );
  });

  test("encodes status null oldest event with explicit presence flag", () => {
    const response = encodeStatusResponse({
      changedTables: [],
      hasChanges: false,
      latestEventId: 10,
      needsFullResync: false,
      oldestAvailableEventId: null,
    });

    expect(response.oldestAvailableEventId).toBe(0);
    expect(response.hasOldestAvailableEventId).toBe(false);
  });

  test("encodes table rows as JSON strings", () => {
    const response = encodePullResponse({
      products: [{ id: "product-1" }],
      serverTime: "2026-05-10T00:00:00.000Z",
    });

    expect(response.serverTime).toBe("2026-05-10T00:00:00.000Z");
    expect(response.tables).toEqual([
      { table: "products", rowsJson: JSON.stringify([{ id: "product-1" }]) },
    ]);
  });
});
```

**Step 7: Run mapper tests to verify they fail**

Run:

```bash
cd apps/api && bun test src/sync/__test__/protobuf.test.ts
```

Expected: FAIL because `../protobuf` does not exist.

**Step 8: Implement the helpers**

Create `apps/api/src/sync/protobuf.ts`:

```typescript
import {
  SyncPullEventsResponse,
  SyncPullResponse,
  SyncPushResponse,
  SyncStatusResponse,
  type SyncTableRows,
} from "@repo/protobuf/sync";

type TableRows = Record<string, unknown[]>;

interface SyncStatusResult {
  changedTables: string[];
  hasChanges: boolean;
  latestEventId: number;
  needsFullResync: boolean;
  oldestAvailableEventId: number | null;
}

function isTableRows(value: unknown): value is TableRows {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((rows) => Array.isArray(rows));
}

export function decodePushRequestTables(payloadJson: string): TableRows {
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (!isTableRows(parsed)) {
      throw new Error("Invalid sync payload shape");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid sync payload shape") {
      throw error;
    }
    throw new Error("Invalid sync payload JSON");
  }
}

function tableRowsFromResult(result: Record<string, unknown>): SyncTableRows[] {
  const rows: SyncTableRows[] = [];
  for (const [table, value] of Object.entries(result)) {
    if (!Array.isArray(value)) {
      continue;
    }
    rows.push({ rowsJson: JSON.stringify(value), table });
  }
  return rows;
}

export function encodePushResponse(result: {
  serverTime: string;
  serverWins: { ids: string[]; table: string }[];
}): SyncPushResponse {
  return SyncPushResponse.create({
    serverTime: result.serverTime,
    serverWins: result.serverWins,
  });
}

export function encodeStatusResponse(result: SyncStatusResult): SyncStatusResponse {
  return SyncStatusResponse.create({
    changedTables: result.changedTables,
    hasChanges: result.hasChanges,
    hasOldestAvailableEventId: result.oldestAvailableEventId !== null,
    latestEventId: result.latestEventId,
    needsFullResync: result.needsFullResync,
    oldestAvailableEventId: result.oldestAvailableEventId ?? 0,
  });
}

export function encodePullEventsResponse(
  result: Record<string, unknown> & {
    latestEventId: number;
    needsFullResync: boolean;
  }
): SyncPullEventsResponse {
  return SyncPullEventsResponse.create({
    latestEventId: result.latestEventId,
    needsFullResync: result.needsFullResync,
    tables: tableRowsFromResult(result),
  });
}

export function encodePullResponse(
  result: Record<string, unknown> & { serverTime: string }
): SyncPullResponse {
  return SyncPullResponse.create({
    serverTime: result.serverTime,
    tables: tableRowsFromResult(result),
  });
}
```

**Step 9: Run mapper tests**

Run:

```bash
cd apps/api && bun test src/sync/__test__/protobuf.test.ts
```

Expected: PASS.

**Step 10: Commit**

```bash
git add apps/api/package.json apps/api/src/plugins/ts-proto.ts apps/api/src/plugins/__test__/ts-proto.test.ts apps/api/src/sync/protobuf.ts apps/api/src/sync/__test__/protobuf.test.ts
git commit -m "feat: add api ts-proto sync transport"
```

## Task 3: Convert API Sync Routes to Protobuf

**Files:**
- Modify: `apps/api/src/sync/routes.ts`
- Create: `apps/api/src/sync/__test__/routes-protobuf.test.ts`

**Step 1: Add failing route tests**

Create `apps/api/src/sync/__test__/routes-protobuf.test.ts` with tests that:

- Mock `getSessionFromRequest` to return `{ userId: "user-1" }`.
- Mock `verifyOutletAccess` to return `true`.
- Mock `handlePush`, `handleSyncStatus`, `handleEventPull`, and `handlePull`.
- Mock `db.select().from().where().limit()` to return `{ merchantId: "merchant-1" }`.
- Send protobuf bytes to each endpoint.
- Decode the response bytes and assert the expected protobuf fields.

Use this request helper:

```typescript
async function makeProtobufRequest(path: string, body: Uint8Array) {
  const app = syncRoutes.compile();
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      body,
      headers: {
        "Content-Type": "application/x-protobuf",
        cookie: "narvik_session=valid-token",
      },
      method: "POST",
    })
  );
  return response;
}
```

Add one test per endpoint. Example for push:

```typescript
test("POST /api/sync/push accepts protobuf and returns protobuf", async () => {
  mockHandlePush.mockResolvedValue({
    serverTime: "2026-05-10T00:00:00.000Z",
    serverWins: [{ ids: ["product-1"], table: "products" }],
  });

  const body = SyncPushRequest.encode(
    SyncPushRequest.create({
      outletId: "outlet-1",
      payloadJson: JSON.stringify({ products: [{ id: "product-1" }] }),
    })
  ).finish();

  const response = await makeProtobufRequest("/api/sync/push", body);
  const decoded = SyncPushResponse.decode(
    new Uint8Array(await response.arrayBuffer())
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("application/x-protobuf");
  expect(mockHandlePush).toHaveBeenCalledWith("outlet-1", "merchant-1", {
    products: [{ id: "product-1" }],
  });
  expect(decoded.serverWins).toEqual([
    { ids: ["product-1"], table: "products" },
  ]);
});
```

Add a malformed JSON test:

```typescript
test("POST /api/sync/push returns 400 for malformed embedded JSON", async () => {
  const body = SyncPushRequest.encode(
    SyncPushRequest.create({ outletId: "outlet-1", payloadJson: "{bad-json" })
  ).finish();

  const response = await makeProtobufRequest("/api/sync/push", body);

  expect(response.status).toBe(400);
  expect(mockHandlePush).not.toHaveBeenCalled();
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/api && bun test src/sync/__test__/routes-protobuf.test.ts
```

Expected: FAIL because routes still expect JSON and `GET` query params.

**Step 3: Implement protobuf route handling**

In `apps/api/src/sync/routes.ts`:

- Import protobuf messages from `@repo/protobuf/sync`.
- Import `tsProtoPlugin` from `../plugins/ts-proto`.
- Import mapping helpers from `./protobuf`.
- Add `.use(tsProtoPlugin)` to the sync route chain.
- Remove Elysia body/query validators from sync routes.
- Change `/status`, `/pull-events`, and `/pull` from `.get` to `.post`.
- Add route-local `proto: { req: MessageRequest, res: MessageResponse }`.
- Treat `body` in handlers as the already-decoded generated request object and assign it to an explicit generated type, for example `const request = body as SyncPushRequest`.
- Return generated response-shaped objects or sync mapper outputs. The plugin encodes them.

Keep auth and outlet lookup behavior unchanged.

**Step 4: Run route tests**

Run:

```bash
cd apps/api && bun test src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 5: Run service tests to catch regressions**

Run:

```bash
cd apps/api && bun test src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/sync/routes.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
git commit -m "feat: serve sync api over protobuf"
```

## Task 4: Convert Solid Status Client to Protobuf

**Files:**
- Modify: `apps/pos-app/package.json`
- Modify: `apps/pos-app/src/lib/sync/api.ts`
- Modify: `apps/pos-app/src/lib/__test__/http.test.ts` only if shared HTTP assumptions need adjustment
- Create: `apps/pos-app/src/lib/sync/__test__/api.test.ts` if it does not exist

**Step 1: Add dependency**

Add this dependency to `apps/pos-app/package.json`:

```json
"@repo/protobuf": "*"
```

**Step 2: Add failing status client test**

Create `apps/pos-app/src/lib/sync/__test__/api.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";
import { SyncStatusResponse } from "@repo/protobuf/sync";
import { getSyncStatus } from "../api";

describe("getSyncStatus", () => {
  test("posts protobuf status request and decodes protobuf response", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/x-protobuf"
      );
      expect(init?.body).toBeInstanceOf(Uint8Array);

      const responseBody = SyncStatusResponse.encode(
        SyncStatusResponse.create({
          changedTables: ["products"],
          hasChanges: true,
          hasOldestAvailableEventId: true,
          latestEventId: 12,
          needsFullResync: false,
          oldestAvailableEventId: 10,
        })
      ).finish();

      return new Response(responseBody, {
        headers: { "Content-Type": "application/x-protobuf" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSyncStatus({
      lastServerEventId: 10,
      outletId: "outlet-1",
    });

    expect(result).toEqual({
      changedTables: ["products"],
      hasChanges: true,
      latestEventId: 12,
      needsFullResync: false,
      oldestAvailableEventId: 10,
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun test src/lib/sync/__test__/api.test.ts
```

Expected: FAIL because `getSyncStatus` still sends JSON/GET through `ky`.

**Step 4: Implement protobuf fetch**

In `apps/pos-app/src/lib/sync/api.ts`:

- Import `API_URL` if needed, matching the existing HTTP client base URL behavior.
- Import `SyncStatusRequest` and `SyncStatusResponse`.
- Replace `api.get("api/sync/status", ...)` with `fetch`.
- Send `POST ${API_URL}/api/sync/status`.
- Set `Content-Type` and `Accept` to `application/x-protobuf`.
- Decode response with `SyncStatusResponse.decode`.
- Map `oldestAvailableEventId` to `null` when `hasOldestAvailableEventId` is false.

**Step 5: Run status client tests**

Run:

```bash
cd apps/pos-app && bun test src/lib/sync/__test__/api.test.ts
```

Expected: PASS.

**Step 6: Run sync store tests**

Run:

```bash
cd apps/pos-app && bun test src/store/__test__/sync.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/pos-app/package.json apps/pos-app/src/lib/sync/api.ts apps/pos-app/src/lib/sync/__test__/api.test.ts
git commit -m "feat: request sync status with protobuf"
```

## Task 5: Add Rust Protobuf Generation and Mapping Helpers

**Files:**
- Modify: `apps/pos-app/src-tauri/Cargo.toml`
- Modify: `apps/pos-app/src-tauri/build.rs`
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Add failing Rust test for helper API**

Add tests inside the existing `#[cfg(test)] mod tests` in `apps/pos-app/src-tauri/src/sync.rs`:

```rust
#[test]
fn protobuf_table_rows_decode_json_rows() {
    let tables = vec![SyncTableRows {
        table: "products".to_string(),
        rows_json: r#"[{"id":"product-1"}]"#.to_string(),
    }];

    let result = protobuf_tables_to_json_map(tables).expect("tables should decode");

    assert_eq!(
        result
            .get("products")
            .and_then(|value| value.as_array())
            .map(|rows| rows.len()),
        Some(1)
    );
}

```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test protobuf_
```

Expected: FAIL because generated protobuf structs and helpers do not exist.

**Step 3: Add Rust dependencies**

In `apps/pos-app/src-tauri/Cargo.toml` add:

```toml
[build-dependencies]
prost-build = "0.13"
tauri-build = { version = "2", features = [] }

[dependencies]
prost = "0.13"
```

Keep existing dependencies unchanged.

**Step 4: Generate protobuf in build.rs**

Modify `apps/pos-app/src-tauri/build.rs`:

```rust
fn main() {
    println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    println!("cargo:rerun-if-changed=../../../packages/protobuf/proto/sync.proto");

    prost_build::compile_protos(
        &["../../../packages/protobuf/proto/sync.proto"],
        &["../../../packages/protobuf/proto"],
    )
    .expect("failed to compile protobuf sync schema");

    tauri_build::build()
}
```

**Step 5: Include generated module and helpers**

Near the top of `apps/pos-app/src-tauri/src/sync.rs`:

```rust
use prost::Message;
use serde_json::Value;

include!(concat!(env!("OUT_DIR"), "/sakti.sync.v1.rs"));
```

Add helpers:

```rust
fn protobuf_tables_to_json_map(tables: Vec<SyncTableRows>) -> Result<Value, String> {
    let mut map = serde_json::Map::new();
    for table in tables {
        let rows: Value = serde_json::from_str(&table.rows_json)
            .map_err(|e| format!("Failed to parse protobuf rows for {}: {}", table.table, e))?;
        map.insert(table.table, rows);
    }
    Ok(Value::Object(map))
}

```

**Step 6: Run tests**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test protobuf_
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/pos-app/src-tauri/Cargo.toml apps/pos-app/src-tauri/Cargo.lock apps/pos-app/src-tauri/build.rs apps/pos-app/src-tauri/src/sync.rs
git commit -m "feat: generate rust sync protobuf types"
```

## Task 6: Convert Rust Push to Protobuf

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Add failing tests for push request/response helpers**

Add helper tests:

```rust
#[test]
fn build_push_request_encodes_outlet_and_payload_json() {
    let mut tables = serde_json::Map::new();
    tables.insert("products".to_string(), serde_json::json!([{ "id": "product-1" }]));

    let request = build_sync_push_request("outlet-1", Value::Object(tables));

    assert_eq!(request.outlet_id, "outlet-1");
    assert!(request.payload_json.contains("product-1"));
}

#[test]
fn push_response_server_wins_to_map_groups_ids_by_table() {
    let response = SyncPushResponse {
        server_time: "2026-05-10T00:00:00.000Z".to_string(),
        server_wins: vec![SyncServerWin {
            table: "products".to_string(),
            ids: vec!["product-1".to_string()],
        }],
    };

    let map = server_wins_to_skip_map(response.server_wins);

    assert!(map
        .get("products")
        .is_some_and(|ids| ids.contains("product-1")));
}
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test push_
```

Expected: FAIL because helpers do not exist.

**Step 3: Add helpers**

Add:

```rust
fn build_sync_push_request(outlet_id: &str, tables: Value) -> SyncPushRequest {
    SyncPushRequest {
        outlet_id: outlet_id.to_string(),
        payload_json: serde_json::to_string(&tables).unwrap_or_else(|_| "{}".to_string()),
    }
}

fn server_wins_to_skip_map(
    server_wins: Vec<SyncServerWin>,
) -> std::collections::HashMap<String, std::collections::HashSet<String>> {
    let mut map = std::collections::HashMap::new();
    for win in server_wins {
        map.insert(win.table, win.ids.into_iter().collect());
    }
    map
}
```

**Step 4: Run tests**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test push_
```

Expected: PASS.

**Step 5: Convert `sync_push_inner` transport**

In `sync_push_inner`:

- Replace the JSON body object with `let request = build_sync_push_request(outlet_id, Value::Object(tables_json));`.
- Encode with `request.encode_to_vec()`.
- Replace `.json(&body)` with `.header(reqwest::header::CONTENT_TYPE, "application/x-protobuf").header(reqwest::header::ACCEPT, "application/x-protobuf").body(bytes)`.
- Replace `response.json::<Value>().await` with `let bytes = response.bytes().await?; let result = SyncPushResponse::decode(bytes)?;`.
- Replace the manual JSON server-wins parsing with `server_wins_to_skip_map(result.server_wins)`.
- Read `server_time` from `result.server_time`.

**Step 6: Run focused Rust tests**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test push_
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs
git commit -m "feat: push sync changes with protobuf"
```

## Task 7: Convert Rust Pull and Pull-Events to Protobuf

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Add failing tests for pull request helpers**

Add tests:

```rust
#[test]
fn build_pull_request_carries_tables_and_since_cursor() {
    let request = build_sync_pull_request("outlet-1", "2026-05-10T00:00:00.000Z");

    assert_eq!(request.outlet_id, "outlet-1");
    assert_eq!(request.since, "2026-05-10T00:00:00.000Z");
    assert!(request.tables.contains(&"products".to_string()));
}

#[test]
fn build_pull_events_request_uses_event_cursor() {
    let request = build_sync_pull_events_request("outlet-1", 42);

    assert_eq!(request.outlet_id, "outlet-1");
    assert_eq!(request.after_event_id, 42);
}
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test pull_
```

Expected: FAIL because helpers do not exist.

**Step 3: Add helpers**

Add:

```rust
fn build_sync_pull_request(outlet_id: &str, since: &str) -> SyncPullRequest {
    SyncPullRequest {
        outlet_id: outlet_id.to_string(),
        tables: SYNC_TABLES.iter().map(|table| table.to_string()).collect(),
        since: since.to_string(),
    }
}

fn build_sync_pull_events_request(outlet_id: &str, after_event_id: i64) -> SyncPullEventsRequest {
    SyncPullEventsRequest {
        outlet_id: outlet_id.to_string(),
        after_event_id,
    }
}
```

**Step 4: Run tests**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test pull_
```

Expected: PASS.

**Step 5: Convert `sync_pull_inner` transport**

In `sync_pull_inner`:

- Stop building the query-string URL.
- Build `SyncPullRequest` with `build_sync_pull_request(outlet_id, &since)`.
- POST to `{api_url}/api/sync/pull`.
- Send protobuf headers and encoded bytes.
- Decode `SyncPullResponse`.
- Convert `response.tables` to a JSON map with `protobuf_tables_to_json_map`.
- Read `server_time` from `response.server_time`.
- Keep existing `upsert_row`, `set_last_sync_at_tx`, and transaction logic.

**Step 6: Convert `sync_pull_events` transport**

In `sync_pull_events`:

- Remove `build_pull_events_url` usage from production code.
- Build `SyncPullEventsRequest`.
- POST to `{api_url}/api/sync/pull-events`.
- Decode `SyncPullEventsResponse`.
- If `needs_full_resync` is true, return the existing full-resync error.
- Convert `tables` to JSON map.
- Use `latest_event_id` for cursor updates.

**Step 7: Update obsolete URL test**

Replace the `builds_event_pull_url_with_encoded_outlet_cursor` test with a protobuf request helper test from Step 1, or remove `build_pull_events_url` entirely if no longer used.

**Step 8: Run Rust sync tests**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test sync
```

Expected: PASS.

**Step 9: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs
git commit -m "feat: pull sync data with protobuf"
```

## Task 8: Remove JSON Sync Endpoint Assumptions

**Files:**
- Modify: `docs/knowledge/pos-smart-sync-strategy.md`
- Modify: `docs/knowledge/pos-cloud-login-pin-and-sync-flow.md`
- Modify: `apps/api/src/app.ts` if CORS allowed headers need `Accept`

**Step 1: Add CORS header support if missing**

Check `apps/api/src/app.ts`. If `allowedHeaders` does not include `Accept`, add it:

```typescript
allowedHeaders: ["Content-Type", "Authorization", "Accept"],
```

**Step 2: Update docs**

Update sync docs to say:

- Sync transport uses `application/x-protobuf`.
- Status, pull-events, and pull are now `POST`.
- Row payloads remain JSON strings inside protobuf envelopes for protocol v1.
- `merchantId` is server-derived from authenticated `outletId`.

**Step 3: Run docs-independent checks**

Run:

```bash
bun x ultracite check
```

Expected: PASS or only pre-existing unrelated findings. Fix findings in touched files.

**Step 4: Commit**

```bash
git add apps/api/src/app.ts docs/knowledge/pos-smart-sync-strategy.md docs/knowledge/pos-cloud-login-pin-and-sync-flow.md
git commit -m "docs: document protobuf sync transport"
```

## Task 9: Full Verification

**Files:**
- No edits unless verification exposes issues.

**Step 1: Generate code from clean state**

Run:

```bash
bun run --filter=@repo/protobuf generate
```

Expected: PASS with no unexpected diff in generated files.

**Step 2: API tests**

Run:

```bash
cd apps/api && bun test
```

Expected: PASS.

**Step 3: POS app tests**

Run:

```bash
cd apps/pos-app && bun test
```

Expected: PASS.

**Step 4: Rust tests**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test
```

Expected: PASS.

**Step 5: Typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

**Step 6: Lint**

Run:

```bash
bun x ultracite check
```

Expected: PASS.

**Step 7: Manual smoke test**

Run API and app locally:

```bash
bun run api:dev
bun run app:dev
```

Perform:

- Log in.
- Create or update a product locally.
- Trigger sync.
- Confirm `/api/sync/status`, `/api/sync/push`, `/api/sync/pull-events`, and `/api/sync/pull` use `application/x-protobuf`.
- Confirm no JSON parse errors or protobuf decode errors in API or Tauri logs.

**Step 8: Final commit if fixes were needed**

```bash
git status --short
git add <fixed-files>
git commit -m "fix: complete protobuf sync verification"
```
