## Why

The image pipeline has accumulated two layers of debt: (1) a Rust `assets/` module in `pos-app` that pre-dates both `tauri-plugin-image-pipeline` and baresync, bypassing baresync's `writeTransaction`/`writeLocalChange` with hand-rolled SQL (causing the `scope_type` bug), and (2) a reactive cache layer in `lib/assets/` built for the base64 era that is unnecessary with `convertFileSrc` and stable `imageAssetId`. Meanwhile, the plugin itself leaks the POS app's `merchant_id` concern into its public API and exposes 13 commands when only 3 are used. This change collapses all of this into a clean boundary: the plugin is a domain-agnostic public plugin with 3 commands, and the JS side owns the entire asset lifecycle using baresync for DB writes.

## What Changes

- **BREAKING**: Simplify `tauri-plugin-image-pipeline` public API to 3 commands: `pick_image`, `compress_asset`, `get_asset_path`. Remove `merchant_id` from all command signatures — the plugin stores files by asset ID with no app-specific scoping. Remove the unused job queue commands (`enqueue_job`, `process_pending_jobs`, `get_completed_jobs`, `consume_completed_job`, `reset_stuck_jobs`, `retry_failed_job`, `get_failed_jobs`), `get_pending_preview`, and `cleanup_orphaned_temp_files`.
- **BREAKING**: Replace `get_cached_asset_path` + `get_pending_preview` with a single smart `get_asset_path(assetId)` that returns the compressed file if it exists, falls back to the preview if the asset is pending, or returns null. The plugin owns file resolution — no status routing from JS.
- **BREAKING**: Remove `merchant_id` from the plugin's cache directory structure. Files stored at `<cache>/assets/<assetId>.webp` and `<cache>/previews/<previewHash>.jpg` — flat, no tenant scoping.
- Delete the entire `apps/pos-app/src-tauri/src/assets/` Rust module (14 files, ~90KB). All asset lifecycle logic moves to JS.
- Delete the reactive cache layer: `create-adapter.ts`, `adapters/`, `types.ts` from `lib/assets/`. The version counter stores, `notifyAssetCacheReady`, `asset-cache-ready`/`asset-attachment-ready` event listeners, and the `useImageUrl` memo accessor are all unnecessary with `convertFileSrc` and navigation-based re-render.
- Simplify `cache.ts` to a single `resolveAssetUrl(assetId)` function that calls the plugin's smart `get_asset_path` + `convertFileSrc`.
- Add `lifecycle.ts` — JS event listener for `asset://compressed` that uses baresync `writeTransaction` to update the assets table (status, metadata) + triggers upload.
- Add `upload.ts` — JS-side S3 upload (presign → PUT → complete-upload) using `fetch()`, with `writeTransaction` to mark assets ready. Replaces Rust `upload_queue.rs`.
- Add `recovery.ts` — JS startup recovery that queries assets table for pending/compressed assets and re-triggers compression or upload.
- Rewrite `sync.ts` from a Rust command bridge to a JS orchestrator that queries compressed assets and calls `upload.ts`.

## Capabilities

### New Capabilities
- `asset-lifecycle`: JS-owned asset state machine driven by plugin events — `lifecycle.ts` listens for `asset://compressed`, performs baresync `writeTransaction` to update asset status and metadata, and triggers upload. Includes startup recovery for pending/compressed assets.
- `asset-upload`: JS-side S3 upload using `fetch()` — presign-upload, PUT to S3, complete-upload, then `writeTransaction` to mark asset ready. Replaces Rust `upload_queue.rs`.
- `plugin-api`: Simplified public API for `tauri-plugin-image-pipeline` — 3 commands (`pick_image`, `compress_asset`, `get_asset_path`), no app domain concepts, flat cache layout.

### Modified Capabilities
- `assets`: Asset URL resolution simplified to a single `resolveAssetUrl(assetId)` that delegates to the plugin's smart `get_asset_path`. Reactive cache layer (version counters, adapter factory, event listeners) removed — `convertFileSrc` + navigation-based re-render makes it unnecessary.
- `sync`: Sync cycle no longer calls Rust commands for asset upload. `uploadPendingAssets` becomes a JS function that queries compressed assets via Drizzle and calls `upload.ts`.

## Impact

- `tauri-plugin-image-pipeline/` — Major: public API reduced from 13 to 3 commands, cache layout simplified (no merchant_id directories), job queue system removed.
- `apps/pos-app/src-tauri/src/assets/` — Deleted entirely (14 files).
- `apps/pos-app/src-tauri/src/lib.rs` — Remove `mod assets`.
- `apps/pos-app/src-tauri/src/app/startup.rs` — Remove Rust recovery/listener setup.
- `apps/pos-app/src/lib/assets/` — Major simplification: delete `create-adapter.ts`, `adapters/`, `types.ts`; rewrite `cache.ts` to single function; rewrite `sync.ts` from Rust bridge to JS; add `lifecycle.ts`, `upload.ts`, `recovery.ts`.
- `apps/pos-app/src/store/sync.ts` — Remove `startAssetCompressedListener` (moved to `lifecycle.ts`), update upload integration to call JS instead of Rust.
- `apps/pos-app/src/lib/app/listeners.ts` — Remove `startAssetCompressedListener` import, start lifecycle listener instead.
- `apps/pos-app/src/pages/settings/product-categories/product-form.tsx` — Remove `pluginDeleteAsset` call for old asset cleanup (delete_asset stays in plugin but app manages when to call it).
- `apps/pos-app/src/components/image.tsx` — Replace adapter `useImageUrl` with direct `resolveAssetUrl` call.
