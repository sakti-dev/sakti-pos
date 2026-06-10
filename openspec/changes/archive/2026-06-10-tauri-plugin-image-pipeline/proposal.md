## Why

The POS app's image processing pipeline mixes reusable file processing with Sakti POS business persistence. Decode, EXIF correction, resizing, encoding, content-addressed caching, previews, and processing retries currently live beside attachment linking, SQLite asset metadata, and sync outbox writes. This makes the pipeline difficult to isolate and causes Android builds to include Rust image codecs despite equivalent Android platform APIs.

Extracting the generic pipeline into a standalone Tauri plugin gives the processing work one durable owner, permits Android-native processing, and leaves Sakti POS responsible only for its business data and sync integration.

## What Changes

- Add `tauri-plugin-image-pipeline`, which owns image processing, preview generation, content-addressed files, and the sole durable processing queue at `<app-cache>/sakti-image/jobs.json`.
- Store all information needed for restart reconciliation in each JSON job, including merchant, processing kind, and attachment target metadata.
- Process images with a pure-Rust desktop/test implementation and an Android-native Kotlin implementation selected by target-specific compilation.
- Treat the hash of the actual encoded output as the asset ID. Different processor implementations may produce different valid encoded bytes and therefore different hashes.
- Persist completed plugin results into the POS SQLite database using an idempotent transaction that updates the asset, local cache, attachment target, and sync outbox before consuming the JSON job.
- Remove `pending_asset_processing_jobs` from the POS local schema and runtime. No second durable processing queue remains.
- Preserve completed JSON jobs across restarts until the app confirms consumption. Quarantine corrupt queue files instead of silently treating them as an empty queue.
- Add Tauri plugin permissions, guest JS bindings, structured logs, Android background execution, retry limits, and focused verification coverage.

## Capabilities

### New Capabilities

- `image-processing`: Platform-aware decode, EXIF correction, resize, encode, preview generation, and output hashing.
- `image-cache`: Merchant-scoped content-addressed storage, preview storage, safe resolution, atomic writes, and orphan cleanup.
- `image-job-queue`: JSON-only durable processing queue with attachment metadata, bounded retries, crash recovery, reconciliation, and consume-after-persist semantics.

### Modified Capabilities

- `assets`: Delegate generic processing and file-cache operations to the plugin, remove the SQLite processing queue, and retain Sakti POS business persistence, attachment linking, sync outbox writes, upload, hydration, and frontend events.

## Impact

- New standalone crate and guest JS package under `tauri-plugin-image-pipeline/`, including Android Kotlin sources and Tauri permission definitions.
- POS Rust asset modules become plugin integration and transactional persistence code; generic processor, cache, queue, and temp cleanup logic moves to the plugin.
- `pending_asset_processing_jobs` is removed from the Drizzle local schema and future generated migrations. Existing installations receive a migration that drops the obsolete table after the cutover.
- Android builds no longer include the Rust `image`, `zenwebp`, and `exif` processing dependencies. Desktop and plugin tests retain the Rust processor dependencies.
- The app capability configuration grants the plugin's required commands and event-listening permissions.
- Asset IDs remain SHA-256 hashes of actual processed bytes, but identical source images processed by different backends are not required to share an asset ID.
