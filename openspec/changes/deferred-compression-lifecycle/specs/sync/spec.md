## MODIFIED Requirements

### Requirement: Sync Pipeline Order
The system SHALL execute asset work in a fixed order during `syncNow()`.

**WHEN** `syncNow()` is called with a valid merchant
**THEN** the system SHALL execute in order:
1. `syncNow()` core — push dirty rows, pull server changes.
2. `uploadPendingAssets()` — upload locally processed assets with `status = 'compressed'` to object storage. This includes presign-upload, S3 upload, and complete-upload.
3. `hydrateMissingAssetsInBackground()` — download missing assets in the background.

**NOTE:** `processPendingAssetJobs()` is REMOVED from the sync pipeline. Compression is now triggered at submit time via `compress_asset`, not during sync.

### Requirement: Asset upload queue behavior
The system SHALL upload assets with `status = 'compressed'` (not `pending_upload`) to object storage.

**WHEN** the upload queue runs
**THEN** the system SHALL query `assets` where `status = 'compressed'` AND `merchantId` matches the current merchant, and for each:
1. Call presign-upload on the API with the asset's metadata.
2. Upload the file to S3 using the presigned URL.
3. Call complete-upload on the API.
4. Update the local asset `status` to `ready`.

**WHEN** upload fails
**THEN** the system SHALL leave the asset as `compressed` for retry on the next sync or `job_completed` event.

### Requirement: Sync excludes pending assets
The system SHALL NOT sync assets with `status IN ('pending', 'compressed')` to the server.

**WHEN** a sync push occurs
**THEN** assets with `status = 'pending'` or `status = 'compressed'` SHALL NOT be included in the push payload.

**WHEN** a sync pull receives an asset row from the server
**THEN** the local `assets` table SHALL upsert the row by `id`, and the local `status` SHALL reflect the server's value.
