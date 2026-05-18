# Sync Proto Generator

This package owns the sync protobuf generation workflow.

## Config

The generator reads [`sync-proto.config.ts`](../protobuf/sync-proto.config.ts)
from `packages/protobuf`. That file is the one-off generator config, similar to
a `drizzle.config.ts` setup:

- synced schema modules
- generator naming config
- checked-in output destinations

## Commands

Run from `packages/protobuf`:

```bash
bunx sync-proto-generator generate
```

## Outputs

The config writes directly to the checked-in artifacts:

- `packages/protobuf/proto/sync.proto`
- `apps/api/src/sync/protobuf.generated.ts`
- `apps/api/src/sync/push-adapters.generated.ts`
- `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`
