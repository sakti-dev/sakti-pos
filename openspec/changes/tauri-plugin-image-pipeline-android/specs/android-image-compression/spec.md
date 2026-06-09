## ADDED Requirements

### Requirement: Plugin-owned Android image compression
The system SHALL route all Android image compression through `tauri-plugin-image-pipeline` and SHALL NOT require the POS app to perform compression itself.

#### Scenario: POS app requests compression
- **WHEN** the POS app enqueues an image for processing on Android
- **THEN** the app passes the source file and attachment metadata to `tauri-plugin-image-pipeline`
- **AND THEN** the app does not decode, resize, or encode the image in app-owned code

#### Scenario: Frontend requests a preview
- **WHEN** the frontend requests a pending preview for an Android asset target
- **THEN** the preview is resolved through the plugin-owned pipeline
- **AND THEN** the frontend does not call any local compression helper directly

### Requirement: Android platform compressor
The plugin SHALL use a Kotlin Android compressor for image decode, resize, EXIF correction, and encoding when the target platform is Android.

#### Scenario: Process an image on Android
- **WHEN** the plugin processes an image on Android
- **THEN** the Kotlin implementation decodes the image with Android platform APIs
- **AND THEN** it applies EXIF orientation correction
- **AND THEN** it preserves aspect ratio while limiting the longest edge to the requested size

#### Scenario: Generate a preview on Android
- **WHEN** the plugin generates a preview on Android
- **THEN** the Kotlin implementation produces a resized JPEG preview through the same Android compressor path
- **AND THEN** it uses the configured quality level of 75
- **AND THEN** it returns a preview image compatible with the existing plugin response contract

### Requirement: Android WebP encoding
The Android compressor SHALL encode final processed assets as WebP and SHALL select the platform format that is supported by the running API level.

#### Scenario: Run on Android API 30 or newer
- **WHEN** the plugin processes an image on Android API level 30 or newer
- **THEN** the Kotlin compressor encodes the output with `Bitmap.CompressFormat.WEBP_LOSSY`
- **AND THEN** it uses the configured quality level of 75

#### Scenario: Run on Android API 24 through 29
- **WHEN** the plugin processes an image on Android API level 24 through 29
- **THEN** the Kotlin compressor encodes the output with the legacy `Bitmap.CompressFormat.WEBP`
- **AND THEN** it uses the configured quality level of 75

#### Scenario: Return the processed content type
- **WHEN** Android compression succeeds
- **THEN** the plugin returns `content_type = "image/webp"` for the final asset

### Requirement: Android processing must not block the main thread
The plugin SHALL run Android decode, resize, preview generation, and encode work off the main thread.

#### Scenario: Compress a large image on Android
- **WHEN** a large image is processed through the Android compressor
- **THEN** the work executes on a background dispatcher such as `Dispatchers.IO` or `Dispatchers.Default`
- **AND THEN** the Tauri invocation resolves only after the background work finishes

#### Scenario: Reject main-thread execution
- **WHEN** the Android compressor is invoked from the main thread path
- **THEN** the implementation still dispatches the CPU-bound work off the main thread before decoding or encoding

### Requirement: Android processing failures are explicit
The plugin SHALL return a descriptive processing error when Android compression fails and SHALL NOT silently substitute another output format.

#### Scenario: Decode fails
- **WHEN** the Android compressor cannot decode the source bytes
- **THEN** it returns a processing error
- **AND THEN** it does not write a cache file for the failed job

#### Scenario: Encode fails
- **WHEN** the Android encoder cannot produce WebP output
- **THEN** the plugin returns a processing error
- **AND THEN** it does not fall back to JPEG, PNG, or any other output format

### Requirement: Android output identity is derived from the final bytes
The plugin SHALL compute the asset identifier and content hash from the actual encoded bytes produced by the Android compressor.

#### Scenario: Hash a successful Android output
- **WHEN** Android compression succeeds
- **THEN** the resulting asset identifier and content hash equal the lowercase SHA-256 hex digest of the exact bytes written to the cache

#### Scenario: Compare two successful outputs
- **WHEN** two Android compression runs produce byte-different outputs from the same source
- **THEN** each job still reports a hash derived from its own final bytes

### Requirement: Android compressor selects the platform implementation
The plugin SHALL use the Android Kotlin compressor only when the target build and runtime are Android.

#### Scenario: Build a non-Android target
- **WHEN** the plugin is compiled for a non-Android target
- **THEN** the Android Kotlin compressor is excluded from the build

#### Scenario: Build an Android target
- **WHEN** the plugin is compiled for Android
- **THEN** the Android Kotlin compressor is available to the plugin runtime
