## Why

The `assets` spec describes a world that no longer exists. It was written when the image pipeline lived inside the app and the API owned asset-row lifecycle; since then the pipeline was extracted into the vendored `tauri-plugin-image-pipeline` plugin and the baresync cutover moved asset-row ownership client-side (the API became a thin presign gateway). 8 of 18 requirements are now factually wrong — they reference API endpoints that don't exist (`complete-upload`), API-side table writes that never happen (presign-upload inserts/updates/dedupes), client-side tables that don't exist (`pending_asset_processing_jobs`, `local_asset_cache`), and events the plugin never emits (`asset-cache-ready`, `asset-attachment-ready`). The implementation in `apps/pos-app/src-old/lib/assets/` is verified working on-device and is the source of truth; the spec must be brought back into sync before any further asset work (including the upcoming frontend port) builds against it.

## What Changes

- **R1 (status enum)**: corrected from `pending_upload/ready/failed` to `pending/compressed/ready/failed`, matching the shared schema and the on-device flow.
- **R2 (objectKey)**: derived from `{merchantId}/assets/{assetId}` (UUIDv7) rather than `{merchantId}/assets/{contentHash}`; the deduplication requirement is removed (the API never writes the row, so it has nothing to dedupe).
- **R3, R4 (pick / processing)**: relocated from in-app behavior to a contract description of `vendor/tauri-plugin-image-pipeline`. The spec references the plugin by its command surface (`pick_image`, `compress_asset`, `get_asset_path`, `delete_asset`) and event (`image_pipeline://job_completed`) rather than re-describing pipeline internals.
- **R5 (pending_asset_processing_jobs table)**: removed. The app's own `assets` table is the job ledger via its `status` column.
- **R6 (local_asset_cache table)**: removed. The plugin's filesystem cache under the app cache dir is opaque to the app; it is resolved through `get_asset_path`.
- **R10 (presign-upload contract)**: corrected to the actual contract — accepts `merchantId`, `contentType`, optional `assetId`/`objectKey`; returns `{uploadUrl, objectKey, requiredHeaders}`; the endpoint never touches the `assets` table.
- **R11 (complete-upload)**: removed. The endpoint does not exist and the client never calls it; status transitions happen client-side via baresync.
- **R13 (upload queue)**: restated as client-side responsibility (`uploadSingleAsset` in TypeScript), not a Rust command.
- **R17 (asset events)**: corrected to the single event the plugin actually emits (`image_pipeline://job_completed`); the phantom `asset-cache-ready` / `asset-attachment-ready` events are removed.

Unchanged requirements: R7, R8, R9, R12, R14, R15, R16, R18.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `assets`: correct 8 drifted requirements (status enum, objectKey, presign contract, event surface) and remove 2 phantom client tables and 1 phantom API endpoint so the spec matches the plugin-based, client-owned architecture that already runs in production.

## Impact

- **No code changes** in `apps/api`, `packages/sync-contract`, `vendor/tauri-plugin-image-pipeline`, or `apps/pos-app/src-old` — these already implement the target architecture; this change is documentation-only.
- **`openspec/specs/assets/spec.md`** is rewritten to reflect reality.
- **Downstream unblock**: the upcoming frontend port (`apps/pos-app/src/lib/assets/`) can now proceed against an accurate contract rather than the misleading spec.
