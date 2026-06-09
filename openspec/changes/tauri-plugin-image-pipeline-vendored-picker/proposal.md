## Why

`tauri-plugin-image-pipeline` needs to own picker staging end to end, but the current dependency chain leaks Android URI handling through external picker and FS plugins. That makes the public plugin harder to reason about, harder to test, and harder to keep stable for consumers. Vendoring the picker-facing code and the tiny Android URI helper inside the plugin crate keeps the build self-contained and removes a class of URI/path boundary bugs.

## What Changes

- Vendor the picker-facing implementation into `tauri-plugin-image-pipeline/vendor/` so the plugin owns the public picker flow.
- Vendor a minimal Android URI staging helper into `tauri-plugin-image-pipeline/vendor/` so `content://` results are copied into plugin cache before preview generation or compression.
- Keep upstream source snapshots and notes in `tauri-plugin-image-pipeline/vendor/references/` for implementation guidance only; the references directory SHALL be excluded from the build.
- Remove runtime reliance on app-owned picker/Android-FS plumbing for image selection.
- Keep the public picker contract stable: immediate preview path, job ID, and later completion/failure events.
- Update build wiring, tests, and logs so the plugin crate is the only production owner of image picking and staging.

## Capabilities

### New Capabilities
- `image-pipeline-vendored-picker`: plugin-owned picker staging behavior, including cache-local preview paths, Android `content://` staging, and completion/failure events.

### Modified Capabilities
- none

## Impact

- `tauri-plugin-image-pipeline` crate dependency graph and build wiring
- Android plugin source layout inside `tauri-plugin-image-pipeline`
- vendored source tree under `tauri-plugin-image-pipeline/vendor/`
- `vendor/references/` gitignored reference material for upstream dialog and Android-FS source
- Rust and Kotlin tests that exercise picker staging, preview generation, and event emission
- lockfiles and manifests that currently point at external picker/FS crates
