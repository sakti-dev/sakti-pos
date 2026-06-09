## ADDED Requirements

### Requirement: Image processor contract
The plugin SHALL provide an image processor abstraction that accepts source bytes, source metadata, and a maximum long edge and returns encoded bytes, content type, width, and height.

#### Scenario: Process a supported source image
- **WHEN** the processor receives a supported source image
- **THEN** it applies EXIF orientation, preserves aspect ratio, limits the longest edge to the requested size, and returns the final encoded bytes and metadata

#### Scenario: Reject an unsupported or corrupt source
- **WHEN** the processor cannot decode the source bytes
- **THEN** it returns a descriptive processing error without producing a cached asset

### Requirement: Pure Rust processor
The plugin SHALL provide a non-Android processor using the Rust `image`, `zenwebp`, and `exif` crates.

#### Scenario: Encode a desktop image
- **WHEN** the Rust processor processes an image
- **THEN** it applies all eight standard EXIF orientations, resizes with the documented filter, and encodes lossy WebP at quality 75 and method 6

#### Scenario: Generate a desktop preview
- **WHEN** the Rust processor generates a preview
- **THEN** it returns a JPEG at quality 75 whose longest edge does not exceed the requested preview size

#### Scenario: Run CPU-bound Rust processing
- **WHEN** an async plugin command uses the Rust processor
- **THEN** decode, resize, and encode work runs through a blocking worker instead of blocking the async runtime executor

### Requirement: Android native processor
The plugin SHALL provide an Android processor that delegates image work to a Kotlin Tauri mobile plugin.

#### Scenario: Process on Android API 30 or newer
- **WHEN** an image is processed on Android API level 30 or newer
- **THEN** Kotlin decodes with `BitmapFactory`, applies EXIF orientation, resizes while preserving aspect ratio, and encodes with `Bitmap.CompressFormat.WEBP_LOSSY` at quality 75

#### Scenario: Process on Android API 24 through 29
- **WHEN** an image is processed on Android API level 24 through 29
- **THEN** Kotlin uses the legacy `Bitmap.CompressFormat.WEBP` at quality 75 and returns `content_type = "image/webp"`

#### Scenario: Avoid blocking the Android main thread
- **WHEN** Kotlin performs decode, resize, preview, or encode work
- **THEN** it executes the work on `Dispatchers.Default` or `Dispatchers.IO` and resolves the Tauri invocation after the background work finishes

#### Scenario: Android WebP encoding fails
- **WHEN** the Android encoder cannot produce WebP output
- **THEN** the processor returns a processing error and does not silently substitute another asset format

### Requirement: Target-specific processor selection
The plugin SHALL select the Rust processor for non-Android targets and the Kotlin-backed processor for Android targets at compile time.

#### Scenario: Build a non-Android target
- **WHEN** the plugin is compiled for a non-Android target
- **THEN** the Rust codec dependencies and `DefaultProcessor` are included

#### Scenario: Build an Android target
- **WHEN** the plugin is compiled for Android
- **THEN** `AndroidProcessor` is included and the Rust `image`, `zenwebp`, and `exif` codec dependencies are excluded

### Requirement: Output-derived content identity
The plugin SHALL compute the asset ID and content hash as the lowercase SHA-256 hex digest of the actual final encoded bytes.

#### Scenario: Hash a processed output
- **WHEN** processing succeeds
- **THEN** `asset_id` and `content_hash` equal the SHA-256 digest of the bytes written to the cache

#### Scenario: Compare different processor backends
- **WHEN** the Rust and Android processors encode the same source image
- **THEN** both outputs satisfy the orientation, dimension, and content-type contract, but their encoded bytes and hashes MAY differ

### Requirement: Preview processing
The plugin SHALL generate JPEG previews separately from final processed assets.

#### Scenario: Generate a preview
- **WHEN** a job is enqueued with a preview maximum edge
- **THEN** the selected processor produces a JPEG preview at quality 75 with corrected orientation and the requested maximum edge
