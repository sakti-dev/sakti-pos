## Why

`tauri-plugin-image-pipeline` already owns compression and queueing, but the POS app still owns the image picker UX and staging path. That split makes the user flow harder to reason about, leaks platform-specific picker behavior into app code, and forces the app to manage temporary image handling instead of reacting to a plugin-owned lifecycle.

This change moves native image picking behind the plugin boundary on every platform, returns an immediate preview path from the picker result, and uses a plugin event to notify the host app when background compression completes so the app can persist the final asset in its own database.

## What Changes

- Add a public plugin picker API that opens the native image picker on desktop and Android and returns immediately with a `jobId`, preview path, preview MIME type, and initial job state.
- Add plugin completion and failure events (`image_pipeline://job_completed` and `image_pipeline://job_failed`) keyed by `jobId`.
- Keep completed-job recovery inside the plugin so the host app can recover missed notifications after a restart.
- Keep preview and asset paths as local cache paths that the host app converts with Tauri's asset/file protocol helpers.
- Remove app-owned picker and temp-file staging logic from `apps/pos-app` for image upload flows.
- Update the POS app image upload flow so it listens for plugin completion events and persists the final asset only after compression succeeds.
- **BREAKING**: The public plugin image flow changes from “app picks, app stages, plugin compresses” to “plugin picks, plugin stages, plugin compresses, app persists after event”.
- Update OpenSpec requirements in `assets`, `menu`, and `sync` to reflect plugin-owned picking and event-driven completion instead of the current app-owned picker/queue model.

## Capabilities

### New Capabilities
- `image-pipeline-picker`: Public cross-platform image picking, preview staging, asynchronous completion events, and completion recovery for `tauri-plugin-image-pipeline`.

### Modified Capabilities
- `assets`: Image upload state, preview handling, and plugin integration now rely on the plugin-owned picker and completion event instead of app-owned picker/staging logic.
- `menu`: Product image upload flow now delegates the picker to the plugin and persists images only after plugin completion.
- `sync`: Sync startup/manual sync no longer owns image-processing job execution; the plugin owns background compression and completion state.

## Impact

- `tauri-plugin-image-pipeline` gains the public picker command, event emission, and recovery surface for image selection.
- `apps/pos-app/src/lib/assets/*` and `apps/pos-app/src/components/image-upload.tsx` move from picker/staging ownership to event-driven plugin consumption.
- `apps/pos-app/src-tauri/src/android/photo_picker.rs` and related app-side picker helpers should be retired or reduced to compatibility wrappers during the cutover.
- The host app continues to use `convertFileSrc(...)` for preview and asset rendering, but it no longer generates the file selection workflow itself.
- OpenSpec requirements for asset upload, product image upload, and sync order must be updated so the implementation agent does not reintroduce app-owned picker logic.
