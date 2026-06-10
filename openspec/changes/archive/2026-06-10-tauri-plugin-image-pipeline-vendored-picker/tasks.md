## 1. Reference-First Contract

- [x] 1.1 Add Rust contract tests for picker request/response serialization, job event names, and cache-local preview path semantics.
- [x] 1.2 Add Kotlin/JVM tests for Android URI staging helpers, including happy path, missing stream, permission failure, and invalid output path cases.
- [x] 1.3 Add an integration test that proves the plugin returns a cache-local preview path rather than a raw `content://` URI.
- [x] 1.4 Add a failure-path test that proves the host app receives `image_pipeline://job_failed` when staging cannot open the selected URI.

## 2. Production Code Lives in the Plugin Crate

- [x] 2.1 Add `vendor/references/` and keep it gitignored so upstream snapshots from `tauri-plugin-dialog` and `tauri-plugin-android-fs` can be used as implementation guidance.
- [x] 2.2 Add picker entrypoints directly inside `tauri-plugin-image-pipeline` source, with the public `pick_image` command staying unchanged.
- [x] 2.3 Add Android staging helpers inside the plugin crate so `content://` results are copied into plugin cache before preview generation or compression continues.
- [x] 2.4 Wire the plugin-owned Android source set into the app build so the plugin implementation is compiled from the plugin crate path, not from the reference snapshots.
- [x] 2.5 Remove app-facing direct picker/FS glue where it only exists to bridge image selection.

## 3. Reference-Aligned Picker Behavior

- [x] 3.1 Mirror the upstream dialog picker semantics for desktop selection and file access mode handling, using the local reference snapshots as the implementation guide.
- [x] 3.2 Mirror the upstream Android FS picker semantics for Android intent selection, chooser fallback, and visual media handling.
- [x] 3.3 Stage desktop selections and Android `content://` selections into plugin cache before preview generation or compression continues.
- [x] 3.4 Preserve the public `pick_image` response shape: `jobId`, `previewPath`, `previewMimeType`, and `status`.
- [x] 3.5 Emit `image_pipeline://job_completed` and `image_pipeline://job_failed` with job-correlated payloads that the host app can consume.

## 4. Verify and Document

- [x] 4.1 Run focused Rust tests for the picker path and fix any regressions in path handling or serialization.
- [x] 4.2 Run focused Android compile and JVM tests for the Android staging helper and picker bridge.
- [x] 4.3 Update `logs/capture-adb-logcat.sh` and `docs/DOCUMENTED-LOG-PREFIX.md` for any new picker/staging log prefixes needed during investigation.
- [ ] 4.4 Verify the host app can pick an image, render the preview, and receive the completion event on Android.
- [x] 4.5 Confirm `vendor/references/` stays out of the build graph and only serves as implementation guidance for future refreshes.
