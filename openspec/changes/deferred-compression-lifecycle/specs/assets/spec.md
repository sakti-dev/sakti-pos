## MODIFIED Requirements

### Requirement: Asset Metadata Schema
The system SHALL maintain an `assets` table with the following columns: `id`, `merchantId`, `jobId` (nullable), `objectKey` (nullable), `originalFilename`, `contentType`, `byteSize` (nullable), `contentHash` (nullable), `kind`, `width` (nullable), `height` (nullable), `status` (enum: `pending`, `compressed`, `pending_upload`, `ready`, `failed`), and `createdByUserId`. The `assets` table SHALL be included in baresync between API and POS.

**WHEN** a new asset is created locally at submit time
**THEN** it SHALL be inserted into the local `assets` table with `status = 'pending'`, `jobId` set to the plugin compression job ID, `contentHash = null`, `byteSize = null`, `width = null`, `height = null`, and a corresponding outbox entry SHALL be created for sync.

**WHEN** an asset row has `status = 'pending'` and `contentHash IS NULL`
**THEN** it SHALL NOT be uploaded to S3 or synced as a completed asset.

**WHEN** an asset row is synced from the API
**THEN** the POS local database SHALL upsert the row by `id` without transferring binary file bytes.

### Requirement: Asset Object Key and Deduplication
The system SHALL derive the `objectKey` from `{merchantId}/assets/{assets.id}`. The `objectKey` SHALL be generated at asset creation time (submit time), not at compression completion.

**WHEN** an asset with the same `merchantId` and `objectKey` already exists on the API
**THEN** the API SHALL return the existing asset row without creating a duplicate, provided metadata matches.

**WHEN** an asset with the same `objectKey` but conflicting metadata is requested
**THEN** the API SHALL return HTTP 409.

### Requirement: Asset lifecycle status progression
The system SHALL support the following asset status progression: `pending` → `compressed` → `pending_upload` → `ready`. The system SHALL also support `failed` as a terminal state.

**WHEN** compression completes successfully
**THEN** the system SHALL update the asset row with `contentHash`, `byteSize`, `width`, `height`, and set `status = 'compressed'`.

**WHEN** presign-upload succeeds
**THEN** the system SHALL set `status = 'pending_upload'`.

**WHEN** complete-upload succeeds
**THEN** the system SHALL set `status = 'ready'`.

**WHEN** compression or upload fails
**THEN** the system SHALL set `status = 'failed'`.

### Requirement: Startup recovery for pending assets
The system SHALL recover interrupted compression jobs on app startup.

**WHEN** the app starts
**THEN** the system SHALL query `assets` where `status = 'pending'` AND `jobId IS NOT NULL`, and for each:
1. Call `plugin.get_completed_job(jobId)`.
2. If found, update the asset with metadata and set `status = 'compressed'`.
3. If failed, retry compression or mark asset as `failed`.
4. If still in-progress, leave the asset as `pending`.

### Requirement: Startup recovery for compressed assets
The system SHALL resume interrupted uploads on app startup.

**WHEN** the app starts
**THEN** the system SHALL query `assets` where `status = 'compressed'`, and for each:
1. Call presign-upload to get a fresh S3 PUT URL.
2. Upload the file to S3.
3. Call complete-upload to set `status = 'ready'`.

### Requirement: Upload queue triggers on job_completed
The upload queue SHALL run after a `job_completed` event is processed, in addition to running during sync.

**WHEN** an `image_pipeline://job_completed` event is processed and the asset status is updated to `compressed`
**THEN** the system SHALL trigger the upload queue for that asset without waiting for the next sync.

### Requirement: Sync gating on asset status
The system SHALL only sync assets with `status = 'ready'` to the server.

**WHEN** an asset has `status IN ('pending', 'compressed')`
**THEN** the asset SHALL NOT be uploaded to the server during sync.

**WHEN** an asset has `status = 'ready'`
**THEN** the asset SHALL be eligible for sync to the server.
