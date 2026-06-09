## ADDED Requirements

### Requirement: Merchant-scoped content-addressed storage
The plugin SHALL store each processed asset under the Tauri application cache directory using its merchant ID, output hash, and encoded format.

#### Scenario: Write a processed WebP asset
- **WHEN** a WebP result is written for a merchant
- **THEN** the plugin stores it at `<app-cache>/sakti-image/<merchant_id>/assets/<asset_id>.webp` and creates missing parent directories

#### Scenario: Reject unsafe cache identifiers
- **WHEN** a merchant ID or asset ID contains an absolute path, parent traversal, or path separator
- **THEN** the plugin rejects the operation without reading or writing outside its cache root

### Requirement: Atomic cache writes
The plugin SHALL prevent partial cache files from replacing valid content.

#### Scenario: Complete an asset write
- **WHEN** the plugin writes processed bytes
- **THEN** it writes and flushes a same-directory temporary file before atomically renaming it to the final path

#### Scenario: Fail before the final rename
- **WHEN** writing or flushing the temporary file fails
- **THEN** any existing final cache file remains unchanged

### Requirement: Merchant-qualified cache resolution
The plugin SHALL resolve cached assets using both merchant ID and asset ID without scanning other merchant directories.

#### Scenario: Resolve an existing asset
- **WHEN** `get_cached_asset_path` receives a valid merchant ID and asset ID whose file exists
- **THEN** it returns the absolute path and declared content type

#### Scenario: Resolve a missing asset
- **WHEN** the merchant-qualified asset file does not exist
- **THEN** it returns `null`

### Requirement: Preview storage
The plugin SHALL store pending previews at `<app-cache>/sakti-image/previews/<job_id>.jpg`.

#### Scenario: Store a generated preview
- **WHEN** enqueue preview generation succeeds
- **THEN** the preview is written atomically and its path is recorded in the JSON job

#### Scenario: Consume a completed job
- **WHEN** a completed job is successfully consumed
- **THEN** the plugin attempts to delete its source and preview files and logs cleanup failures

### Requirement: Pending preview lookup
The plugin SHALL support pending preview lookup by opaque attachment target metadata.

#### Scenario: Resolve the newest active preview
- **WHEN** the app requests a preview for an entity type, entity ID, and attachment field
- **THEN** the plugin returns the newest existing preview for a matching `pending` or `processing` job

#### Scenario: No active preview exists
- **WHEN** no matching active job has an existing preview file
- **THEN** the plugin returns `null`

### Requirement: Safe orphan cleanup
The plugin SHALL delete only unreferenced source and preview files under its configured temporary roots.

#### Scenario: Remove an unreferenced temp file
- **WHEN** cleanup runs with a valid queue and a temp file is not referenced by any persisted job
- **THEN** the plugin deletes the file and includes it in the deleted count

#### Scenario: Preserve a referenced temp file
- **WHEN** a source or preview path is referenced by a pending, processing, completed, or failed job
- **THEN** cleanup preserves the file

#### Scenario: Queue recovery failed
- **WHEN** the queue cannot be loaded or recovered
- **THEN** cleanup returns an error and deletes no files

#### Scenario: Temporary root does not exist
- **WHEN** a configured temporary root does not exist
- **THEN** cleanup returns zero deletions for that root without failing
