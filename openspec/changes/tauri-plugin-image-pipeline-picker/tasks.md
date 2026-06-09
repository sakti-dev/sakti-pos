## 1. Red Tests First

- [x] 1.1 Add failing Rust tests for the public `pick_image` contract, including immediate preview metadata, `jobId` correlation, `image_pipeline://job_completed`, `image_pipeline://job_failed`, and completed-job recovery after restart.
- [x] 1.2 Add failing Vitest tests for `createImageUpload` so it must render the returned preview immediately, retain the `jobId`, wait for `image_pipeline://job_completed`, call `onAssetReady`, and no longer rely on a separate `enqueueFor` step.
- [x] 1.3 Add failing Kotlin unit tests for the Android plugin backend so native picker results, preview staging, background compression, and main-thread avoidance are all covered before implementation.
- [x] 1.4 Run the new focused tests and confirm they fail for the missing behavior before writing implementation code.

## 2. Plugin API and Desktop Picker

- [x] 2.1 Add or update shared DTOs, guest JS wrappers, and Rust command handlers for `pick_image`, `job_completed`, `job_failed`, and the recovery APIs (`get_completed_jobs`, `consume_completed_job`, `get_failed_jobs`, `retry_failed_job`).
- [x] 2.2 Implement the desktop picker path by composing the existing native-dialog pattern behind `tauri-plugin-image-pipeline`, keeping the Rust API thin and returning a staged preview path immediately.
- [x] 2.3 Ensure the plugin writes preview and final asset files into stable cache paths that the host app can render via `convertFileSrc()`.
- [x] 2.4 Emit the completion and failure events from the plugin only after the job state has been durably updated, and keep completed jobs queryable until consumed.

## 3. Android Picker and Compression Bridge

- [x] 3.1 Implement the Android picker backend inside the plugin-owned Kotlin module, following the existing Tauri mobile plugin pattern rather than app-owned picker helpers.
- [x] 3.2 Keep Android decode, EXIF correction, resize, preview generation, and encode work off the main thread, with explicit failure paths for decode or encode problems.
- [x] 3.3 Bridge Android completion and failure results back to Rust so the plugin can emit `image_pipeline://job_completed` and `image_pipeline://job_failed`.
- [x] 3.4 Add or update Android-side tests so the backend proves it stages preview files, returns stable paths, and uses the platform compressor path.

## 4. POS App Integration

- [x] 4.1 Replace the app-owned `pickProductPhoto` path with the plugin `pick_image` command inside `createImageUpload`, and stop staging separate temp picker files in app code.
- [x] 4.2 Update `createImageUpload` so it tracks `jobId`, shows the preview immediately, exposes a pending/completed readiness signal, and invokes `onAssetReady` when the matching plugin completion event arrives.
- [x] 4.3 Update the product form so save/persist is gated on the plugin completion event rather than on an app-owned background enqueue step.
- [x] 4.4 Remove or retire the old app-owned picker/enqueue helpers (`apps/pos-app/src-tauri/src/android/photo_picker.rs`, `apps/pos-app/src/lib/assets/picking.ts`, `apps/pos-app/src/lib/assets/processing.ts`, and any callers that only exist for the old flow).
- [x] 4.5 Keep the existing app-level asset cache and attachment events, but emit them only after the plugin-completed asset has been persisted locally.

## 5. Logging, Verification, and Cleanup

- [x] 5.1 Update `logs/capture-adb-logcat.sh` and the logging docs so the new image-pipeline event names and prefixes are captured in future Android traces.
- [x] 5.2 Run the focused release-gate tests for Rust, Vitest, Kotlin, and the Android host app boot path, and fix any failures before declaring the change done.
- [x] 5.3 Validate the updated OpenSpec change with the repo's OpenSpec validation command and keep the change artifacts consistent with the implementation.
