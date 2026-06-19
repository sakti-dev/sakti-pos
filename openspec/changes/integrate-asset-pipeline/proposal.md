## Why

The new `apps/pos-app/src/` has no asset layer — `lib/api/sync.ts` carries three placeholder no-op stubs (`uploadPendingAssets`, `recoverAssets`, `hydrateMissingAssets`) where the real pipeline should plug in. The working implementation already exists in `apps/pos-app/src-old/lib/assets/` (upload/lifecycle/recovery), verified on-device against the vendored `tauri-plugin-image-pipeline` plugin, the `/api/assets/presign-*` endpoints, and the baresync client. Porting the backend cluster now — ahead of the product form — lands the infrastructure that everything else (the deferred UI trio, eventual product-photo capture) depends on, without coupling it to the in-progress form redesign whose data structure is still in flux.

## What Changes

- **Port `upload.ts`, `lifecycle.ts`, `recovery.ts`** from `apps/pos-app/src-old/lib/assets/` into a new `apps/pos-app/src/lib/assets/` directory (the three backend-cluster files; verbatim port with import-path rewrites only).
- **Rewire import paths** on the ported files to the new locations: `~/lib/logger` → `~/lib/utils`, `~/lib/sync` → `~/lib/api/sync`, `~/store/outlet` → `~/lib/auth/session`. The `~/db/index`, `~/lib/api/eden`, and `~/lib/auth/storage` imports are already at their final paths.
- **Replace the three no-op stubs in `lib/api/sync.ts`** with real imports from `~/lib/assets/upload` (`uploadPendingAssets`) and `~/lib/assets/recovery` (`recoverAssets`). `hydrateMissingAssets` stays stubbed (no real cloud→local hydration exists in either codebase).
- **Mount `startAssetLifecycleListener()`** in `SyncClientProvider`'s existing `createEffect`, alongside the `baresync://` listeners — the natural root-level side-effect home for native-event wiring.
- **Deferred (explicitly out of scope):** the UI trio (`cache.ts`, `plugin-bridge.ts`, `image-upload.ts`) stays in `src-old/` until the product form is rebuilt. None of the ported backend files import from the trio, so deferring introduces no dead code.

## Capabilities

### New Capabilities
<!-- none — no new spec capability; this implements the existing assets spec -->

### Modified Capabilities
<!-- none — the assets spec is corrected by the separate `correct-asset-spec-to-client-owned-architecture` change. This change is implementation-only and conforms to that spec. No requirement-level behavior changes are introduced by the port itself. -->

## Impact

- **New code:** `apps/pos-app/src/lib/assets/{upload,lifecycle,recovery}.ts` (ported, ~330 LOC total).
- **Modified code:** `apps/pos-app/src/lib/api/sync.ts` (3 stubs → imports), `apps/pos-app/src/lib/api/sync-client-provider.tsx` (listener mount).
- **No schema/API/plugin changes** — the `assets` table, presign endpoints, and `vendor/tauri-plugin-image-pipeline` are untouched.
- **Relationship to `correct-asset-spec-to-client-owned-architecture`:** logical predecessor, not a hard dependency. The integration conforms to what the corrected spec will say, but src-old is the immediate source of truth and is already on-device-correct. Apply spec-first if sequencing for review clarity; otherwise they are independent.
- **Nothing consumes the ported code yet** until the product form lands. This is expected: it lands infrastructure ahead of demand, same pattern as the existing `use-drizzle-query.ts` and `SyncClientProvider` (both merged into `lib/` ahead of consumers).
