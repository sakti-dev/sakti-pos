## Context

`tauri-plugin-image-pipeline` already owns the public image-pipeline contract, but the picker boundary has proven too fragile when it depends on app-owned Android file helpers or external plugin behavior at runtime. The failure mode is consistent: Android file pickers return `content://` URIs, and any extra hop that tries to reinterpret those URIs as local paths can fail in a way that looks like user cancellation or a generic processing error.

This change makes the image pipeline self-contained. The plugin itself remains the public API surface; picker-related code and the Android URI staging behavior live inside `tauri-plugin-image-pipeline` so the build no longer relies on the app for picker plumbing. Upstream source snapshots from `tauri-plugin-dialog` and `tauri-plugin-android-fs` may be stored under `vendor/references/` as gitignored reference material for implementation guidance, but those references are not part of the compiled build.

## Goals / Non-Goals

**Goals:**
- Keep the public plugin API stable while moving picker and staging ownership fully into `tauri-plugin-image-pipeline`.
- Make the build self-contained by implementing the picker-facing dependency surface inside the plugin crate and using `vendor/references/` only as source guidance.
- Treat Android `content://` URIs as first-class picker results by copying them into plugin cache before preview generation or compression.
- Preserve cache-local preview paths and completion/failure events so the host app can remain generic.
- Provide a TDD-friendly structure so the implementation agent can write tests before code and verify the result at each step.

**Non-Goals:**
- Redesigning the asset persistence model or the sync pipeline.
- Adding a custom in-app gallery UI.
- Expanding the Android file helper into the full `tauri-plugin-android-fs` surface area.
- Changing the host app's business logic beyond consuming the plugin's picker/completion contract.

## Decisions

### 1. Implement picker logic inside the plugin crate and use references only for guidance

The production build SHALL use code that lives inside `tauri-plugin-image-pipeline` itself rather than reaching across the app boundary or depending on a separate picker/FS plugin at runtime. `tauri-plugin-image-pipeline/vendor/references/` is a read-only source guide, not a build input.

Alternatives considered:
- **Git submodule**: rejected because it adds operational overhead and still leaves the implementation boundary ambiguous for the build.
- **Direct crates.io dependencies**: rejected because the current bug is caused by the runtime boundary, not just dependency versioning; direct dependencies still make the implementation feel external.
- **Copying source into `vendor/` and compiling from there**: rejected because the build should not depend on a “shadow dependency tree”; the plugin crate itself should own the compiled implementation.

Recommended layout:
```text
tauri-plugin-image-pipeline/
  src/
    picker.rs
    picker_stage.rs
  android/
    src/main/java/com/sakti_dev/sakti_pos/imagepipeline/
  vendor/
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
    let job_id = uuid::Uuid::new_v4().to_string();
    let selection = self.pick_source_file(&request.picker_mode).await?;
    let staged = self.stage_picker_source(&selection, &job_id).await?;
    let preview = self.generate_preview(
        &staged.path,
        request.compression.preview_max_long_edge,
    )?;
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

Example Android picker shape:
```kotlin
@Command
fun showOpenVisualMediaDialog(invoke: Invoke) {
    val args = invoke.parseArgs(Args::class.java)
    val intent = createVisualMediaPickerIntent(args.multiple, args.target)

    if (args.localOnly) {
        intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true)
    }

    startActivityForResult(invoke, intent, "handleShowOpenFileAndVisualMediaDialog")
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

Example Kotlin test target:
```kotlin
@Test
fun stagePickedUri_copiesContentUriIntoCache() {
    val output = File(tempDir, "picked.source")
    val staged = stagePickedUri(context, sourceUri, output)

    assertThat(staged).exists()
    assertThat(staged.readBytes()).isEqualTo(expectedBytes)
}
```

## Risks / Trade-offs

- [Risk] The implementation can drift from upstream behavior → [Mitigation] keep `vendor/references/` updated and add focused tests around the exact staging contract.
- [Risk] The build may accidentally pick up the wrong source tree → [Mitigation] source paths and Gradle wiring must point at the plugin crate's own production code only.
- [Risk] Android helper code can become too large if we absorb the full upstream FS plugin → [Mitigation] implement only the minimal staging behavior needed by the image pipeline.
- [Risk] Maintaining a local reimplementation increases merge cost → [Mitigation] keep the reference surface narrow and preserve the public API so the app does not need churn.

## Migration Plan

1. Add `vendor/references/` and keep it gitignored so upstream snapshots can be used as implementation guidance.
2. Add production picker/staging code inside `tauri-plugin-image-pipeline` itself, with the picker boundary and Android staging helpers living under the plugin crate source tree.
3. Wire the Android source set for the plugin crate to compile the plugin-owned Android implementation, not the reference snapshots.
4. Remove app-facing direct picker/FS glue where it only exists to bridge image selection.
5. Add contract tests for request/response shape, URI staging, preview path stability, and failure events before changing runtime behavior.
6. Verify on Android with the host app and log capture after the picker returns a staged path.

Rollback strategy:
- Repoint any temporary experiment back to the previous upstream crate only if the local reimplementation cannot be stabilized quickly.
- Keep the public `pick_image` response shape unchanged so the host app can remain on the same contract during rollback.

## Open Questions

- Should the reference snapshots be refreshed manually or via a small sync script that mirrors upstream commits into `vendor/references/`?
- Should the Android picker implementation prefer `ACTION_OPEN_DOCUMENT`, `ACTION_GET_CONTENT` chooser fallback, or `PickVisualMedia` depending on mode and API level, mirroring the upstream behavior as closely as possible?
- Should URI staging use a single cache-root helper shared by desktop and Android, or keep a platform-specific staging helper per backend?
