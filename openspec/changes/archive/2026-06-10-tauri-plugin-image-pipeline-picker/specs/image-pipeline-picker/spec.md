## ADDED Requirements

### Requirement: Public image picker command
The system SHALL provide a public `pick_image` Tauri command through `tauri-plugin-image-pipeline` that opens the native picker on each supported platform, stages the selected image in the plugin cache, and returns immediately with a job identifier and preview metadata.

The command SHALL accept a picker mode and compression settings sufficient to describe the requested image output. The command SHALL return a response containing:
- `jobId`
- `previewPath`
- `previewMimeType`
- current job `status`

The returned `previewPath` SHALL point to a stable local file path that the host app can render with Tauri's file/asset protocol helpers.

#### Scenario: Desktop picker returns a staged preview
- **WHEN** the host app calls `pick_image` on desktop with a valid picker mode and compression settings
- **THEN** the plugin SHALL open the native desktop file picker
- **AND THEN** it SHALL copy or stage the selected image into the plugin cache
- **AND THEN** it SHALL return `jobId`, `previewPath`, `previewMimeType`, and a non-terminal job status without waiting for compression to complete

#### Scenario: Android picker returns a staged preview
- **WHEN** the host app calls `pick_image` on Android with a valid picker mode and compression settings
- **THEN** the plugin SHALL use the Android native picker implementation behind the plugin boundary
- **AND THEN** it SHALL stage the selected image in the plugin cache
- **AND THEN** it SHALL return `jobId`, `previewPath`, `previewMimeType`, and a non-terminal job status without waiting for compression to complete

#### Scenario: User cancels selection
- **WHEN** the user cancels the native picker
- **THEN** the plugin SHALL not create a new job
- **AND THEN** it SHALL reject the command with a cancel-style error
- **AND THEN** it SHALL not emit a completion event

### Requirement: Completion and failure events
The system SHALL emit Tauri events when background compression finishes or fails.

The success event SHALL be named `image_pipeline://job_completed` and the failure event SHALL be named `image_pipeline://job_failed`.

The completion event payload SHALL include:
- `jobId`
- `assetPath`
- `contentHash`
- `contentType`
- `byteSize`
- `width`
- `height`
- `originalFilename`

The failure event payload SHALL include:
- `jobId`
- a stable error message
- the terminal job status

#### Scenario: Successful background compression emits completion
- **WHEN** the plugin finishes compressing a selected image
- **THEN** it SHALL emit `image_pipeline://job_completed`
- **AND THEN** the payload SHALL contain the final asset path and encoded-file metadata for persistence

#### Scenario: Failed background compression emits failure
- **WHEN** the plugin cannot decode, resize, encode, or write the compressed image
- **THEN** it SHALL emit `image_pipeline://job_failed`
- **AND THEN** the payload SHALL include the job identifier and a stable failure message

### Requirement: Local cache paths remain usable by the host app
The system SHALL store preview and final asset files in the plugin's app-cache-backed storage so the host app can render them with `convertFileSrc()` or equivalent Tauri asset helpers.

The system SHALL NOT require the host app to know about content URIs or temporary picker callback objects.

#### Scenario: Host app renders preview immediately
- **WHEN** the host app receives `previewPath` from `pick_image`
- **THEN** it SHALL be able to convert that path into a displayable URL using Tauri's asset/file protocol helpers

#### Scenario: Host app renders final asset after completion
- **WHEN** the host app receives `assetPath` from `image_pipeline://job_completed`
- **THEN** it SHALL be able to convert that path into a displayable URL using Tauri's asset/file protocol helpers

### Requirement: Job recovery remains queryable until consumed
The system SHALL keep completed and failed jobs queryable until the host app explicitly consumes or retries them.

The plugin SHALL provide recovery APIs for:
- reading completed jobs
- consuming completed jobs after the host app persists them
- reading failed jobs
- retrying failed jobs that are still eligible for retry

#### Scenario: Completed jobs survive a restart
- **WHEN** the host app restarts after the plugin emitted `image_pipeline://job_completed` but before consumption occurred
- **THEN** the completed job SHALL still be returned by the plugin's recovery API
- **AND THEN** the host app SHALL be able to consume it after replaying its event handling logic

#### Scenario: Consumed jobs disappear from recovery
- **WHEN** the host app calls the consume API for a completed job after it has persisted the final asset
- **THEN** the plugin SHALL remove that completed job from recovery results

