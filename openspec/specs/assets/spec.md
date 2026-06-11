# Assets

## Purpose

The Assets domain manages the lifecycle of binary files (currently product photos) in an offline-first POS system. It provides camera/gallery image picking on Android, local image processing to WebP, presigned S3 upload/download via the API, a local file cache on each device, and metadata synchronization—without ever syncing binary file bytes between devices. Product rows reference assets through `image_asset_id`, and new entity types can be added by extending the allowlist.

## Requirements

### R1: Asset Metadata Schema

The system SHALL maintain an `assets` table with the following columns: `id`, `merchantId`, `objectKey`, `originalFilename`, `contentType`, `byteSize`, `contentHash`, `kind`, `width`, `height`, `status` (enum: `pending_upload`, `ready`, `failed`), and `createdByUserId`. The `assets` table SHALL be included in baresync between API and POS.

**WHEN** a new asset is created locally
**THEN** it SHALL be inserted into the local `assets` table with `status = 'pending_upload'` and a corresponding outbox entry SHALL be created for sync.

**WHEN** an asset row is synced from the API
**THEN** the POS local database SHALL upsert the row by `id` without transferring binary file bytes.

### R2: Asset Object Key and Deduplication

The system SHALL derive the `objectKey` from `{merchantId}/assets/{contentHash}`. The `contentHash` SHALL be the SHA-256 hex digest of the processed WebP bytes.

**WHEN** an asset with the same `merchantId` and `objectKey` already exists on the API
**THEN** the API SHALL return the existing asset row without creating a duplicate, provided metadata matches.

**WHEN** an asset with the same `objectKey` but conflicting metadata is requested
**THEN** the API SHALL return HTTP 409.

### R3: Image Picking

The system SHALL provide a plugin-owned `pick_image` command through `tauri-plugin-image-pipeline`. It SHALL return a `PickImageResponse` containing `jobId`, `previewPath`, `previewMimeType`, and `status`.

**WHEN** the user picks an image
**THEN** the plugin SHALL open the native picker on the current platform, stage the selection into its own cache, and return a cache-local `previewPath` that the host app can render with `convertFileSrc()`.

**WHEN** the picker completes successfully
**THEN** the plugin SHALL start background compression and emit `image_pipeline://job_completed` when the final asset is ready.

**WHEN** the picker or compression fails
**THEN** the plugin SHALL emit `image_pipeline://job_failed` with diagnostic fields.

### R4: Image Processing

The system SHALL process source images entirely in Rust using the `image` crate and `zenwebp`.

**WHEN** a source image is processed
**THEN** the system SHALL:
1. Read and decode the source bytes.
2. Apply EXIF orientation correction for all 8 standard orientations.
3. Resize the image so the longest edge is at most 400px (`MAX_LONG_EDGE`), using `FilterType::Triangle`. If the image already fits, no resize occurs.
4. Encode to WebP at quality 75, method 6.
5. Compute `contentHash` as SHA-256 of the WebP bytes.
6. Return `width`, `height`, `byte_size`, `content_hash`, `content_type = "image/webp"`, and `data_base64`.

**WHEN** a pending preview is needed for immediate UI feedback
**THEN** the system SHALL generate a JPEG preview at max 320px long edge, quality 75, and store it at `{source_dir}/pending_preview_{jobId}.jpg`.

### R5: Pending Asset Processing Jobs

The system SHALL maintain a `pending_asset_processing_jobs` table with columns: `id`, `merchantId`, `sourcePath`, `originalFilename`, `sourceMimeType`, `processingKind`, `entityType`, `entityId`, `attachmentField`, `previewPath`, `previewMimeType`, `status` (`pending` | `processing` | `failed`), `attempts`, `lastError`.

**WHEN** `enqueue_asset_processing` is called with a valid target and source path
**THEN** the system SHALL insert a row into `pending_asset_processing_jobs` with `status = 'pending'`, generate a JPEG preview, and return the `jobId`.

**WHEN** the source path is not under `product_photo_inputs`
**THEN** the system SHALL reject the request with a `non_photo_input_path` error.

**WHEN** the target is not in the supported allowlist
**THEN** the system SHALL reject the request with an `Unsupported asset attachment target` error.

**WHEN** `process_pending_asset_jobs` is called
**THEN** the system SHALL claim up to `limit` jobs (default 20) with `status IN ('pending', 'failed')`, ordered by `created_at ASC`, and for each:
1. Set `status = 'processing'` and increment `attempts`.
2. Run `prepare_local_image_asset_from_path_inner` to process the image, write the cached file, insert the asset row, and insert the cache row.
3. Link the asset to the target entity via `link_asset_to_attachment_target`.
4. Delete the source file and preview file if they are in a deletable path.
5. Delete the job row.
6. Emit `asset-cache-ready` and `asset-attachment-ready` Tauri events.

**WHEN** processing fails at any stage
**THEN** the system SHALL set `status = 'failed'`, record `last_error`, and continue with the next job.

**WHEN** the app starts
**THEN** the system SHALL reset any jobs stuck in `processing` status back to `pending`.

### R6: Local Asset Cache

The system SHALL maintain a `local_asset_cache` table with columns: `assetId` (PK), `merchantId`, `objectKey`, `localPath`, `contentHash`, `status`, `uploadAttempts`, `downloadAttempts`, `lastError`, `cachedAt`.

**WHEN** a local image asset is prepared
**THEN** the system SHALL write the WebP bytes to a file under the app cache directory keyed by `objectKey`, and insert or update the `local_asset_cache` row.

**WHEN** `get_cached_asset_path(assetId)` is called
**THEN** the system SHALL query `local_asset_cache` joined with `assets` for `local_path` and `content_type`, verify the file exists on disk, and return the path or `null`.

**WHEN** the file does not exist on disk despite a cache row existing
**THEN** the system SHALL return `null`.

### R7: Image URL Resolution (Frontend)

The system SHALL provide a `resolveAssetUrl(assetId)` function that invokes `get_cached_asset_path`, converts the local path via `convertFileSrc()`, and appends a `?v={version}` query parameter for cache busting.

**WHEN** the asset cache version for an `assetId` increments
**THEN** the URL returned by `resolveAssetUrl` SHALL change, causing the WebView to re-fetch the image.

### R8: Asset Attachment Targets

The system SHALL maintain a static allowlist of supported attachment targets. Currently supported: `{ entityType: "product", field: "image_asset_id", assetKind: "product_photo" }`.

**WHEN** `link_asset_to_attachment_target` is called with `entityType = "product"` and `field = "image_asset_id"`
**THEN** the system SHALL update `products.image_asset_id` for the given `entityId`, mark `is_synced = 0`, and create a sync outbox entry.

**WHEN** the target entity does not exist
**THEN** the system SHALL return an error.

### R9: Asset Adapter (SolidJS)

The system SHALL provide a `createAssetAdapter(config)` factory that creates a reactive adapter for a specific entity type and field.

**WHEN** `startEventListeners` is called
**THEN** the adapter SHALL subscribe to Tauri events `asset-cache-ready` and `asset-attachment-ready`, and increment the appropriate SolidJS store version counters.

**WHEN** `useImageUrl(assetId, entityId)` is called
**THEN** the adapter SHALL return a reactive accessor that resolves the cached image URL, falling back to a pending preview URL if available, and `null` otherwise.

**WHEN** the adapter receives an `asset-attachment-ready` event
**THEN** the adapter SHALL increment the domain catalog version for the entity type, triggering UI re-renders.

### R10: API Presign Upload

The system SHALL expose `POST /api/assets/presign-upload` that accepts `merchantId`, `kind`, `contentType`, `contentHash`, `byteSize`, and optional `assetId`, `objectKey`, `originalFilename`, `width`, `height`.

**WHEN** the request is valid and the user has merchant access
**THEN** the API SHALL:
1. If an asset with the same `merchantId` + `objectKey` exists and is `ready`, return it with an empty `uploadUrl`.
2. If an asset exists but is not `ready`, update it and return a presigned PUT URL.
3. Otherwise, insert a new asset row with `status = 'pending_upload'` and return a presigned PUT URL.

**WHEN** `byteSize <= 0`
**THEN** the API SHALL return a `BadRequestError`.

**WHEN** the user lacks merchant access
**THEN** the API SHALL return HTTP 403.

### R11: API Complete Upload

The system SHALL expose `POST /api/assets/complete-upload` that accepts `assetId`, `objectKey`, `contentHash`, and `byteSize`.

**WHEN** the asset exists, metadata matches, and the user has merchant access
**THEN** the API SHALL update the asset `status` to `ready` and return the updated asset.

**WHEN** metadata does not match
**THEN** the API SHALL return HTTP 400.

**WHEN** the asset is not found
**THEN** the API SHALL return HTTP 404.

### R12: API Presign Download

The system SHALL expose `POST /api/assets/presign-download` that accepts `assetId`.

**WHEN** the asset exists and the user has merchant access
**THEN** the API SHALL return a presigned GET URL for the asset's `objectKey` with a 1-hour expiry.

**WHEN** the asset is not found
**THEN** the API SHALL return HTTP 404.

### R13: Upload Queue (Rust)

The system SHALL provide an `upload_pending_assets` command that loads assets with `status = 'pending_upload'` for a merchant, uploads each to the presigned URL, and marks them `ready`.

**WHEN** upload succeeds for an asset
**THEN** the system SHALL call `complete-upload` on the API and update the local `assets` and `local_asset_cache` rows to `status = 'ready'`.

**WHEN** upload fails
**THEN** the system SHALL increment `uploadAttempts` in `local_asset_cache`, record `lastError`, and leave the asset as `pending_upload` for retry.

**NOTE:** The upload queue is currently stubbed out, returning an error message, pending baresync cutover.

### R14: Asset Hydration (Rust)

The system SHALL provide a `hydrate_missing_assets` command that downloads assets present in the synced `assets` table but missing from `local_asset_cache`.

**WHEN** hydration is triggered (after sync completes)
**THEN** the system SHALL for each missing asset: call `presign-download` on the API, download the file, write it to the local cache, and insert the `local_asset_cache` row.

**WHEN** download fails
**THEN** the system SHALL increment `downloadAttempts`, record `lastError`, and skip to the next asset.

**NOTE:** Hydration is currently stubbed out, returning an error message, pending baresync cutover.

### R15: Sync Pipeline Order

The system SHALL execute asset work in a fixed order during `syncNow()`.

**WHEN** `syncNow()` is called with a valid merchant
**THEN** the system SHALL execute in order:
1. `processPendingAssetJobs()` — process queued image processing work.
2. `uploadPendingProductImages()` — upload locally processed assets to object storage.
3. `syncNow()` core — push dirty rows, pull server changes.
4. `hydrateProductImagesInBackground()` — download missing assets in the background.

### R16: Image Upload State (SolidJS)

The system SHALL provide a `createImageUpload(options)` factory that manages the full pick-preview-enqueue lifecycle.

**WHEN** the user picks an image via `pickImage()`
**THEN** the system SHALL call the plugin-owned `pick_image` command, set `previewUrl` to the returned local path via `convertFileSrc()`, and retain the returned `jobId` until completion.

**WHEN** the matching `image_pipeline://job_completed` event arrives
**THEN** the system SHALL call `onAssetReady` with the final asset metadata and clear the staged state.

**WHEN** `clear()` is called
**THEN** the system SHALL delete the temp file if a staged image exists, or invoke `onClearExisting` if clearing an existing asset.

**WHEN** the component using the upload state unmounts
**THEN** the system SHALL clean up any staged temp files via `onCleanup`.

### R17: Asset Events

The system SHALL emit Tauri events to notify the frontend of asset lifecycle changes.

**WHEN** an asset is cached locally
**THEN** the system SHALL emit `asset-cache-ready` with `{ asset_id }`.

**WHEN** an asset is linked to an entity
**THEN** the system SHALL emit `asset-attachment-ready` with `{ asset_id, entity_id, entity_type, field }`.

**WHEN** the frontend receives these events
**THEN** the adapter SHALL increment the appropriate version counters to trigger reactive re-renders.

### R18: Presigned URL Security

The system SHALL treat presigned URLs as bearer tokens in logs: never log the full URL.

**WHEN** presigned URLs are logged for debugging
**THEN** the system SHALL log only the object key and expiry, not the signature or full URL.

**WHEN** S3 credentials are needed for signing
**THEN** the API SHALL read them from Cloudflare Worker environment variables (`ASSET_S3_BUCKET`, `ASSET_S3_ENDPOINT`, `ASSET_S3_ACCESS_KEY_ID`, `ASSET_S3_SECRET_ACCESS_KEY`, `ASSET_S3_REGION`).

**WHEN** the app needs to upload/download
**THEN** the app SHALL NOT store object storage credentials locally; it SHALL request presigned URLs from the API.
