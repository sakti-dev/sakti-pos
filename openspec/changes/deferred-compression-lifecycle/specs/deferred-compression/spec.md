## ADDED Requirements

### Requirement: Deferred compression via compress_asset command
The system SHALL provide a `compress_asset` command through `tauri-plugin-image-pipeline` that takes a `jobId` and `stagedSourcePath`, starts background compression to WebP, and emits `image_pipeline://job_completed` when the final asset is ready.

#### Scenario: Successful deferred compression
- **WHEN** `compress_asset` is called with a valid `jobId` and `stagedSourcePath`
- **THEN** the plugin SHALL start background compression and emit `image_pipeline://job_completed` with `jobId`, `contentHash`, `assetPath`, `width`, `height`, `byteSize`, `contentType`, and `originalFilename`

#### Scenario: Compression failure
- **WHEN** `compress_asset` is called and compression fails (e.g., source file missing, decode error)
- **THEN** the plugin SHALL emit `image_pipeline://job_failed` with `jobId` and an error message

#### Scenario: Source file missing
- **WHEN** `compress_asset` is called and the `stagedSourcePath` does not exist on disk
- **THEN** the plugin SHALL emit `image_pipeline://job_failed` with `jobId` and a `source_not_found` error

### Requirement: pick_image returns preview only without compression
The `pick_image` command SHALL open the native picker, stage the source file, generate a preview, and return immediately WITHOUT starting background compression or emitting `image_pipeline://job_completed`.

#### Scenario: pick_image returns preview path and job ID
- **WHEN** `pick_image` is called with `pickerMode = "image"`
- **THEN** the plugin SHALL return `{ jobId, stagedSourcePath, previewPath, previewMimeType }` without starting compression

#### Scenario: pick_image no longer emits job_completed
- **WHEN** `pick_image` completes successfully
- **THEN** the plugin SHALL NOT emit `image_pipeline://job_completed` or `image_pipeline://job_failed`

### Requirement: Manual deleteAsset command
The system SHALL provide a `deleteAsset` command through `tauri-plugin-image-pipeline` that deletes a local asset file by path.

#### Scenario: Successful deletion
- **WHEN** `deleteAsset` is called with a valid `assetPath` that exists on disk
- **THEN** the plugin SHALL delete the file and return success

#### Scenario: File does not exist
- **WHEN** `deleteAsset` is called with an `assetPath` that does not exist
- **THEN** the plugin SHALL return success (idempotent delete)

### Requirement: TTL-based GC for staging and preview files
The system SHALL clean up staging source files and preview files older than 30 minutes after last access.

#### Scenario: Staging file cleanup on startup
- **WHEN** the app starts
- **THEN** the plugin SHALL delete staging files in `picked/` directory older than 30 minutes

#### Scenario: Preview file cleanup on startup
- **WHEN** the app starts
- **THEN** the plugin SHALL delete preview files in `previews/` directory older than 30 minutes
