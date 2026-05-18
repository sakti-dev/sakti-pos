# Sync Proto Library Changes

This note captures the implemented sync protobuf/library changes that were made outside `docs/plans/2026-05-18-dumb-typed-protobuf-sync-layer.md`.

## Current Contract

- `packages/sync-proto-generator` is a sync-only generator library.
- The generator is invoked as a proper CLI:

```bash
cd packages/protobuf && bunx sync-proto-generator generate
```

- The sync config lives beside the sync protobuf package at `packages/protobuf/sync-proto.config.ts`.
- `packages/protobuf` keeps the non-sync protobuf generation split from sync.
- `sync.proto` is generated only by the sync generator, not by the general protobuf generation path.

## What The Generator Owns

The sync generator now writes these outputs from the Drizzle schema:

- `packages/protobuf/proto/sync.proto`
- `apps/api/src/sync/protobuf.generated.ts`
- `apps/api/src/sync/push-adapters.generated.ts`
- `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`
- `packages/protobuf/src/sync.ts`

## Naming Rules

The sync generator is schema-first.

- Drizzle property names are the source of truth for typed sync row fields.
- SQLite column names are only used for SQL emission.
- Protobuf wrapper fields keep their sync contract naming.
- Sync table keys remain table names such as `order_items` and `outlet_products`.

Examples:

- `userName: text("user_name")` generates a typed sync row field named `userName`.
- `user_name: text("user_name")` generates a typed sync row field named `user_name`.

This works because the generator preserves the Drizzle property name exactly instead of guessing casing.

## ts-proto Behavior

The sync-only `ts-proto` invocation is configured with `snakeToCamel=false`.

That keeps the generated sync TypeScript shape aligned with the sync protobuf field names rather than applying an extra camel-casing pass. The generator owns the sync-specific output, so this setting affects only the sync path.

## Removed Transitional Behavior

The following no longer exist in the final shape:

- generator compare mode
- manifest-driven sync generation flow
- local generator config inside `packages/sync-proto-generator`
- casing helpers that tried to infer table/field names from schema names
- compatibility shims that kept the old `createdRows` / `updatedRows` sync field names alive

## API Boundary

The API still translates at the sync boundary, but it now does so against the schema-first generated contract:

- route handlers use the generated sync protobuf types
- sync service code still works with Drizzle row objects
- push adapters use Drizzle property names for row access and SQLite column names for SQL `excluded.<column>` writes

## Regeneration And Verification

Recommended commands:

```bash
cd packages/protobuf && bunx sync-proto-generator generate
bun x ultracite check
bun run typecheck
bun test apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test packages/sync-proto-generator/src/__test__
```

If the checked-in sync artifacts drift, regenerate them through the CLI above instead of hand-editing the generated files.

