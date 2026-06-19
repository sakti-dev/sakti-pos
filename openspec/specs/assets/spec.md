# Assets

## Purpose

The Assets domain manages the lifecycle of binary files (currently product photos) in an offline-first POS system. It provides camera/gallery image picking on Android, local image processing to WebP, presigned S3 upload/download via the API, a local file cache on each device, and metadata synchronization—without ever syncing binary file bytes between devices. Product rows reference assets through `image_asset_id`, and new entity types can be added by extending the allowlist.

## Requirements

### R1: Asset Metadata Schema

The system SHALL maintain an `assets` table with the following columns: `id`, `merchantId`, `jobId`, `objectKey`, `originalFilename`, `contentType`, `byteSize`, `contentHash`, `kind`, `width`, `height`, `status` (enum: `pending`, `compressed`, `ready`, `failed`), and `createdByUserId`. The `assets` table SHALL be included in baresync between API and POS. The client owns the asset-row lifecycle; the API SHALL NOT insert, update, or otherwise write to the `assets` table.

**WHEN** a new asset is created locally
**THEN** the client SHALL insert the row into the local `assets` table with `status = 'pending'` and a corresponding outbox entry SHALL be created for sync.

**WHEN** the plugin emits `image_pipeline://job_completed` for an asset
**THEN** the client SHALL transition the row to `status = 'compressed'` (recording `contentHash`, `byteSize`, `width`, `height`) via a baresync `writeTransaction` with an enqueued change.

**WHEN** the client has successfully PUT the compressed asset to object storage
**THEN** the client SHALL transition the row to `status = 'ready'` (recording `objectKey`) via a baresync `writeTransaction` with an enqueued change.

**WHEN** an asset row is synced from the API
**THEN** the POS local database SHALL upsert the row by `id` without transferring binary file bytes.

### R2: Asset Object Key

The system SHALL derive the `objectKey` from `{merchantId}/assets/{assetId}`, where `{assetId}` is a UUIDv7. The client SHALL request a presigned PUT URL from the API for this key. The system SHALL NOT deduplicate assets on the API side.

**WHEN** the client requests a presigned upload URL
**THEN** the API SHALL derive the `objectKey` as `{merchantId}/assets/{assetId}` (using a UUIDv7 when the client does not supply an `assetId`).

**WHEN** the API returns the presigned URL
**THEN** the API SHALL NOT consult or write the `assets` table; object-key generation is collision-resistant by construction (UUIDv7) and requires no guard.

### R3: Image Picking

The system SHALL provide image picking through the vendored plugin `vendor/tauri-plugin-image-pipeline`. The plugin SHALL expose a `pick_image` command (plugin name `image-pipeline`) accepting a `PickImageRequest` (`{ compression: { maxLongEdge, previewMaxLongEdge, quality }, pickerMode }`) and returning a `PickImageResponse` (`{ jobId, previewPath, previewMimeType, stagedSourcePath }`).

**WHEN** the client invokes `pick_image`
**THEN** the plugin SHALL open the native picker on the current platform, stage the source file, generate a preview, and return the `jobId`, `previewPath`, `previewMimeType`, and `stagedSourcePath`. The plugin SHALL NOT compress the asset at pick time.

**WHEN** the client needs to render the picked image before compression completes
**THEN** the client SHALL convert `previewPath` via `convertFileSrc()` and render it.

The detailed behavior of the native picker, preview generation, and source staging is an internal concern of the plugin and is opaque to the application. The application depends only on the request/response contract above.

### R4: Image Processing

The system SHALL process source images through the vendored plugin `vendor/tauri-plugin-image-pipeline`. The plugin SHALL expose a `compress_asset` command accepting a `CompressAssetRequest` (`{ assetId, jobId, stagedSourcePath, maxLongEdge, quality }`) and returning a `CompressAssetResponse` (`{ jobId }`). Upon success the plugin SHALL write the compressed file to its cache, emit `image_pipeline://job_completed` with `{ jobId, contentHash, byteSize, width, height, contentType, originalFilename }`, and delete the staged source and preview files.

**WHEN** the client invokes `compress_asset` for a staged source
**THEN** the plugin SHALL compress the image, compute `contentHash`, and emit `image_pipeline://job_completed` with the resulting metadata.

**WHEN** compression succeeds
**THEN** the plugin SHALL write the compressed file (resolvable later via `get_asset_path`) and clean up the staged source and preview files.

**WHEN** the client needs to resolve a cached asset to a renderable URL
**THEN** the client SHALL invoke `get_asset_path(assetId, jobId?)`, which returns `{ localPath, contentType }` for the compressed file if present, otherwise the preview, otherwise `null`; the client SHALL convert `localPath` via `convertFileSrc()`.

**WHEN** the client needs to delete a cached asset file
**THEN** the client SHALL invoke `delete_asset({ assetPath })`, which is idempotent.

The exact pipeline (decode, EXIF orientation, resize filter, WebP encoding parameters) is an internal concern of the plugin and is opaque to the application. The application depends only on the command contract and the completion event.

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
**THEN** the adapter SHALL subscribe to the baresync data-change event and increment the appropriate SolidJS store version counters.

**WHEN** `useImageUrl(assetId, entityId)` is called
**THEN** the adapter SHALL return a reactive accessor that resolves the cached image URL, falling back to a pending preview URL if available, and `null` otherwise.

**WHEN** the adapter receives a data-change invalidation for the entity type
**THEN** the adapter SHALL increment the domain catalog version, triggering UI re-renders.

### R10: API Presign Upload

The system SHALL expose `POST /api/assets/presign-upload` that accepts `merchantId`, `contentType`, and optional `assetId`, `objectKey`. The endpoint is a pure presign service: it SHALL NOT read from or write to the `assets` table.

**WHEN** the request is valid and the user has merchant access
**THEN** the API SHALL derive the `objectKey` as `{merchantId}/assets/{assetId}` (using a UUIDv7 when `assetId` is absent), presign a PUT URL for that key, and return `{ uploadUrl, objectKey, requiredHeaders: [{ name: "Content-Type", value: contentType }] }`.

**WHEN** the user lacks merchant access
**THEN** the API SHALL return HTTP 403.

**WHEN** `merchantId` or `contentType` is missing or empty
**THEN** the API SHALL return HTTP 400.

The endpoint SHALL NOT insert, update, deduplicate, or otherwise transition asset state. Asset-row lifecycle is owned by the client (see Asset Metadata Schema).

### R12: API Presign Download

The system SHALL expose `POST /api/assets/presign-download` that accepts `assetId`.

**WHEN** the asset exists and the user has merchant access
**THEN** the API SHALL return a presigned GET URL for the asset's `objectKey` with a 1-hour expiry.

**WHEN** the asset is not found
**THEN** the API SHALL return HTTP 404.

### R13: Upload Queue

The system SHALL perform asset upload client-side. The client SHALL own the flow: request a presigned PUT URL from `/api/assets/presign-upload`, PUT the compressed bytes (resolved via `get_asset_path`) to the presigned URL, and transition the `assets` row to `status = 'ready'` via a baresync `writeTransaction` with an enqueued change.

**WHEN** the client runs the upload queue for a merchant
**THEN** the client SHALL select rows with `status = 'compressed'` for that merchant and, for each, request a presigned URL, PUT the bytes to object storage, and mark the row `ready`.

**WHEN** a presign request or the PUT fails
**THEN** the client SHALL leave the row as `compressed` for retry and continue with the next asset.

**WHEN** the client starts up with rows stuck at `status = 'pending'` (staged source already cleaned up, re-compression impossible)
**THEN** the client SHALL transition them to `status = 'failed'` via a baresync `writeTransaction`.

There SHALL be no Rust-side `upload_pending_assets` command; upload is a client responsibility.

### R14: Asset Hydration

The system SHALL hydrate missing local assets after sync completes.

**WHEN** hydration is triggered (after sync completes)
**THEN** the system SHALL, for each asset present in the synced `assets` table but missing from the local cache, download it from object storage via a presigned GET URL and resolve it through the plugin's cache.

**WHEN** download fails
**THEN** the system SHALL record the error and skip to the next asset.

**NOTE:** Hydration is currently stubbed out (`Promise.resolve(0)`) in the client, pending implementation.

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

The system SHALL emit a single Tauri event from the plugin to notify the client of image-processing completion.

**WHEN** `compress_asset` completes
**THEN** the plugin SHALL emit `image_pipeline://job_completed` with `{ jobId, contentHash, byteSize, width, height, contentType, originalFilename }`.

**WHEN** the client receives `image_pipeline://job_completed`
**THEN** the client SHALL update the matching `assets` row to `compressed` and trigger upload.

The system SHALL NOT emit `asset-cache-ready` or `asset-attachment-ready` events. UI re-render after an asset becomes available is driven by the existing baresync data-change invalidation path, not by dedicated asset events.

### R18: Presigned URL Security

The system SHALL treat presigned URLs as bearer tokens in logs: never log the full URL.

**WHEN** presigned URLs are logged for debugging
**THEN** the system SHALL log only the object key and expiry, not the signature or full URL.

**WHEN** S3 credentials are needed for signing
**THEN** the API SHALL read them from Cloudflare Worker environment variables (`ASSET_S3_BUCKET`, `ASSET_S3_ENDPOINT`, `ASSET_S3_ACCESS_KEY_ID`, `ASSET_S3_SECRET_ACCESS_KEY`, `ASSET_S3_REGION`).

**WHEN** the app needs to upload/download
**THEN** the app SHALL NOT store object storage credentials locally; it SHALL request presigned URLs from the API.
