## ADDED Requirements

### Requirement: Plugin public API — 4 commands

The plugin SHALL expose exactly 4 public Tauri commands: `pick_image`, `compress_asset`, `get_asset_path`, `delete_asset`. No other commands SHALL be exposed.

**WHEN** the plugin is initialized
**THEN** it SHALL register `pick_image`, `compress_asset`, `get_asset_path`, and `delete_asset` as Tauri commands.

#### Scenario: Plugin registers exactly 4 commands
- **WHEN** the plugin `build.rs` generates command permissions
- **THEN** it SHALL produce permission TOML files for exactly: `pick_image`, `compress_asset`, `get_asset_path`, `delete_asset`

### Requirement: pick_image command

The plugin SHALL provide a `pick_image` command that opens the native file picker, stages the source file, generates a preview, and returns immediately.

**WHEN** `pick_image` is called with `{ compression: { maxLongEdge, previewMaxLongEdge, quality }, pickerMode }`
**THEN** the plugin SHALL:
1. Open the native file picker for the given mode
2. Stage the selected file into `<cache_root>/picked/<jobId>.source`
3. Generate a JPEG preview at `<cache_root>/previews/<jobId_prefix>_preview.jpg`
4. Return `{ jobId, stagedSourcePath, previewPath, previewMimeType }`

#### Scenario: Desktop picker returns staged preview
- **WHEN** the user selects an image on desktop
- **THEN** the plugin copies the file to staged source, generates a preview, and returns the response

#### Scenario: Android picker stages content:// URI
- **WHEN** the user selects an image on Android returning a `content://` URI
- **THEN** the plugin copies the URI content to staged source, generates a preview, and returns the response

#### Scenario: User cancels picker
- **WHEN** the user cancels the native picker
- **THEN** the plugin SHALL NOT create a job or stage any files
- **AND THEN** it SHALL return a cancellation error

### Requirement: compress_asset command

The plugin SHALL provide a `compress_asset` command that compresses a staged source image, writes the result to cache, emits a completion event, and cleans up staged files.

**WHEN** `compress_asset` is called with `{ assetId, jobId, stagedSourcePath, maxLongEdge, quality }`
**THEN** the plugin SHALL:
1. Read the staged source file
2. Compress to WebP using the platform-appropriate processor
3. Write the compressed file to `<cache_root>/assets/<assetId>.webp`
4. Compute SHA-256 of the compressed bytes as `contentHash`
5. Emit `image_pipeline://job_completed` with `{ jobId, contentHash, byteSize, width, height, contentType, originalFilename }`
6. Delete the staged source file and preview file
7. Return `{ jobId }`

#### Scenario: Compress asset succeeds
- **WHEN** the staged source file exists and is a valid image
- **THEN** the plugin writes the compressed WebP, emits the event, cleans up staged files, and returns `{ jobId }`

#### Scenario: Compress asset source not found
- **WHEN** the staged source file does not exist
- **THEN** the plugin SHALL return a `SourceNotFound` error with the missing path

### Requirement: get_asset_path command

The plugin SHALL provide a `get_asset_path(assetId, jobId?)` command that resolves the best available file for an asset.

**WHEN** `get_asset_path` is called
1. Check if a compressed file exists at `<cache_root>/assets/<assetId>.webp`
2. If yes, return `{ localPath }`
3. If no compressed file and `jobId` is provided, check if a preview exists at `<cache_root>/previews/<jobId_prefix>_preview.jpg`
4. If yes, return `{ localPath }`
5. If neither, return `null`

#### Scenario: Asset is compressed
- **WHEN** the compressed WebP file exists on disk
- **THEN** `get_asset_path` returns the compressed file path

#### Scenario: Asset is pending with preview
- **WHEN** no compressed file exists but a preview exists from the pick step
- **THEN** `get_asset_path` returns the preview file path

#### Scenario: Asset has no files
- **WHEN** neither compressed nor preview files exist
- **THEN** `get_asset_path` returns `null`

### Requirement: delete_asset command

The plugin SHALL provide a `delete_asset(assetPath)` command for idempotent file deletion.

**WHEN** `delete_asset` is called with a path
**THEN** the plugin SHALL delete the file if it exists, or succeed silently if it doesn't.

#### Scenario: Delete existing asset
- **WHEN** the file at the given path exists
- **THEN** the plugin deletes it and returns success

#### Scenario: Delete non-existent asset
- **WHEN** the file at the given path does not exist
- **THEN** the plugin returns success (idempotent)

### Requirement: Flat cache layout — no domain scoping

The plugin SHALL store all cached files using only the asset ID or job ID. No merchant ID, tenant ID, or other app-specific scoping SHALL appear in the cache directory structure.

**WHEN** a compressed file is written
**THEN** it SHALL be stored at `<cache_root>/assets/<assetId>.webp`.

**WHEN** a preview is written
**THEN** it SHALL be stored at `<cache_root>/previews/<jobId_prefix>_preview.jpg`.

**WHEN** a source is staged
**THEN** it SHALL be stored at `<cache_root>/picked/<jobId>.source`.

#### Scenario: Compressed file uses flat path
- **WHEN** `compress_asset` writes output for asset ID `abc123`
- **THEN** the file is at `<cache_root>/assets/abc123.webp`

#### Scenario: Preview uses flat path
- **WHEN** `pick_image` generates a preview for job ID `xyz789`
- **THEN** the preview is at `<cache_root>/previews/xyz789_preview.jpg`

### Requirement: Completion event

The plugin SHALL emit `image_pipeline://job_completed` after `compress_asset` succeeds and the compressed file has been written.

The event payload SHALL include:
- `jobId`
- `contentHash` (SHA-256 of compressed bytes)
- `byteSize`
- `width`
- `height`
- `contentType`
- `originalFilename`

#### Scenario: Compress asset emits completion event
- **WHEN** `compress_asset` completes successfully
- **THEN** the plugin emits `image_pipeline://job_completed` with the full payload

### Requirement: No app-domain concepts in DTOs

The plugin's request and response DTOs SHALL NOT contain `merchant_id`, `entity_type`, `entity_id`, `attachment_field`, or any other host-application domain concept.

#### Scenario: DTOs contain only generic image fields
- **WHEN** the plugin's DTOs are serialized
- **THEN** they contain only `jobId`, `assetId`, `stagedSourcePath`, `previewPath`, `previewMimeType`, `contentHash`, `byteSize`, `width`, `height`, `contentType`, `originalFilename`, `maxLongEdge`, `quality`, `pickerMode`, and `compression` fields

### Requirement: Platform-specific processor selection

The plugin SHALL select the Rust desktop processor for non-Android targets and the Android Kotlin processor for Android targets at compile time.

#### Scenario: Desktop build uses Rust processor
- **WHEN** the plugin is compiled for a non-Android target
- **THEN** `DefaultProcessor` is used and Rust image codec dependencies are included

#### Scenario: Android build uses Kotlin processor
- **WHEN** the plugin is compiled for Android
- **THEN** the Android bridge calls Kotlin through `run_mobile_plugin` and Rust codec dependencies are excluded

### Requirement: Plugin-owned picker staging

The plugin SHALL own the native picker flow and SHALL stage selected files into plugin cache before returning.

#### Scenario: Desktop file is staged
- **WHEN** the user selects a file on desktop
- **THEN** the plugin copies it to `<cache_root>/picked/<jobId>.source`

#### Scenario: Android content:// URI is staged
- **WHEN** the Android picker returns a `content://` URI
- **THEN** the plugin copies the URI content to `<cache_root>/picked/<jobId>.source` before preview generation

### Requirement: Staged file cleanup after compression

The plugin SHALL delete the staged source file and preview file after `compress_asset` succeeds.

#### Scenario: Staged source deleted after compress
- **WHEN** `compress_asset` succeeds
- **THEN** the staged source file at `<cache_root>/picked/<jobId>.source` is deleted

#### Scenario: Preview deleted after compress
- **WHEN** `compress_asset` succeeds
- **THEN** the preview file at `<cache_root>/previews/<jobId_prefix>_preview.jpg` is deleted

### Requirement: Guest JS bindings

The plugin's `guest-js/index.ts` SHALL export exactly: `pickImage`, `compressAsset`, `getAssetPath`, `deleteAsset`.

#### Scenario: Guest JS exports 4 functions
- **WHEN** a consumer imports from the guest JS package
- **THEN** exactly `pickImage`, `compressAsset`, `getAssetPath`, `deleteAsset` are available

### Requirement: TTL-based GC for staging and preview files

The plugin SHALL clean up staging source files and preview files older than 30 minutes after last access on plugin initialization.

#### Scenario: Staging file cleanup on startup
- **WHEN** the plugin initializes
- **THEN** it SHALL delete staging files in `<cache_root>/picked/` older than 30 minutes since last access

#### Scenario: Preview file cleanup on startup
- **WHEN** the plugin initializes
- **THEN** it SHALL delete preview files in `<cache_root>/previews/` older than 30 minutes since last access

#### Scenario: Compressed assets are not affected
- **WHEN** TTL cleanup runs
- **THEN** files in `<cache_root>/assets/` SHALL NOT be deleted (host app manages these via `delete_asset`)
