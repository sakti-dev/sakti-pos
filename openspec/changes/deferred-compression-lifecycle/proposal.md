## Why

The current `pick_image` command triggers background compression immediately on image selection. This wastes CPU when users pick wrong images and re-pick, and forces the frontend to manage a complex listener lifecycle (event registration, race-condition flushing, `isReady` gating). Compression should only run for images the user actually commits to — at form submit time — and the `assets` table should own the lifecycle state so that recovery across app restarts is straightforward.

## What Changes

- Split the current `pick_image` command into two phases: `pick_image` (pick + stage + preview only, no compression) and `compress_asset` (background compression triggered at submit time).
- Add a `jobId` column to the `assets` table linking an asset row to a plugin compression job.
- Make `contentHash`, `byteSize`, `width`, and `height` nullable in the `assets` table so rows can be created at submit time before compression completes.
- Create the `assets` row and set `products.imageAssetId` at submit time (no null gap on products).
- Gate S3 upload on compression completion — presign-upload and complete-upload only run after `contentHash` is available.
- Add `deleteAsset` plugin command for manual cleanup of committed assets (replaces reference-counted GC for compressed files).
- Add startup recovery: query plugin for completed jobs matching `status = "pending"` assets, resume interrupted uploads for `status = "compressed"` assets.
- Remove the frontend event-listener lifecycle (`listen`, `flushPendingJobEvents`, `isReady` gating) from `createImageUpload` — the form submits immediately after `compress_asset` is invoked, and the background job updates the `assets` table directly.
- **BREAKING**: `pick_image` no longer starts background compression or emits `job_completed` on its own. The host app must call `compress_asset` after saving the entity.
- **BREAKING**: The `assets` table `contentHash`, `byteSize`, `width`, and `height` columns become nullable.

## Capabilities

### New Capabilities
- `deferred-compression`: Plugin-owned deferred compression lifecycle — `compress_asset` command, `jobId` on assets table, startup recovery for pending and compressed assets, manual `deleteAsset` cleanup command.

### Modified Capabilities
- `assets`: Asset metadata schema changes (nullable columns, `jobId`), lifecycle status progression (`pending` → `compressed` → `pending_upload` → `ready`), upload gating on compression completion.
- `menu`: Product creation/update now creates an `assets` row at submit time and sets `imageAssetId` immediately, rather than waiting for compression to complete.
- `sync`: Sync startup no longer owns image-processing job execution; the plugin owns deferred compression and the `assets` table owns lifecycle state. Sync only pushes/pulls assets with `status = "ready"`.

## Impact

- `tauri-plugin-image-pipeline/src/` — Rust plugin gains `compress_asset` and `deleteAsset` commands; `pick_image` stops emitting `job_completed`.
- `tauri-plugin-image-pipeline/android/` — Kotlin `ImagePipelinePlugin` `generatePreview` and `compressImage` remain as-is, but the host app controls when they're called.
- `packages/sync-contract/src/` — `assets` table schema changes (nullable columns, `jobId`).
- `apps/pos-app/src/lib/assets/` — `createImageUpload` simplified: no event listeners, no `isReady` gating, no `flushPendingJobEvents`. Submit-time flow calls `compress_asset` and saves the product.
- `apps/pos-app/src/pages/settings/product-categories/product-form.tsx` — `handleSave` creates an assets row, sets `imageAssetId`, calls `compress_asset`, then navigates.
- `apps/pos-app/src-tauri/src/` — Rust app-side startup recovery logic for pending and compressed assets.
