## 1. Schema Changes

- [ ] 1.1 Add `jobId` column (nullable text) to `assets` table in `packages/sync-contract/src/local-synced-schema.ts`
- [ ] 1.2 Make `contentHash`, `byteSize`, `width`, `height` nullable in local `assets` schema
- [ ] 1.3 Add `jobId` column (nullable text) to `assets` table in `packages/sync-contract/src/api-synced-schema.ts`
- [ ] 1.4 Make `contentHash`, `byteSize`, `width`, `height` nullable in API `assets` schema
- [ ] 1.5 Add `pending` and `compressed` to the asset status enum documentation in specs/assets
- [ ] 1.6 Run `bun run generate:sync-proto:write` to regenerate sync contract artifacts
- [ ] 1.7 Run `bun run sync-proto:check` to verify schema consistency

## 2. Plugin Commands (Rust)

- [ ] 2.1 Add `compress_asset` command to `tauri-plugin-image-pipeline/src/commands.rs` — takes `jobId`, `stagedSourcePath`, `maxLongEdge`, `quality`; spawns background compression; emits `job_completed` / `job_failed`
- [ ] 2.2 Add `delete_asset` command to `tauri-plugin-image-pipeline/src/commands.rs` — takes `assetPath`; deletes the file idempotently
- [ ] 2.3 Add `compress_asset` and `delete_asset` to the plugin invoke handler in `tauri-plugin-image-pipeline/src/lib.rs`
- [ ] 2.4 Add `CompressAssetRequest` and `CompressAssetResponse` DTOs to `tauri-plugin-image-pipeline/src/dto.rs`
- [ ] 2.5 Modify `pick_image` to stop spawning background compression — return `{ jobId, stagedSourcePath, previewPath, previewMimeType }` only
- [ ] 2.6 Add TTL-based GC for staging and preview files — run on plugin setup, delete files in `picked/` and `previews/` older than 30 minutes

## 3. Plugin Commands (Kotlin / Android)

- [ ] 3.1 Add `compressAsset` command to `ImagePipelinePlugin.kt` — delegates to `compressFinal` with the provided args
- [ ] 3.2 Add `deleteAsset` command to `ImagePipelinePlugin.kt` — deletes the file at the given path
- [ ] 3.3 Verify `pick_image` Kotlin path no longer triggers compression (preview-only)

## 4. Frontend Plugin Bridge

- [ ] 4.1 Add `pluginCompressAsset` function to `apps/pos-app/src/lib/assets/plugin-bridge.ts`
- [ ] 4.2 Add `pluginDeleteAsset` function to `apps/pos-app/src/lib/assets/plugin-bridge.ts`
- [ ] 4.3 Update `PickImageResponse` type to include `stagedSourcePath` (remove `status` field)

## 5. Asset Lifecycle (Rust App-Side)

- [ ] 5.1 Add startup recovery for `status = "pending"` assets — query plugin for completed jobs, update asset metadata, transition to `compressed`
- [ ] 5.2 Add startup recovery for `status = "compressed"` assets — resume upload (presign → S3 → complete)
- [ ] 5.3 Add `job_completed` event handler that updates the `assets` row with compression metadata and transitions status to `compressed`
- [ ] 5.4 Add upload trigger after `job_completed` — don't wait for next sync to upload the freshly compressed asset
- [ ] 5.5 Update upload queue to query `status = "compressed"` instead of `status = "pending_upload"`

## 6. Product Form Flow (Frontend)

- [ ] 6.1 Update `createImageUpload` in `apps/pos-app/src/lib/assets/image-upload.ts` — remove event listeners, `isReady` gating, `flushPendingJobEvents`. `pickImage()` returns `{ jobId, stagedSourcePath, previewPath }` immediately.
- [ ] 6.2 Update `handleSave` in `product-form.tsx` — create `assets` row with `status = "pending"` and `jobId`, set `products.imageAssetId = assets.id`, call `compress_asset`, then navigate
- [ ] 6.3 Update `handleSave` for edit mode — create new assets row, update product's `imageAssetId`, call `compress_asset`, invoke `deleteAsset` for old asset
- [ ] 6.4 Update `canSubmit` logic — remove `hasPendingImage` gate (button enabled as soon as preview is available)
- [ ] 6.5 Update product creation in `apps/pos-app/src/db/menu.ts` — insert assets row and product row in a transaction

## 7. Rendering Updates

- [ ] 7.1 Update `ProductImage` component to handle `assets.status = "pending"` — show preview via `get_pending_preview_path` when asset has no `contentHash`
- [ ] 7.2 Update `resolveAssetUrl` in `apps/pos-app/src/lib/assets/cache.ts` — return null (or pending preview) when asset has no `localPath`
- [ ] 7.3 Verify `useImageUrl` reactive accessor handles the pending → ready transition correctly

## 8. Cleanup

### 8A. Sync contract schema cleanup

- [ ] 8.1 Remove `imageUrl` column from products table in both `packages/sync-contract/src/local-synced-schema.ts` and `packages/sync-contract/src/api-synced-schema.ts`
- [ ] 8.2 Remove `imageUrl` selection from `apps/pos-app/src/db/orders.ts` (line 159: `imageUrl: products.imageUrl`)
- [ ] 8.3 Remove stale `imageUrl` references from test fixtures: `product-form.test.tsx`, `pos.test.tsx`, `product-list.test.tsx`, `pos-utils.test.ts`, `cart-panel.test.tsx`, `product-grid.test.tsx`, `cart.test.ts`
- [ ] 8.4 Regenerate sync contract (`bun run generate:sync`) after removing `imageUrl`

### 8B. Local-only schema cleanup

- [ ] 8.5 Remove `localAssetCache` table definition from `packages/sync-contract/src/local-schema.ts`
- [ ] 8.6 Remove `pendingProductPhotoJobs` table definition from `packages/sync-contract/src/local-schema.ts` (table already dropped by migration `0001`, definition is dead code)
- [ ] 8.7 Remove `localAssetCache` import and usage from `apps/pos-app/src/db/index.ts` (lines 2 and 26)
- [ ] 8.8 Remove `localAssetCache` test from `apps/pos-app/src/db/__test__/sync-schema.test.ts`
- [ ] 8.9 Generate a new Drizzle migration to `DROP TABLE IF EXISTS local_asset_cache`

### 8C. Stale asset processing code (`apps/pos-app/src/lib/assets/`)

The old `enqueue_asset_processing` / `process_pending_asset_jobs` system is fully replaced by the plugin's `compress_asset` command. These files and their tests are dead code:

- [ ] 8.10 Delete `apps/pos-app/src/lib/assets/processing.ts` — contained `enqueueAssetProcessing` and `processPendingAssetJobs`, both call Rust commands that operate on the removed `pending_asset_processing_jobs` table
- [ ] 8.11 Delete `apps/pos-app/src/lib/assets/types.ts` — contained `EnqueueAssetProcessingInput`, `EnqueueAssetProcessingResult`, `AssetProcessingKind` types, only imported by `processing.ts`
- [ ] 8.12 Delete `apps/pos-app/src/lib/assets/targets.ts` — contained `ASSET_ATTACHMENT_TARGETS`, `createAssetProcessingTarget`, only imported by `processing.ts` and its test
- [ ] 8.13 Delete `apps/pos-app/src/lib/assets/__test__/processing.test.ts` — tests for removed `processing.ts`
- [ ] 8.14 Delete `apps/pos-app/src/lib/assets/__test__/targets.test.ts` — tests for removed `targets.ts`
- [ ] 8.15 Remove `processPendingAssetJobs` import and `processPendingAssetProcessingJobs` function from `apps/pos-app/src/store/sync.ts` (lines 3, 93-100) — compression is no longer part of the sync pipeline, it runs at submit time
- [ ] 8.16 Remove the `await processPendingAssetProcessingJobs()` call from `syncNow()` in `apps/pos-app/src/store/sync.ts` (line 121)

### 8D. Log filter updates

- [ ] 8.17 Update `logs/capture-adb-logcat.sh` LOG_FILTER: add `COMPRESS_ASSET`, `DELETE_ASSET`, `DIALOG` prefixes; remove stale `enqueue_asset_processing|process_pending_asset_jobs|hydrate_missing_assets|pending_asset` prefixes that reference removed commands

## 9. Testing

- [ ] 9.1 Add Rust tests for `compress_asset` command — happy path, missing source file, invalid job ID
- [ ] 9.2 Add Rust tests for `delete_asset` command — file exists, file missing, idempotent delete
- [ ] 9.3 Add Rust tests for startup recovery — pending with completed job, pending with failed job, compressed with local file
- [ ] 9.4 Update frontend tests for `createImageUpload` — pick returns preview without compression, no event listener lifecycle
- [ ] 9.5 Update `product-form.test.tsx` — submit creates assets row, calls `compress_asset`, navigates immediately
- [ ] 9.6 Verify full flow on Android (WayDroid) — pick → preview → submit → compress → upload → ready
