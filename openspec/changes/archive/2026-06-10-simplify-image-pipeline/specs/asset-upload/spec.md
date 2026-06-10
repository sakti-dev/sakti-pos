## ADDED Requirements

### Requirement: Upload single asset

The system SHALL provide an `uploadSingleAsset(assetId, sessionToken)` function that uploads a compressed asset to S3 and marks it ready via baresync `writeTransaction`.

**WHEN** `uploadSingleAsset` is called
**THEN** the system SHALL:
1. Query the assets table for the asset row (status, objectKey, contentType, merchantId)
2. Read the compressed file bytes from the plugin cache
3. `fetch()` the API presign-upload endpoint with asset metadata
4. `fetch()` PUT the WebP bytes to the presigned S3 URL
5. `fetch()` the API complete-upload endpoint
6. `writeTransaction` to update the asset row: `status = 'ready'`, `enqueueChange` for outbox

#### Scenario: Full upload succeeds
- **WHEN** presign, S3 PUT, and complete-upload all succeed
- **THEN** the asset status is set to `ready` via `writeTransaction`, and the outbox entry is recorded

#### Scenario: Presign fails
- **WHEN** the presign-upload API call fails
- **THEN** the asset stays `compressed` (no status change), and the error is logged

#### Scenario: S3 PUT fails
- **WHEN** the upload to the presigned URL fails
- **THEN** the asset stays `compressed` (no status change), and the error is logged

#### Scenario: Complete-upload fails
- **WHEN** the S3 upload succeeded but the complete-upload API call fails
- **THEN** the asset stays `compressed` (no status change), and the error is logged

### Requirement: Upload pending assets batch

The system SHALL provide an `uploadPendingAssets(merchantId, sessionToken)` function that queries all compressed assets and uploads them.

**WHEN** `uploadPendingAssets` is called
**THEN** the system SHALL:
1. Query the assets table for rows with `status = 'compressed'` and matching `merchantId`
2. For each: call `uploadSingleAsset`
3. Return the count of successfully uploaded assets

#### Scenario: Multiple pending uploads
- **WHEN** 3 assets are compressed and pending upload
- **THEN** each is uploaded sequentially, and the count of successful uploads is returned

#### Scenario: No pending uploads
- **WHEN** no assets have `status = 'compressed'`
- **THEN** the function returns 0 immediately

### Requirement: Upload triggered after compression

**WHEN** the asset lifecycle listener handles `image_pipeline://job_completed`
**THEN** after updating the asset row to `compressed`, it SHALL trigger `uploadSingleAsset` for that asset.

### Requirement: Upload triggered during sync cycle

**WHEN** `syncNow()` runs
**THEN** after the baresync core sync completes, `uploadPendingAssets` SHALL be called for the current merchant.
