## 1. Contract First

- [ ] 1.1 Add Rust contract tests for picker request/response serialization, job event names, and content-URI selection semantics.
- [ ] 1.2 Add Kotlin/JVM tests for Android URI staging helpers, including happy path, missing stream, and invalid output path cases.
- [ ] 1.3 Add an integration test that proves the plugin returns a cache-local preview path rather than a raw `content://` URI.
- [ ] 1.4 Add a failure-path test that proves the host app receives `image_pipeline://job_failed` when staging cannot open the selected URI.

## 2. Vendor the Dependency Surface

- [ ] 2.1 Add `tauri-plugin-image-pipeline/vendor/tauri-plugin-dialog/` as the vendored picker source tree and wire the plugin crate to use it by path.
- [ ] 2.2 Add `tauri-plugin-image-pipeline/vendor/android-uri-cache/` as the minimal Android URI staging helper and wire the Android source set to use it.
- [ ] 2.3 Add `tauri-plugin-image-pipeline/vendor/references/` for upstream snapshots from `tauri-plugin-dialog` and `tauri-plugin-android-fs`, and ensure it is excluded from the build.
- [ ] 2.4 Remove direct runtime picker/FS dependency wiring from the app path where it is only used for image selection.

## 3. Implement the Vendored Picker Flow

- [ ] 3.1 Move native picker entrypoints into the vendored dialog code so the plugin owns the entire user gesture from command invocation to selection result.
- [ ] 3.2 Stage Android `content://` selections into plugin cache before preview generation or compression continues.
- [ ] 3.3 Keep desktop picker selections cache-local and stage them through the same plugin-owned staging path.
- [ ] 3.4 Preserve the public `pick_image` response shape: `jobId`, `previewPath`, `previewMimeType`, and `status`.
- [ ] 3.5 Emit `image_pipeline://job_completed` and `image_pipeline://job_failed` with job-correlated payloads that the host app can consume.

## 4. Verify and Document

- [ ] 4.1 Run focused Rust tests for the vendored picker path and fix any regressions in path handling or serialization.
- [ ] 4.2 Run focused Android compile and JVM tests for the vendored URI staging helper and picker bridge.
- [ ] 4.3 Update `logs/capture-adb-logcat.sh` and `docs/DOCUMENTED-LOG-PREFIX.md` for any new picker/staging log prefixes needed during investigation.
- [ ] 4.4 Verify the host app can pick an image, render the preview, and receive the completion event on Android.
- [ ] 4.5 Confirm `vendor/references/` stays out of the build graph and only serves as implementation guidance for future refreshes.
