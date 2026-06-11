## ADDED Requirements

### Requirement: Plugin-owned picker staging
The image pipeline plugin SHALL own the native image picker flow and SHALL stage any selected image into plugin-owned cache storage before returning the selection to the caller.

#### Scenario: Desktop selection is staged before use
- **WHEN** the user selects an image on desktop
- **THEN** the plugin SHALL copy the selected file into plugin cache and return a cache-local path

#### Scenario: Android selection is staged before use
- **WHEN** the user selects an image on Android and the picker returns a `content://` URI
- **THEN** the plugin SHALL copy the URI content into plugin cache before preview generation or compression continues

### Requirement: Cache-local preview paths
The image pipeline plugin SHALL return preview paths that are valid local file paths within the plugin cache so the host app can render them via the asset protocol or `convertFileSrc()`.

#### Scenario: Preview path can be rendered by the host app
- **WHEN** the plugin returns a preview path
- **THEN** the path SHALL point to a cache-local file that the host app can turn into a display URL without additional URI translation

#### Scenario: Preview path survives across plugin boundaries
- **WHEN** the host app receives the picker result
- **THEN** the host app SHALL be able to use the preview path without depending on the Android picker callback context

### Requirement: Stable public picker contract
The image pipeline plugin SHALL return a stable public contract consisting of `jobId`, `previewPath`, `previewMimeType`, and `status` immediately after picker completion, and SHALL emit `image_pipeline://job_completed` and `image_pipeline://job_failed` events for background processing outcomes.

#### Scenario: Picker returns immediately with preview metadata
- **WHEN** the picker completes successfully
- **THEN** the plugin SHALL return `jobId`, `previewPath`, `previewMimeType`, and `status` without waiting for compression to finish

#### Scenario: Completion event carries final asset metadata
- **WHEN** background compression succeeds
- **THEN** the plugin SHALL emit `image_pipeline://job_completed` with the final asset metadata needed by the host app to persist the asset

#### Scenario: Failure event can be consumed by the host app
- **WHEN** background compression or staging fails
- **THEN** the plugin SHALL emit `image_pipeline://job_failed` with the job ID and error details

### Requirement: Reference snapshots are guidance only
The image pipeline plugin SHALL keep upstream source snapshots under `tauri-plugin-image-pipeline/vendor/references/` as implementation guidance only, and SHALL NOT compile code from that directory.

#### Scenario: Build ignores reference snapshots
- **WHEN** the plugin crate is built
- **THEN** Cargo and Gradle SHALL resolve picker/staging implementation from the plugin crate source tree, not from `vendor/references/`

#### Scenario: Reference snapshots do not affect runtime
- **WHEN** the repository contains upstream reference snapshots under `vendor/references/`
- **THEN** the build SHALL ignore them and SHALL not compile or package code from that directory

### Requirement: Production picker code lives in the plugin crate
The image pipeline plugin SHALL implement its picker boundary and Android URI staging behavior inside the plugin crate source tree, using the reference snapshots only to mirror upstream semantics.

#### Scenario: Picker behavior is owned by the plugin crate
- **WHEN** the host app invokes the public picker command
- **THEN** the plugin SHALL own the picker entrypoint, stage the selected file or URI into plugin cache, and return a cache-local preview path without delegating ownership back to the app

#### Scenario: Android staging happens before preview generation
- **WHEN** the Android picker returns a `content://` URI
- **THEN** the plugin SHALL copy the URI into plugin cache before preview generation or compression continues
