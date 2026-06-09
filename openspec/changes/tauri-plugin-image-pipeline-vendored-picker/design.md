## Context

`tauri-plugin-image-pipeline` already owns the public image-pipeline contract, but the picker boundary has proven too fragile when it depends on app-owned Android file helpers or external plugin behavior at runtime. The failure mode is consistent: Android file pickers return `content://` URIs, and any extra hop that tries to reinterpret those URIs as local paths can fail in a way that looks like user cancellation or a generic processing error.

This change makes the image pipeline self-contained. The plugin itself remains the public API surface; picker-related code and the small Android URI staging behavior live under `tauri-plugin-image-pipeline/vendor/` so the build no longer relies on the app for picker plumbing. Upstream source snapshots from `tauri-plugin-dialog` and `tauri-plugin-android-fs` may be stored under `vendor/references/` as gitignored reference material for implementation guidance, but those references are not part of the compiled build.

## Goals / Non-Goals

**Goals:**
- Keep the public plugin API stable while moving picker and staging ownership fully into `tauri-plugin-image-pipeline`.
- Make the build self-contained by vendoring the small picker-facing dependency surface inside the plugin crate.
- Treat Android `content://` URIs as first-class picker results by copying them into plugin cache before preview generation or compression.
- Preserve cache-local preview paths and completion/failure events so the host app can remain generic.
- Provide a TDD-friendly structure so the implementation agent can write tests before code and verify the result at each step.

**Non-Goals:**
- Redesigning the asset persistence model or the sync pipeline.
- Adding a custom in-app gallery UI.
- Expanding the vendored Android file helper into the full `tauri-plugin-android-fs` surface area.
- Changing the host app's business logic beyond consuming the plugin's picker/completion contract.

## Decisions

### 1. Vendor source inside the plugin crate instead of depending on external picker/FS crates directly

The build SHALL use vendored source under `tauri-plugin-image-pipeline/vendor/` rather than reaching across the app boundary or keeping the picker as a standalone dependency. This gives the plugin one ownership boundary and one release artifact.

Alternatives considered:
- **Git submodule**: rejected because it adds operational overhead and still leaves the implementation outside the plugin crate.
- **Direct crates.io dependencies**: rejected because the current bug is caused by the runtime boundary, not just dependency versioning; direct dependencies still make the implementation feel external.
- **Ad hoc reimplementation only**: possible, but too easy to drift without a reference copy while the implementation agent is working.

Recommended layout:
```text
tauri-plugin-image-pipeline/
  vendor/
    tauri-plugin-dialog/
    android-uri-cache/
    references/
```

### 2. Keep `vendor/references/` gitignored and non-buildable

`vendor/references/` SHALL hold upstream source snapshots, notes, or diff targets from:
- `https://github.com/tauri-apps/tauri-plugin-dialog.git`
- `https://github.com/aiueo13/tauri-plugin-android-fs.git`

That directory is for implementation guidance only. It is not part of the compiled source graph. This lets the implementation agent inspect upstream behavior without accidentally coupling the build to those repos.

Alternatives considered:
- **No reference directory**: rejected because the implementing agent needs a local source map to avoid hallucinating details.
- **Keep references in the build tree**: rejected because it blurs the line between production code and examples.

### 3. Keep the public picker contract unchanged

The plugin SHALL continue to return the same immediate picker response shape:
- `jobId`
- `previewPath`
- `previewMimeType`
- `status`

And it SHALL continue to emit:
- `image_pipeline://job_completed`
- `image_pipeline://job_failed`

That keeps the host app stable. The change is about where the picker logic lives and how Android URIs are staged, not about forcing the app to learn a new contract.

Example Rust-facing shape:
```rust
pub async fn pick_image(
    &self,
    request: PickImageRequest,
) -> Result<PickImageResponse, PluginError> {
    let selection = self.pick_source_file(&request.picker_mode).await?;
    let staged = self.stage_picker_source(&selection, &job_id).await?;
    let preview = self.generate_preview(&staged.path, request.compression.preview_max_long_edge)?;
    Ok(PickImageResponse {
        job_id,
        preview_path: preview.path,
        preview_mime_type: preview.mime_type,
        status: "queued".into(),
    })
}
```

### 4. Stage Android URIs before preview generation or compression

Android `content://` results SHALL be copied into plugin cache before any preview or compression logic touches them. That copy boundary is the thing that failed in the earlier implementation, so it needs to be explicit and narrow.

If the picker result is already a filesystem path, the plugin may copy it directly into cache using the same staging path. If it is a URI, the Android helper under `vendor/android-uri-cache/` SHALL open the URI through `ContentResolver` and copy bytes into a local file.

Example Kotlin helper shape:
```kotlin
fun stagePickedUri(context: Context, sourceUri: Uri, outputFile: File): File {
    outputFile.parentFile?.mkdirs()
    context.contentResolver.openInputStream(sourceUri)?.use { input ->
        outputFile.outputStream().use { output ->
            input.copyTo(output)
        }
    } ?: throw IllegalStateException("Unable to open picker content URI")
    return outputFile
}
```

### 5. Use TDD slices that start with contracts and failure cases

The first tests SHALL describe the desired plugin behavior before the implementation agent writes the vendored code. That reduces the risk of shipping a large fork with hidden path/URI bugs.

Recommended test order:
1. Rust contract tests for request/response serialization, event names, and local-path staging semantics.
2. Kotlin unit tests for Android URI staging and failure handling.
3. Build-time checks that the vendored source is wired into the plugin crate.
4. Android runtime verification through the host app to confirm the preview path is renderable.

Example test target:
```rust
#[test]
fn android_content_uri_is_not_treated_like_a_local_path() {
    let selection = PickerSelection::from_picker_path_string(
        "content://com.android.providers.media.documents/document/image%3A123"
    ).unwrap();

    assert!(selection.is_content_uri());
    assert!(selection.local_path().is_none());
}
```

## Risks / Trade-offs

- [Risk] Vendored code can drift from upstream → [Mitigation] keep `vendor/references/` updated and add focused tests around the exact staging contract.
- [Risk] The build may accidentally pick up the wrong source tree → [Mitigation] path dependencies and explicit source-set wiring must point at `vendor/` only.
- [Risk] Android helper code can become too large if we absorb the full upstream FS plugin → [Mitigation] vendor only the minimal staging behavior needed by the image pipeline.
- [Risk] Maintaining a fork increases merge cost → [Mitigation] keep the vendored surface narrow and preserve the public API so the app does not need churn.

## Migration Plan

1. Add the vendored source tree under `tauri-plugin-image-pipeline/vendor/`.
2. Point `tauri-plugin-image-pipeline` at the vendored picker implementation.
3. Add the minimal Android URI staging helper under the vendored tree and wire the Android module to it.
4. Add `vendor/references/` and keep it gitignored so upstream snapshots can be used as implementation guidance.
5. Remove the app-facing direct dependency on picker/FS behavior where it is only used for image selection.
6. Add and run contract tests before making the implementation the default.
7. Verify on Android with the host app and log capture after the picker returns a staged path.

Rollback strategy:
- Repoint the plugin dependency back to the previous upstream crate only if the vendored fork cannot be stabilized quickly.
- Keep the public `pick_image` response shape unchanged so the host app can remain on the same contract during rollback.

## Open Questions

- Should the vendored picker copy be a true subtree mirror or a manually curated vendored snapshot refreshed from upstream when needed?
- Should the Android staging helper be a Kotlin source-set under `vendor/android-uri-cache/` or a tiny Gradle module included by source path?
- Do we want a small sync script for refreshing `vendor/references/` from the upstream repositories, or should updates remain fully manual?
