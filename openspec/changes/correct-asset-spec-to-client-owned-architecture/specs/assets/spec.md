## MODIFIED Requirements

### Requirement: Asset Metadata Schema

The system SHALL maintain an `assets` table with the following columns: `id`, `merchantId`, `jobId`, `objectKey`, `originalFilename`, `contentType`, `byteSize`, `contentHash`, `kind`, `width`, `height`, `status` (enum: `pending`, `compressed`, `ready`, `failed`), and `createdByUserId`. The `assets` table SHALL be included in baresync between API and POS. The client owns the asset-row lifecycle; the API SHALL NOT insert, update, or otherwise write to the `assets` table.

**WHEN** a new asset is created locally
**THEN** the client SHALL insert the row into the local `assets` table with `status = 'pending'` and a corresponding outbox entry SHALL be created for sync.

**WHEN** the plugin emits `image_pipeline://job_completed` for an asset
**THEN** the client SHALL transition the row to `status = 'compressed'` (recording `contentHash`, `byteSize`, `width`, `height`) via a baresync `writeTransaction` with an enqueued change.

**WHEN** the client has successfully PUT the compressed asset to object storage
**THEN** the client SHALL transition the row to `status = 'ready'` (recording `objectKey`) via a baresync `writeTransaction` with an enqueued change.

**WHEN** an asset row is synced from the API
**THEN** the POS local database SHALL upsert the row by `id` without transferring binary file bytes.

### Requirement: Asset Object Key

The system SHALL derive the `objectKey` from `{merchantId}/assets/{assetId}`, where `{assetId}` is a UUIDv7. The client SHALL request a presigned PUT URL from the API for this key. The system SHALL NOT deduplicate assets on the API side.

**WHEN** the client requests a presigned upload URL
**THEN** the API SHALL derive the `objectKey` as `{merchantId}/assets/{assetId}` (using a UUIDv7 when the client does not supply an `assetId`).

**WHEN** the API returns the presigned URL
**THEN** the API SHALL NOT consult or write the `assets` table; object-key generation is collision-resistant by construction (UUIDv7) and requires no guard.

### Requirement: Image Picking

The system SHALL provide image picking through the vendored plugin `vendor/tauri-plugin-image-pipeline`. The plugin SHALL expose a `pick_image` command (plugin name `image-pipeline`) accepting a `PickImageRequest` (`{ compression: { maxLongEdge, previewMaxLongEdge, quality }, pickerMode }`) and returning a `PickImageResponse` (`{ jobId, previewPath, previewMimeType, stagedSourcePath }`).

**WHEN** the client invokes `pick_image`
**THEN** the plugin SHALL open the native picker on the current platform, stage the source file, generate a preview, and return the `jobId`, `previewPath`, `previewMimeType`, and `stagedSourcePath`. The plugin SHALL NOT compress the asset at pick time.

**WHEN** the client needs to render the picked image before compression completes
**THEN** the client SHALL convert `previewPath` via `convertFileSrc()` and render it.

The detailed behavior of the native picker, preview generation, and source staging is an internal concern of the plugin and is opaque to the application. The application depends only on the request/response contract above.

### Requirement: Image Processing

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

### Requirement: API Presign Upload

The system SHALL expose `POST /api/assets/presign-upload` that accepts `merchantId`, `contentType`, and optional `assetId`, `objectKey`. The endpoint is a pure presign service: it SHALL NOT read from or write to the `assets` table.

**WHEN** the request is valid and the user has merchant access
**THEN** the API SHALL derive the `objectKey` as `{merchantId}/assets/{assetId}` (using a UUIDv7 when `assetId` is absent), presign a PUT URL for that key, and return `{ uploadUrl, objectKey, requiredHeaders: [{ name: "Content-Type", value: contentType }] }`.

**WHEN** the user lacks merchant access
**THEN** the API SHALL return HTTP 403.

**WHEN** `merchantId` or `contentType` is missing or empty
**THEN** the API SHALL return HTTP 400.

The endpoint SHALL NOT insert, update, deduplicate, or otherwise transition asset state. Asset-row lifecycle is owned by the client (see Asset Metadata Schema).

### Requirement: Upload Queue

The system SHALL perform asset upload client-side. The client SHALL own the flow: request a presigned PUT URL from `/api/assets/presign-upload`, PUT the compressed bytes (resolved via `get_asset_path`) to the presigned URL, and transition the `assets` row to `status = 'ready'` via a baresync `writeTransaction` with an enqueued change.

**WHEN** the client runs the upload queue for a merchant
**THEN** the client SHALL select rows with `status = 'compressed'` for that merchant and, for each, request a presigned URL, PUT the bytes to object storage, and mark the row `ready`.

**WHEN** a presign request or the PUT fails
**THEN** the client SHALL leave the row as `compressed` for retry and continue with the next asset.

**WHEN** the client starts up with rows stuck at `status = 'pending'` (staged source already cleaned up, re-compression impossible)
**THEN** the client SHALL transition them to `status = 'failed'` via a baresync `writeTransaction`.

There SHALL be no Rust-side `upload_pending_assets` command; upload is a client responsibility.

### Requirement: Asset Events

The system SHALL emit a single Tauri event from the plugin to notify the client of image-processing completion.

**WHEN** `compress_asset` completes
**THEN** the plugin SHALL emit `image_pipeline://job_completed` with `{ jobId, contentHash, byteSize, width, height, contentType, originalFilename }`.

**WHEN** the client receives `image_pipeline://job_completed`
**THEN** the client SHALL update the matching `assets` row to `compressed` and trigger upload.

The system SHALL NOT emit `asset-cache-ready` or `asset-attachment-ready` events. UI re-render after an asset becomes available is driven by the existing baresync data-change invalidation path, not by dedicated asset events.

## REMOVED Requirements

### Requirement: Pending Asset Processing Jobs

**Reason**: The separate `pending_asset_processing_jobs` table does not exist. Pending-job tracking is the `assets` table's `status` column: a row is `pending` until `job_completed` transitions it to `compressed`. There is no `enqueue_asset_processing` or `process_pending_asset_jobs` command in the plugin — the app drives the lifecycle directly via `pick_image` → `compress_asset` → `job_completed`.

**Migration**: Treat the `assets.status` column as the job ledger. See the MODIFIED "Asset Metadata Schema" and "Image Picking"/"Image Processing" requirements for the lifecycle.

### Requirement: Local Asset Cache

**Reason**: The separate `local_asset_cache` table does not exist. The plugin owns its filesystem cache under the app cache dir, and its layout is opaque to the application. The app resolves a cached asset exclusively through the `get_asset_path` command, which returns `{ localPath, contentType }` or `null`.

**Migration**: Use `get_asset_path(assetId, jobId?)` (see MODIFIED "Image Processing") to resolve cached assets. Do not model a cache table in the application schema.

### Requirement: API Complete Upload

**Reason**: The `POST /api/assets/complete-upload` endpoint does not exist in this architecture and the client never calls it. The API is a pure presign gateway and does not own asset-row status; the client transitions the row to `ready` itself via a baresync `writeTransaction` after the PUT succeeds.

**Migration**: After a successful PUT to the presigned URL, mark the `assets` row `ready` client-side (see MODIFIED "Upload Queue"). There is no API call to make.
