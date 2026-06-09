## MODIFIED Requirements

### Requirement: Image Picking
The system SHALL provide plugin-owned image picking through `tauri-plugin-image-pipeline` instead of an app-owned picker helper. The app SHALL call the plugin's `pick_image` command for both camera-like and gallery-like flows, and the plugin SHALL return an immediate preview path and `jobId` without requiring the app to stage a separate temporary file.

The returned preview path SHALL be a stable local path that the host app can render via `convertFileSrc()` or equivalent Tauri helpers.

#### Scenario: User picks an image from the product form
- **WHEN** the user selects a new image in the product image UI
- **THEN** the app SHALL call the plugin-owned `pick_image` command
- **AND THEN** it SHALL render the returned preview path immediately
- **AND THEN** it SHALL keep the job identifier so the UI can correlate later completion events

#### Scenario: User cancels selection
- **WHEN** the user cancels the native picker
- **THEN** the app SHALL not stage a temporary file
- **AND THEN** it SHALL not create a local processing job of its own

### Requirement: Image Processing
The system SHALL treat `tauri-plugin-image-pipeline` as the sole owner of image decode, EXIF correction, resize, preview generation, encode, and background completion behavior.

The app SHALL not decode, resize, or encode user images directly. It SHALL only consume the preview and completion metadata returned by the plugin, then persist the resulting asset into SQLite after the plugin signals success.

#### Scenario: Plugin returns a preview path before compression completes
- **WHEN** the plugin returns `previewPath` from `pick_image`
- **THEN** the app SHALL use the preview path for immediate UI rendering
- **AND THEN** it SHALL not wait for the final compressed asset before showing the selection

#### Scenario: Plugin emits a completion event
- **WHEN** the plugin emits `image_pipeline://job_completed`
- **THEN** the app SHALL treat the event payload as the source of truth for the final asset metadata
- **AND THEN** it SHALL persist the resulting asset only after the completion event has been handled

### Removed Requirement: Pending Asset Processing Jobs
**Reason**: The durable processing queue moved into `tauri-plugin-image-pipeline` and the app no longer owns a SQLite-backed `pending_asset_processing_jobs` table.

**Migration**: Replace app-owned enqueue/process/reset logic with plugin command invocation, plugin completion event handling, and plugin recovery APIs (`get_completed_jobs`, `consume_completed_job`, `get_failed_jobs`, `retry_failed_job`).

### Requirement: Image Upload State
The system SHALL provide a `createImageUpload(options)` factory that manages the plugin-owned pick-preview-complete lifecycle for product photos.

The state SHALL:
- expose a `pickImage(source)` method that calls the plugin picker
- store the returned `jobId`
- expose the preview URL using `convertFileSrc(previewPath)`
- expose a pending/completed readiness signal so the UI can gate persistence
- invoke an optional `onAssetReady(result)` callback when the active job completes
- clear local UI state without deleting plugin-owned cache files directly

The state SHALL NOT require a separate enqueue step after selection.

#### Scenario: Picker result is rendered immediately
- **WHEN** `pickImage(source)` returns from the plugin
- **THEN** the state SHALL expose the preview URL immediately
- **AND THEN** it SHALL mark the job as pending until completion is observed

#### Scenario: Background compression completes
- **WHEN** the plugin emits `image_pipeline://job_completed` for the active job
- **THEN** the state SHALL clear the pending flag
- **AND THEN** it SHALL call `onAssetReady(result)` if provided
- **AND THEN** it SHALL allow the caller to persist the asset-linked product state

#### Scenario: User clears a pending image
- **WHEN** `clear()` is called while a plugin job is pending
- **THEN** the state SHALL clear the UI preview and local job tracking
- **AND THEN** it SHALL not delete cache files directly itself
- **AND THEN** it MAY request plugin-side cancellation or cleanup if that capability is available

### Requirement: Asset Events
The system SHALL emit app-level asset cache and attachment events only after the app has persisted the plugin-completed asset in SQLite.

The frontend SHALL listen to `image_pipeline://job_completed` and `image_pipeline://job_failed` for plugin-level lifecycle notifications. After successful local persistence, the app SHALL continue to emit:
- `asset-cache-ready` with `{ asset_id }`
- `asset-attachment-ready` with `{ asset_id, entity_id, entity_type, field }`

#### Scenario: Local persistence completes after job completion
- **WHEN** the app persists the final asset row and attachment link after receiving `image_pipeline://job_completed`
- **THEN** it SHALL emit `asset-cache-ready`
- **AND THEN** it SHALL emit `asset-attachment-ready` for the linked entity

#### Scenario: Plugin job fails
- **WHEN** the plugin emits `image_pipeline://job_failed`
- **THEN** the app SHALL surface the error state in the image upload UI
- **AND THEN** it SHALL not emit app-level asset readiness events for that job

