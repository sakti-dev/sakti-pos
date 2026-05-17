# Typed Sync Protobuf Generator

The typed sync protobuf generator (`packages/sync-proto-generator`) produces runtime sync contracts from the Drizzle database schema and a sync table manifest. It is the single source of truth for:

- Protobuf message definitions for all 10 sync tables.
- TypeScript API mapper functions (encode/decode) for the Elysia sync routes.
- Rust mapper functions (push builder, pull decoder, row converters) for the Tauri POS sync module.

## What Is Generated

| Artifact | Runtime Path | Written By |
|---|---|---|
| `sync.proto` | `packages/protobuf/proto/sync.proto` | `proto-writer.ts` |
| API mapper | `apps/api/src/sync/protobuf.generated.ts` | `ts-mapper-writer.ts` |
| Rust mapper | `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs` | `rust-mapper-writer.ts` |

Comparison artifacts (for generator self-tests) live under `packages/sync-proto-generator/generated/` and are **not** imported at runtime.

## What Remains Handwritten

- `apps/api/src/sync/protobuf.ts` — thin wrappers that import from the generated file and add hashing, status helpers, and type casts.
- `apps/pos-app/src-tauri/src/sync/protobuf.rs` — thin re-export layer via `pub(super) use` plus `build_sync_pull_batch_request`.
- `apps/api/src/sync/service.ts` — push/pull transaction logic, conflict resolution, idempotency.
- `apps/api/src/sync/routes.ts` — HTTP route handlers, auth, request validation.

## How To Regenerate

```bash
bun run generate:sync-proto:write
```

This writes all three artifacts to their runtime paths. Run it after changing the Drizzle schema or sync manifest.

## How To Check Drift

```bash
bun run sync-proto:check
```

This runs the drift test suite that compares each checked-in artifact against fresh generator output. Fails if any artifact is stale.

For a full verify (regenerate + check + test):

```bash
bun run sync-proto:verify
```

## How To Add A Synced Column

1. Add the column to the Drizzle schema in `packages/database`.
2. If the column needs a proto alias (different name or type), add a `fieldAliases` entry in the manifest (`packages/sync-proto-generator/src/manifest.ts`).
3. Run `bun run generate:sync-proto:write`.
4. Run `bun x vitest run packages/sync-proto-generator/src` to verify no regressions.
5. If column is money-like, verify the generated mapper maps `price` <-> `priceMinorUnits` correctly.

## How To Add A Synced Table

1. Add the Drizzle table to `packages/database`.
2. Add an entry to `syncManifest.tables` in `packages/sync-proto-generator/src/manifest.ts` with all required naming fields (`tableName`, `serviceKey`, `protoFieldName`, `tsProtoFieldName`, `rustFieldName`, `rowMessageName`, `changeMessageName`, `scope`).
3. Run `bun run generate:sync-proto:write`.
4. Update the handwritten API service and Rust callers to handle the new table.
5. Run all tests.

## Required Verification Commands

```bash
bun run generate:sync-proto:write
bun run sync-proto:check
bun x vitest run packages/sync-proto-generator/src
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

## Known Follow-Ups

- Refactor Rust push mappers to map directly from `sqlx::Row` to Prost structs without `serde_json::Value`.
- Refactor Rust pull application to apply typed rows directly to SQLite without JSON rehydration.
- Add CI job that runs `bun run sync-proto:verify` on every PR touching schema/sync/proto files.
- Add schema evolution policy with field-number reservation once the app is launched.
