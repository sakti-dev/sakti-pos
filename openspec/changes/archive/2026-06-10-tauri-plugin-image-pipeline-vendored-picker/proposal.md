## Why

`tauri-plugin-image-pipeline` needs to own picker staging end to end, but the current dependency chain leaks Android URI handling through app-owned picker glue and external plugin behavior at runtime. That makes the public plugin harder to reason about, harder to test, and harder to keep stable for consumers.

The fix is not to keep a new runtime dependency chain. The fix is to reimplement the picker boundary inside `tauri-plugin-image-pipeline` itself, while keeping local upstream snapshots under `vendor/references/` as read-only guidance for the implementation agent. The reference trees are for learning only; production code stays inside the plugin crate.

## What Changes

- Implement the picker-facing logic directly inside `tauri-plugin-image-pipeline` so the plugin owns the public picker flow.
- Implement the Android URI staging helper inside `tauri-plugin-image-pipeline` so `content://` results are copied into plugin cache before preview generation or compression.
- Keep upstream source snapshots and notes in `tauri-plugin-image-pipeline/vendor/references/` for implementation guidance only; the references directory SHALL be excluded from the build.
- Remove runtime reliance on app-owned picker/Android-FS plumbing for image selection.
- Keep the public picker contract stable: immediate preview path, job ID, and later completion/failure events.
- Update build wiring, tests, and logs so the plugin crate is the only production owner of image picking and staging.

## Capabilities

### New Capabilities
- `image-pipeline-reference-guided-picker`: plugin-owned picker staging behavior, including cache-local preview paths, Android `content://` staging, and completion/failure events, implemented using local reference snapshots as guidance only.

### Modified Capabilities
- none

## Impact

- `tauri-plugin-image-pipeline` crate dependency graph and build wiring
- Android plugin source layout inside `tauri-plugin-image-pipeline`
- `vendor/references/` gitignored reference material for upstream dialog and Android-FS source
- Rust and Kotlin tests that exercise picker staging, preview generation, and event emission
- lockfiles, manifests, and Gradle wiring that currently assume app-owned picker/FS glue
