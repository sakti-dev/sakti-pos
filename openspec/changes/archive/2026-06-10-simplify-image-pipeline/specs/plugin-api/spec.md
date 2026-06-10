## ADDED Requirements

### Requirement: Plugin public API — 4 commands

The plugin SHALL expose 4 public commands: `pick_image`, `compress_asset`, `get_asset_path`, `delete_asset`.

**WHEN** the plugin is initialized
**THEN** it SHALL register `pick_image`, `compress_asset`, `get_asset_path`, and `delete_asset` as Tauri commands. No other commands SHALL be exposed.

**WHEN** `pick_image` is called
**THEN** the plugin SHALL open the native file picker, stage the source file, generate a preview, and return `{ jobId, stagedSourcePath, previewPath, previewMimeType }`.

**WHEN** `compress_asset` is called with `{ jobId, stagedSourcePath, maxLongEdge, quality }`
**THEN** the plugin SHALL compress the staged source to WebP, write the compressed file to its cache, emit `image_pipeline://job_completed` with `{ jobId, contentHash, byteSize, width, height }`, and return `{ jobId }`.

**WHEN** `compress_asset` completes
**THEN** the plugin SHALL delete the staged source file and preview file.

#### Scenario: Compress asset succeeds
- **WHEN** the staged source file exists and is a valid image
- **THEN** the plugin returns `{ jobId }`, writes the compressed WebP to `<cache>/assets/<assetId>.webp`, and emits `image_pipeline://job_completed`

#### Scenario: Compress asset source not found
- **WHEN** the staged source file does not exist
- **THEN** the plugin SHALL return a `SourceNotFound` error with the missing path

#### Scenario: Compress asset for recovery
- **WHEN** `compress_asset` is called for a previously failed/stuck job
- **THEN** the plugin SHALL compress normally, emit the event, and the JS lifecycle listener handles it identically to a fresh compress

### Requirement: Smart asset path resolution

The plugin SHALL provide a `get_asset_path(assetId, jobId?)` command that resolves the best available file for an asset.

**WHEN** `get_asset_path(assetId, jobId?)` is called
**THEN** the plugin SHALL:
1. Check if a compressed file exists at `<cache>/assets/<assetId>.webp`
2. If yes, return `{ localPath, contentType: "image/webp" }`
3. If no compressed file and `jobId` is provided, check if a preview file exists at `<cache>/previews/<jobId_prefix>_preview.jpg`
4. If yes, return `{ localPath, contentType: "image/jpeg" }`
5. If neither, return `null`

#### Scenario: Asset is compressed
- **WHEN** the compressed WebP file exists on disk
- **THEN** `get_asset_path` returns the compressed file path

#### Scenario: Asset is pending (no compressed file)
- **WHEN** no compressed file exists but a preview exists from the pick step
- **THEN** `get_asset_path` returns the preview file path

#### Scenario: Asset has no files
- **WHEN** neither compressed nor preview files exist
- **THEN** `get_asset_path` returns `null`

### Requirement: Flat cache layout — no app domain scoping

The plugin SHALL store all cached files using only the asset ID or job ID. No merchant ID, tenant ID, or other app-specific scoping SHALL appear in the cache directory structure.

**WHEN** a compressed file is written
**THEN** it SHALL be stored at `<cache_root>/assets/<assetId>.webp`.

**WHEN** a preview is written
**THEN** it SHALL be stored at `<cache_root>/previews/<jobId_prefix>_preview.jpg`.

**WHEN** a source is staged
**THEN** it SHALL be stored at `<cache_root>/picked/<jobId>.source`.

### Requirement: Asset deleted event

The plugin SHALL provide a `delete_asset(assetPath)` command for idempotent file deletion.

**WHEN** `delete_asset` is called with a path
**THEN** the plugin SHALL delete the file if it exists, or succeed silently if it doesn't.

#### Scenario: Delete existing asset
- **WHEN** the file at the given path exists
- **THEN** the plugin deletes it and returns success

#### Scenario: Delete non-existent asset
- **WHEN** the file at the given path does not exist
- **THEN** the plugin returns success (idempotent)
