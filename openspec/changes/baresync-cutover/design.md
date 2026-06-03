## Context

The `baresync-foundation` change installed baresync packages, converted infrastructure schemas to helpers, and generated the sync contract. Now the codebase has two parallel sync implementations:

1. **Old custom code**: Rust sync module (~4,300 lines) + TypeScript server sync (~1,700 lines) + protobuf codecs (~650 lines)
2. **New baresync plugin**: Tauri plugin (Rust) + npm package (TS) that does the same thing with less code

Additionally, ALL API endpoints use protobuf encoding via a custom `tsProtoPlugin` Elysia plugin. This adds unnecessary complexity for a POS app that runs on a local network.

The wire format coupling forces an atomic switch: the old server uses protobuf encoding, the new plugin uses JSON encoding. The server cannot serve both formats simultaneously, so client and server must switch in the same deployment.

This change replaces all custom sync code with the baresync plugin AND converts all endpoints from protobuf to JSON.

## Goals / Non-Goals

**Goals:**
- Replace custom Rust sync module with `tauri-plugin-baresync` builder configuration
- Replace custom TypeScript server sync with `createDrizzleSyncRepository` and baresync route factories
- Replace custom client sync orchestrator with `createSyncClient` from `baresync`
- Replace all `recordLocalChange()` calls with `writeTransaction` + `writeLocalChange` pattern
- Remove `syncMeta` and `syncClientIdentity` tables (baresync manages these internally)
- Remove protobuf infrastructure (`prost`, `prost-build`, `protoc-bin-vendored`, `packages/protobuf/`)
- Convert ALL API endpoints from protobuf to JSON encoding
- Remove `tsProtoPlugin` and all protobuf encode/decode from routes and clients
- Simplify response types by removing `hasXxx` boolean wrapper fields
- Preserve all existing business behavior and sync semantics

**Non-Goals:**
- Add new synced tables or change scope mappings
- Change sync frequency or polling behavior
- Modify the API URL paths (`/api/sync/push`, `/api/sync/pull`, `/api/sync/status`)
- Add conflict resolution (server-wins remains the strategy)
- Performance optimization beyond what baresync provides by default

## Decisions

### 1. Atomic client-server switch

**Decision:** Replace client and server sync code in the same change, deployed together.

**Why:** Wire format coupling — old server uses protobuf, new plugin uses JSON. The server cannot serve both formats simultaneously. A gradual migration (server first, then client) would require maintaining two wire formats on the server, which is complex and error-prone.

**Alternative considered:** Server-first migration with protobuf adapter layer. Rejected because it adds temporary complexity that must be removed later, and the adapter layer would need to handle both formats correctly during the transition period.

### 2. Plugin builder configuration in lib.rs

**Decision:** Add `tauri-plugin-baresync` via `BaresyncBuilder::new()` in `lib.rs` with `include_str!` for the contract JSON.

**Why:** The plugin handles everything internally: SQLite connection, WAL mode, foreign keys, migration runner, outbox management, polling loop, event emission. We just configure it.

```rust
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;

BaresyncBuilder::new()
    .api_base_url("http://127.0.0.1:3001")
    .db_path("baresync.db")
    .contract_json(include_str!("../../../../packages/database/generated/sync-contract.json"))
    .migrations_path("migrations")
    .poll_interval_secs(30)
    .poll_on_background(false)
    .build()
```

**Key details:**
- `db_path("baresync.db")` → relative path resolves to app data dir
- `migrations_path("migrations")` → bundled `.sql` files as Tauri resources
- `include_str!` path is relative to `lib.rs` location

### 3. Server sync using Drizzle repository

**Decision:** Replace `apps/api/src/sync/service.ts` (1,079 lines) with `createDrizzleSyncRepository` from `baresync/server/drizzle`.

**Why:** The repository pattern provides the same 5 functions per table (`buildRow`, `readLatestRow`, `readRows`, `softDeleteRow`, `upsertRow`) that we currently implement manually. The factory handles cursor calculation, scope filtering, and change ordering.

**Scope mapping:** The `resolveScope` function returns `{ scopeId, merchantId }` to handle both merchant-scoped and outlet-scoped tables. The scope ID is the primary key for cursor tracking.

### 4. Server routes using factory handlers

**Decision:** Replace `apps/api/src/sync/routes.ts` (232 lines) with `createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler` from `baresync/server`.

**Why:** The factory handlers provide the same endpoint semantics (push, pull, status) with built-in idempotency, chunking, and error mapping. We just wire up the callbacks.

**URL preservation:** Endpoints remain at `/api/sync/push`, `/api/sync/pull`, `/api/sync/status` — no frontend URL changes needed.

### 5. Client sync using createSyncClient

**Decision:** Replace `apps/pos-app/src/store/sync.ts` (432 lines) and `apps/pos-app/src/db/sync-outbox.ts` (163 lines) with `createSyncClient` from `baresync`.

**Why:** The client provides `writeTransaction` + `writeLocalChange` for outbox management, `startPolling` for background sync, and `sync_now` for on-demand sync. This replaces our custom orchestrator.

### 6. Database proxy using createTauriDrizzleDatabase

**Decision:** Replace `apps/pos-app/src/db/index.ts` (71 lines) with `createTauriDrizzleDatabase` from `baresync/tauri`.

**Why:** The factory creates a Drizzle instance backed by the plugin's `run_sql` command, with a TABLE registry for type-safe access. Same functionality, less boilerplate.

### 7. Remove syncMeta and syncClientIdentity tables

**Decision:** Remove both tables from the local schema. Baresync manages client identity internally via `sync_client_identity` and uses `sync_cursors` for per-scope tracking.

**Why:** The old Rust module reads these tables, but it's being deleted. The new plugin manages its own identity and cursor state.

### 8. Keep old migration files

**Decision:** Keep existing `apps/pos-app/drizzle/0000_parallel_blacklash.sql` and add new baresync migration files alongside it.

**Why:** The plugin's migration runner tracks applied migrations by hash in `__drizzle_migrations`. Existing migrations are already applied; new ones handle the schema changes (removing `syncMeta`, `syncClientIdentity`).

### 9. Convert ALL endpoints from protobuf to TypeBox + Eden Treaty

**Decision:** Remove `tsProtoPlugin` from all API routes, replace with TypeBox (`t`) schemas for validation. On the client, replace `protoFetch` with Eden Treaty for fully typed API calls.

**Why:** TypeBox provides runtime validation, compile-time types, and OpenAPI schema generation from a single source of truth. Eden Treaty provides end-to-end type safety between server and client. This eliminates:
- Generated protobuf code maintenance (7 proto files → 7 model files)
- `@bufbuild/protobuf` and `protobufjs` dependencies
- Manual `protoFetch` helper with binary encoding/decoding
- `hasXxx` boolean wrapper fields (replaced by `t.Nullable(...)`)
- Runtime type mismatches between client and server

**Conversion pattern (server routes):**
```typescript
// Before: protobuf
import { AuthLoginRequest, AuthResponse } from "@repo/protobuf/auth";
import { tsProtoPlugin } from "../lib/ts-proto-plugin";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(tsProtoPlugin)
  .post("/login", async ({ body }) => {
    const request = body as AuthLoginRequest;
    return { sessionToken: token, user: encodeApiUser(user) };
  }, { proto: { req: AuthLoginRequest, res: AuthResponse } });

// After: TypeBox
import { t } from "elysia";
import { AuthLoginRequest, AuthResponse } from "./auth.model";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .post("/login", async ({ body }) => {
    // body is typed as { email: string; password: string }
    return { sessionToken: token, user: { id: user.id, email: user.email, name: user.name } };
  }, {
    body: AuthLoginRequest,
    response: AuthResponse,
  });
```

**Conversion pattern (client with Eden Treaty):**
```typescript
// Before: protobuf + protoFetch
import { AuthLoginRequest, AuthResponse } from "@repo/protobuf/auth";
import { protoFetch } from "./client";

export const authApi = {
  login: (payload: AuthLoginRequest) =>
    protoFetch("api/auth/login", { req: AuthLoginRequest, res: AuthResponse }, payload),
};

// After: Eden Treaty
import { eden } from "./eden";

export const authApi = {
  login: (payload: { email: string; password: string }) =>
    eden.auth.login.post(payload),
  // Returns: { data: { sessionToken: string, user: ApiUser } | null, error: Error | null }
};
```

### 10. Simplify response types (remove hasXxx fields)

**Decision:** Remove `hasXxx` boolean wrapper fields from response TypeBox schemas. Use `t.Nullable(...)` instead.

**Why:** Protobuf uses `hasXxx` booleans to distinguish between "field not set" and "field set to empty/null". TypeBox's `t.Nullable(...)` handles this naturally in JSON.

**Example:**
```typescript
// Before (protobuf)
interface Outlet {
  address: string;
  hasAddress: boolean;
  receiptName: string;
  hasReceiptName: boolean;
}

// After (TypeBox)
const OutletResponse = t.Object({
  address: t.Nullable(t.String()),
  receiptName: t.Nullable(t.String()),
});
```

### 11. Remove protobuf domain encoder helpers

**Decision:** Delete `apps/api/src/protobuf/domain.ts` and `apps/api/src/assets/protobuf.ts`. The encoding logic is no longer needed — routes return plain objects directly.

**Why:** The encoder functions (`encodeApiUser`, `encodeMerchant`, `encodeOutlet`, etc.) exist to map database rows to protobuf message shapes. With TypeBox + JSON, we return the data directly as plain object literals. The `optionalString` helper (converting `null` → `{ hasValue: false, value: "" }`) is replaced by `t.Nullable(...)`.

### 12. Type sharing via workspace type imports

**Decision:** Export the composed Elysia app type from `apps/api`. The POS app imports it via `import type { App } from '@repo/api'` (compile-time only, no runtime dependency).

**Why:** Eden Treaty needs the server's Elysia app type to generate the typed client. TypeScript's `import type` ensures no runtime code is pulled into the POS app — only the type information is used at compile time.

**Setup:**
1. `apps/api/package.json` must have `"name": "@repo/api"`
2. `apps/api/src/app.ts` exports `export type App = typeof app`
3. POS app's `tsconfig.json` must include `"paths": { "@repo/api": ["../../apps/api/src"] }`
4. POS app uses `import type { App } from "@repo/api"` (type-only import)

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Atomic switch breaks sync if any piece is misconfigured | Test full sync cycle locally before deploying; verify push/pull/status endpoints work with JSON encoding |
| `writeTransaction` + `writeLocalChange` pattern is different from `recordLocalChange` | Systematic search-and-replace; each call site is a small, isolated change |
| Plugin migration runner may conflict with existing Drizzle migrations | Use separate migration files; plugin tracks its own state in `__drizzle_migrations` |
| `include_str!` path may break if directory structure changes | Document the expected path; add build-time verification |
| Server scope resolution must handle both merchant and outlet scopes | Test with both scope types; verify cursor tracking works correctly |
| Removing `syncMeta` may break per-table sync frequency tracking | Baresync uses `sync_cursors` for this; verify the plugin provides equivalent visibility |
| JSON conversion may break existing API clients during transition | Atomic switch — all clients and server deploy together; no partial rollout |
| Removing `hasXxx` fields may break clients that check these booleans | Search all client code for `hasXxx` references; replace with null checks |
| Protobuf `int64` (bigint) → JSON number may lose precision for large values | POS app uses safe integer range; verify no values exceed `Number.MAX_SAFE_INTEGER` |

## Migration Plan

1. **Pre-deployment:** Verify baresync foundation is complete (schemas, config, contract generated)
2. **Deploy server first:** Replace server sync code, verify push/pull/status endpoints work with JSON encoding
3. **Deploy client:** Replace client sync code, verify polling and on-demand sync work
4. **Verify:** Run full sync cycle with both merchant-scoped and outlet-scoped data
5. **Rollback:** If issues, revert to previous commit (old code still works)

**Rollback strategy:** Since this is an atomic switch, rollback means reverting the entire change. The old code is removed in this change, so there's no partial rollback — it's all or nothing.

## Open Questions

1. **Migration file ordering:** Should we generate a single migration file for all schema changes, or separate files per change?
2. **Plugin db_path:** Should we use `"baresync.db"` (new file) or the existing database path? Using a new file means existing data must be migrated.
3. **Poll interval:** Should we keep the current 5-minute interval or use the plugin's default 30 seconds?
