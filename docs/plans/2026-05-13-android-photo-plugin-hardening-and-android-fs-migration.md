# Android Photo Plugin Hardening And Android FS Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Android product photo picking reliable for long-term use by hardening our camera temp-file contract first, then migrating gallery/file-system handling to `tauri-plugin-android-fs` while keeping the existing product photo job and sync pipeline intact.

**Architecture:** Keep the application-specific asset pipeline in Rust: persisted `pending_product_photo_jobs`, WebP compression, content-hash dedupe, R2 upload, sync ordering, and hydration remain ours. Replace only the fragile Android gallery/content-URI boundary with `tauri-plugin-android-fs`, and keep camera custom unless/until a community camera plugin supports returning a stable file path without deleting source bytes. Maintain the existing frontend API shape so product form/list code does not know which native plugin performs picking.

**Tech Stack:** Tauri 2, Android Kotlin plugin bridge, Rust commands, SQLite via `sqlx`, Solid/Vitest, `tauri-plugin-android-fs`, `distrobox dev` for Rust/Android builds.

---

## Non-Goals

- Do not split `apps/pos-app/src-tauri/src/assets.rs` in this branch. That cleanup happens after device testing.
- Do not replace the product photo job pipeline.
- Do not switch camera to `tauri-plugin-native-camera` as-is. Its base64 JPEG return contract conflicts with our durable path-based background processing model.
- Do not change R2 upload/download signing behavior.
- Do not add a full custom camera UI.

## Current Problems To Fix

1. `ProductPhotoPlugin` currently owns Android camera and gallery picker behavior.
2. Gallery content-URI handling contains custom fallback logic for Android providers.
3. `ProductPhotoPlugin` deletes all `product_photo_inputs` files during plugin initialization. That can destroy a temp file referenced by a persisted pending job after an app kill.
4. Camera is acceptable but should be hardened around source file ownership and orientation.
5. Product form and sync code should not depend on which Android plugin supplies the source image.

## Target Behavior

Camera flow:

```text
native camera intent
-> write captured full-size JPEG to app cache staging path
-> return stable path + original filename + mime + small preview
-> frontend saves product immediately
-> frontend enqueues pending product photo job
-> syncNow processes job, compresses WebP, links product image_asset_id, uploads
-> Rust deletes temp file after successful job completion
```

Gallery flow:

```text
android-fs picker returns URI
-> app copies selected URI to our app-owned product_photo_inputs staging path
-> return stable path + original filename + mime + small preview
-> same pending job pipeline as camera
```

Important invariant:

```text
Once enqueue_product_photo_processing succeeds, Rust owns cleanup of the staged temp file.
Native picker code must not delete staged files that may be referenced by pending_product_photo_jobs.
```

---

### Task 1: Add Regression Tests For Temp File Cleanup Ownership

**Files:**

- Modify: `apps/pos-app/src-tauri/src/photo_picker.rs`
- Test: `apps/pos-app/src-tauri/src/photo_picker.rs`

**Step 1: Write the failing tests**

Add pure Rust tests for cleanup eligibility. The tests should make the lifecycle rule explicit without needing Android runtime.

```rust
#[test]
fn stale_temp_cleanup_never_targets_product_photo_inputs() {
    assert!(!super::is_stale_picker_temp_path(Path::new(
        "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_inputs/gallery_123.jpg"
    )));
}

#[test]
fn stale_temp_cleanup_may_target_plugin_private_transient_files() {
    assert!(super::is_stale_picker_temp_path(Path::new(
        "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_transient/photo_123.jpg"
    )));
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib photo_picker'
```

Expected:

```text
FAIL because is_stale_picker_temp_path does not exist
```

**Step 3: Write minimal implementation**

Add a helper in `photo_picker.rs`:

```rust
fn is_stale_picker_temp_path(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "product_photo_transient")
}
```

Do not use it from production Kotlin yet. This task only locks the ownership rule.

**Step 4: Run test to verify it passes**

Run the same `cargo test --lib photo_picker` command.

Expected:

```text
photo_picker tests pass
```

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/photo_picker.rs
git commit -m "test: document product photo temp ownership"
```

---

### Task 2: Stop Deleting Pending Product Photo Input Files On Plugin Startup

**Files:**

- Modify: `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPlugin.kt`

**Step 1: Write the failing test**

Android plugin Kotlin currently has no JVM unit-test harness for this plugin. Add a small pure helper in Kotlin first and test it if the generated Android test setup can run locally. If Kotlin unit tests are not practical in this app, make this task an exception and verify by Rust/job integration plus manual logcat.

Preferred test file if practical:

- Create: `apps/pos-app/src-tauri/gen/android/app/src/test/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPluginTest.kt`

Test:

```kotlin
package com.sakti_dev.sakti_pos.photo

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductPhotoPluginTest {
    @Test
    fun startupCleanupDoesNotDeleteProductPhotoInputs() {
        assertFalse(isStartupDeletableTempPhotoPath("/cache/product_photo_inputs/gallery_1.jpg"))
    }

    @Test
    fun startupCleanupCanDeleteTransientFiles() {
        assertTrue(isStartupDeletableTempPhotoPath("/cache/product_photo_transient/photo_1.jpg"))
    }
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app/src-tauri/gen/android && ./gradlew testDebugUnitTest --tests 'com.sakti_dev.sakti_pos.photo.ProductPhotoPluginTest'
```

Expected:

```text
FAIL because isStartupDeletableTempPhotoPath does not exist
```

If Gradle test setup is not available, document the blocker in the task notes and continue with the smallest code change plus manual Android verification.

**Step 3: Write minimal implementation**

Change the Kotlin plugin:

```kotlin
private const val PHOTO_INPUT_DIR = "product_photo_inputs"
private const val PHOTO_TRANSIENT_DIR = "product_photo_transient"

internal fun isStartupDeletableTempPhotoPath(path: String): Boolean {
    return path.split(File.separatorChar).contains(PHOTO_TRANSIENT_DIR)
}
```

Then either:

- remove `cleanupTempPhotoInputs()` entirely, or
- rename it to `cleanupTransientPhotoInputs()` and make it only delete `PHOTO_TRANSIENT_DIR`.

Do not delete `PHOTO_INPUT_DIR` on plugin initialization.

**Step 4: Run tests**

Run:

```bash
cd apps/pos-app/src-tauri/gen/android && ./gradlew testDebugUnitTest --tests 'com.sakti_dev.sakti_pos.photo.ProductPhotoPluginTest'
```

Run Rust tests:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib photo_picker'
```

Expected:

```text
tests pass
```

**Step 5: Manual verification**

On device:

1. Pick camera/gallery photo.
2. Submit product.
3. Kill app before job finishes if possible.
4. Reopen app.
5. Confirm the pending job either processes successfully or fails only if Android itself removed the cache file.

Use:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE '\[PHOTO-DEBUG\]|product_photo_job|product_photo_jobs|asset_sync|asset_upload|asset_hydration|hydrate_asset|upload_asset|processing_failed|failed|error|query_failed'
```

Expected healthy lines:

```text
product_photo_job:enqueued
product_photo_job:done
upload_asset:put_done
upload_asset:complete_done
```

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPlugin.kt apps/pos-app/src-tauri/gen/android/app/src/test/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPluginTest.kt
git commit -m "fix: preserve pending product photo inputs on startup"
```

---

### Task 3: Add `tauri-plugin-android-fs` Dependencies And Permissions

**Files:**

- Modify: `apps/pos-app/src-tauri/Cargo.toml`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src-tauri/capabilities/default.json`
- Modify: `apps/pos-app/package.json`

**Step 1: Write the failing test**

Add a compile-level test by importing the extension in a small Android-FS adapter module.

- Create: `apps/pos-app/src-tauri/src/android_fs.rs`

Initial failing test:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn android_fs_module_is_available() {
        assert_eq!(super::ANDROID_FS_PICKER_MIME_TYPES, ["image/*"]);
    }
}
```

This will fail because the module is not registered and the constant does not exist.

**Step 2: Run test to verify it fails**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib android_fs'
```

Expected:

```text
FAIL because module/constant is missing
```

**Step 3: Add dependencies and module**

Add to `Cargo.toml`:

```toml
tauri-plugin-android-fs = "28.1.0"
```

Add exact JS package version to `apps/pos-app/package.json`:

```json
"tauri-plugin-android-fs-api": "28.1.0"
```

Add module:

```rust
mod android_fs;
```

Register plugin in `lib.rs`:

```rust
.plugin(tauri_plugin_android_fs::init())
```

Add capability permission:

```json
"android-fs:default"
```

Create `android_fs.rs`:

```rust
pub const ANDROID_FS_PICKER_MIME_TYPES: [&str; 1] = ["image/*"];
```

**Step 4: Run tests**

Run:

```bash
bun install
```

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib android_fs'
```

Expected:

```text
android_fs tests pass
```

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/Cargo.toml apps/pos-app/src-tauri/Cargo.lock apps/pos-app/src-tauri/src/lib.rs apps/pos-app/src-tauri/src/android_fs.rs apps/pos-app/src-tauri/capabilities/default.json apps/pos-app/package.json bun.lock
git commit -m "chore: add android fs plugin"
```

---

### Task 4: Add Rust Adapter For Android-FS Gallery Selection

**Files:**

- Modify: `apps/pos-app/src-tauri/src/android_fs.rs`
- Modify: `apps/pos-app/src-tauri/src/photo_picker.rs`
- Test: `apps/pos-app/src-tauri/src/android_fs.rs`

**Step 1: Write failing tests for path staging rules**

In `android_fs.rs`, add tests for app-owned staging path construction and file-name normalization:

```rust
#[cfg(test)]
mod tests {
    use std::path::Path;

    #[test]
    fn product_photo_input_path_uses_safe_extension() {
        let path = super::build_product_photo_input_path(
            Path::new("/tmp/cache"),
            "gallery",
            "Screenshot 1.PNG",
            "image/png",
            123
        );

        assert_eq!(
            path,
            Path::new("/tmp/cache/product_photo_inputs/gallery_123.png")
        );
    }

    #[test]
    fn product_photo_input_path_falls_back_to_jpg_for_unknown_mime() {
        let path = super::build_product_photo_input_path(
            Path::new("/tmp/cache"),
            "gallery",
            "unknown",
            "application/octet-stream",
            123
        );

        assert_eq!(
            path,
            Path::new("/tmp/cache/product_photo_inputs/gallery_123.jpg")
        );
    }
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib android_fs'
```

Expected:

```text
FAIL because build_product_photo_input_path does not exist
```

**Step 3: Implement pure helpers**

Add:

```rust
pub fn extension_for_mime_type(mime_type: &str) -> &'static str {
    match mime_type.to_ascii_lowercase().as_str() {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/heic" => "heic",
        "image/heif" => "heif",
        _ => "jpg",
    }
}

pub fn build_product_photo_input_path(
    cache_root: &Path,
    prefix: &str,
    original_filename: &str,
    mime_type: &str,
    timestamp_millis: u128,
) -> PathBuf {
    let extension = original_filename
        .rsplit_once('.')
        .map(|(_, extension)| extension)
        .filter(|extension| !extension.trim().is_empty())
        .unwrap_or_else(|| extension_for_mime_type(mime_type))
        .trim_matches('.')
        .to_ascii_lowercase();

    cache_root
        .join("product_photo_inputs")
        .join(format!("{prefix}_{timestamp_millis}.{extension}"))
}
```

**Step 4: Run test to verify it passes**

Run the same `cargo test --lib android_fs` command.

Expected:

```text
android_fs tests pass
```

**Step 5: Add Android-only adapter skeleton**

Add Android-only function signatures:

```rust
#[cfg(target_os = "android")]
pub async fn pick_gallery_to_product_photo_input<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<crate::photo_picker::PickedProductPhoto, String> {
    todo!("implemented in next task")
}
```

Do not wire it to production yet.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/android_fs.rs
git commit -m "test: define android fs photo staging rules"
```

---

### Task 5: Implement Android-FS Gallery Copy To Stable Staging Path

**Files:**

- Modify: `apps/pos-app/src-tauri/src/android_fs.rs`
- Modify: `apps/pos-app/src-tauri/src/photo_picker.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write failing integration-style Rust test for non-Android fallback**

In `android_fs.rs`:

```rust
#[cfg(not(target_os = "android"))]
pub async fn pick_gallery_to_product_photo_input<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<crate::photo_picker::PickedProductPhoto, String> {
    Err("Android FS gallery picker is only supported on Android".to_string())
}

#[cfg(test)]
mod desktop_tests {
    #[test]
    fn desktop_error_message_is_stable() {
        assert_eq!(
            super::ANDROID_FS_UNSUPPORTED_ERROR,
            "Android FS gallery picker is only supported on Android"
        );
    }
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib android_fs'
```

Expected:

```text
FAIL because ANDROID_FS_UNSUPPORTED_ERROR is missing
```

**Step 3: Implement Android gallery adapter**

Use `tauri-plugin-android-fs` Rust-side APIs:

```rust
#[cfg(target_os = "android")]
pub async fn pick_gallery_to_product_photo_input<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<crate::photo_picker::PickedProductPhoto, String> {
    use tauri_plugin_android_fs::AndroidFsExt;

    let api = app.android_fs_async();
    let selected = api
        .file_picker()
        .pick_file(None, &ANDROID_FS_PICKER_MIME_TYPES, false)
        .await
        .map_err(|error| format!("Failed to open gallery picker: {error}"))?;

    let Some(uri) = selected else {
        return Err("Gallery operation was cancelled by user".to_string());
    };

    let mime_type = api
        .get_mime_type(&uri)
        .await
        .unwrap_or_else(|_| "image/jpeg".to_string());
    let original_filename = api
        .get_name(&uri)
        .await
        .unwrap_or_else(|_| format!("gallery_{}.{}", current_time_millis(), extension_for_mime_type(&mime_type)));

    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Could not resolve app cache directory".to_string())?;
    let target_path = build_product_photo_input_path(
        &cache_root,
        "gallery",
        &original_filename,
        &mime_type,
        current_time_millis(),
    );

    if let Some(parent) = target_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("Failed to create product photo input directory: {error}"))?;
    }

    let bytes = api
        .read_file(&uri)
        .await
        .map_err(|error| format!("Failed to read gallery image: {error}"))?;
    tokio::fs::write(&target_path, bytes)
        .await
        .map_err(|error| format!("Failed to stage gallery image: {error}"))?;

    Ok(crate::photo_picker::picked_product_photo_from_path(
        target_path,
        original_filename,
        mime_type,
        crate::photo_picker::ProductPhotoSource::Gallery,
    ))
}
```

Adjust names to match the actual `tauri-plugin-android-fs` API. If the Rust API returns a reader instead of bytes, use its readable file API and copy the stream to `target_path`.

**Step 4: Extract shared result builder from `photo_picker.rs`**

Create a Rust helper:

```rust
pub fn picked_product_photo_from_path(
    path: PathBuf,
    original_filename: String,
    mime_type: String,
    source: ProductPhotoSource,
) -> PickedProductPhoto {
    PickedProductPhoto {
        path: path.to_string_lossy().to_string(),
        original_filename,
        mime_type,
        preview_base64: None,
        preview_mime_type: None,
        source,
    }
}
```

Preview can remain Kotlin-provided for camera. For Android-FS gallery, either:

- first return no preview and rely on compression completing quickly, or
- add a later task to generate preview in Rust.

Recommended for first migration: return no preview for Android-FS gallery, then add preview as Task 6.

**Step 5: Wire gallery only**

Modify `pick_product_photo`:

```rust
if source == ProductPhotoSource::Gallery {
    return crate::android_fs::pick_gallery_to_product_photo_input(&app).await;
}
```

Keep camera going through `ProductPhotoPicker`.

**Step 6: Run tests**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo fmt --check && cargo test --lib'
```

Expected:

```text
Rust lib tests pass
```

**Step 7: Commit**

```bash
git add apps/pos-app/src-tauri/src/android_fs.rs apps/pos-app/src-tauri/src/photo_picker.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat: use android fs for gallery photo staging"
```

---

### Task 6: Add Rust Preview Generation For Android-FS Gallery Results

**Files:**

- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/photo_picker.rs`
- Modify: `apps/pos-app/src-tauri/src/android_fs.rs`
- Test: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write failing tests for preview sizing**

Extract reusable image preview generation from the image-processing logic.

Test:

```rust
#[test]
fn preview_dimensions_fit_within_max_edge() {
    assert_eq!(super::fit_within_max_edge(1600, 800, 320), (320, 160));
    assert_eq!(super::fit_within_max_edge(800, 1600, 320), (160, 320));
}
```

If this already exists through `fit_within_max_edge`, add a new test for preview MIME/data contract:

```rust
#[test]
fn preview_response_uses_jpeg_mime_type() {
    assert_eq!(super::PRODUCT_PHOTO_PREVIEW_MIME_TYPE, "image/jpeg");
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib assets'
```

Expected:

```text
FAIL because preview helper/constant is missing
```

**Step 3: Implement preview helper**

Add a helper that reads source image bytes, decodes, resizes to max edge `320`, encodes JPEG or WebP, and returns:

```rust
pub struct ProductPhotoPreview {
    pub preview_base64: String,
    pub preview_mime_type: String,
}
```

Implementation can use `image` crate. Keep it separate from final WebP compression.

**Step 4: Use preview helper in Android-FS gallery adapter**

After writing the staged file, call the preview helper and include:

```rust
preview_base64: Some(preview.preview_base64),
preview_mime_type: Some(preview.preview_mime_type),
```

**Step 5: Run tests**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo fmt --check && cargo test --lib'
```

Expected:

```text
Rust lib tests pass
```

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/assets.rs apps/pos-app/src-tauri/src/photo_picker.rs apps/pos-app/src-tauri/src/android_fs.rs
git commit -m "feat: generate gallery previews from staged files"
```

---

### Task 7: Remove Gallery Logic From Custom Kotlin Plugin

**Files:**

- Modify: `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPlugin.kt`
- Modify: `apps/pos-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Test: `apps/pos-app/src-tauri/src/photo_picker.rs`

**Step 1: Write failing Rust test for source routing**

Add pure test around routing if possible:

```rust
#[test]
fn gallery_source_is_routed_to_android_fs() {
    assert!(super::uses_android_fs_picker(&super::ProductPhotoSource::Gallery));
    assert!(!super::uses_android_fs_picker(&super::ProductPhotoSource::Camera));
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib photo_picker'
```

Expected:

```text
FAIL because uses_android_fs_picker does not exist
```

**Step 3: Implement route helper**

```rust
fn uses_android_fs_picker(source: &ProductPhotoSource) -> bool {
    matches!(source, ProductPhotoSource::Gallery)
}
```

Use this helper in `pick_product_photo`.

**Step 4: Remove Kotlin gallery code**

Delete from `ProductPhotoPlugin.kt`:

- `READ_EXTERNAL_STORAGE` permission alias
- `READ_MEDIA_IMAGES` permission alias
- `pickGalleryWithPermissions`
- `handleGalleryPermissionResult`
- `pickGallery`
- `handleGalleryResult`
- `persistGalleryReadPermission`
- `openGalleryInputStream`
- `galleryStreamCandidates`
- `externalStorageFileForDocumentUri`
- `mediaStoreUriForDocumentUri`
- `displayNameForUri`
- `extensionForMimeType`
- gallery branch in `pickPhoto`

Camera branch remains.

**Step 5: Remove no-longer-needed manifest permissions if safe**

Because gallery is now handled by Android system picker through Android-FS, remove app-level media read permissions only if Android-FS does not require them for chosen picker mode:

```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
```

If `tauri-plugin-android-fs` picker does not require broad read permissions, removing them improves Play Store posture.

Keep:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

Keep Android 11+ queries for `IMAGE_CAPTURE`. Keep or remove `OPEN_DOCUMENT` query based on Android-FS manifest behavior.

**Step 6: Run tests**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo fmt --check && cargo test --lib'
```

Run Android compile:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri/gen/android && ./gradlew assembleDebug'
```

Expected:

```text
Rust tests pass
Android debug build succeeds
```

**Step 7: Commit**

```bash
git add apps/pos-app/src-tauri/src/photo_picker.rs apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPlugin.kt apps/pos-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml
git commit -m "refactor: remove custom gallery picker"
```

---

### Task 8: Add Camera EXIF Orientation Verification

**Files:**

- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Test: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write failing test with rotated fixture**

Create or add a small test fixture:

- Create: `apps/pos-app/src-tauri/tests/fixtures/rotated-camera.jpg`

Test desired behavior:

```rust
#[test]
fn camera_image_processing_respects_exif_orientation() {
    let bytes = include_bytes!("../tests/fixtures/rotated-camera.jpg");
    let processed = super::process_image_bytes(bytes, "rotated-camera.jpg").unwrap();

    assert!(processed.height >= processed.width);
}
```

Use a real fixture with EXIF orientation marking portrait while stored landscape.

**Step 2: Run test to verify it fails or proves current behavior**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo test --lib camera_image_processing_respects_exif_orientation'
```

Expected:

```text
FAIL if EXIF orientation is not respected
PASS if image crate already applies the needed orientation
```

If it passes, keep the test and do not add code.

**Step 3: Implement only if failing**

If failing, add EXIF orientation handling before resizing. Prefer a small crate only if the current `image` stack does not expose orientation cleanly.

Do not process camera photos in Kotlin. Keep final processing in Rust.

**Step 4: Run tests**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo fmt --check && cargo test --lib'
```

Expected:

```text
Rust lib tests pass
```

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/assets.rs apps/pos-app/src-tauri/tests/fixtures/rotated-camera.jpg apps/pos-app/src-tauri/Cargo.toml apps/pos-app/src-tauri/Cargo.lock
git commit -m "test: verify camera image orientation"
```

---

### Task 9: Keep Frontend API Stable And Add Contract Tests

**Files:**

- Modify: `apps/pos-app/src/lib/assets.ts`
- Modify: `apps/pos-app/src/lib/__test__/assets.test.ts`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`

**Step 1: Write failing tests**

Add tests that product form continues to depend only on:

```ts
pickProductPhoto(source)
enqueueProductPhotoProcessing(...)
syncNow()
```

Do not import `tauri-plugin-android-fs-api` from product form or product list tests.

Test:

```ts
it("uses the stable product photo API instead of android fs directly", async () => {
  expect(typeof pickProductPhoto).toBe("function");
  expect(typeof enqueueProductPhotoProcessing).toBe("function");
});
```

**Step 2: Run test to verify it fails if imports/contracts are wrong**

Run:

```bash
cd apps/pos-app && bun run test src/lib/__test__/assets.test.ts src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected:

```text
tests fail only if API contract changed incorrectly
```

**Step 3: Implement minimal frontend changes**

If needed, update `assets.ts` types only. Do not expose Android-FS details to product feature code.

**Step 4: Run tests**

Run:

```bash
cd apps/pos-app && bun run test src/lib/__test__/assets.test.ts src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected:

```text
tests pass
```

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/assets.ts apps/pos-app/src/lib/__test__/assets.test.ts apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx
git commit -m "test: preserve product photo frontend contract"
```

---

### Task 10: Update Knowledge Docs

**Files:**

- Modify: `docs/knowledge/pos-product-photo-jobs-and-asset-sync.md`
- Create: `docs/knowledge/android-photo-picker-and-filesystem.md`

**Step 1: Update docs**

Document:

- Camera remains custom because we need stable file path ownership.
- `tauri-plugin-native-camera` is not used because it returns base64 JPEG and deletes source file.
- Gallery uses `tauri-plugin-android-fs`.
- Native picker code must not delete `product_photo_inputs`.
- Rust sync pipeline owns compression/upload/hydration.
- Product feature code must use `src/lib/assets.ts`, not Android-FS directly.
- Required rebuild/restart rules:
  - Rust/Kotlin/native plugin changes require Android rebuild/reinstall.
  - API-only changes require API restart.
  - Frontend TS changes may hot reload in dev, but mobile shell/native bridge changes do not.

**Step 2: Commit**

```bash
git add docs/knowledge/pos-product-photo-jobs-and-asset-sync.md docs/knowledge/android-photo-picker-and-filesystem.md
git commit -m "docs: document android photo picker ownership"
```

---

### Task 11: Full Verification

**Files:**

- No code changes unless verification exposes defects.

**Step 1: Run POS app tests**

Run:

```bash
cd apps/pos-app && bun run test
```

Expected:

```text
Test Files pass
Tests pass
```

**Step 2: Run typecheck and Ultracite**

Run:

```bash
cd apps/pos-app && bun run typecheck && bun x ultracite check
```

Expected:

```text
typecheck passes
Ultracite reports no issues
```

**Step 3: Run Rust tests**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri && cargo fmt --check && cargo test --lib'
```

Expected:

```text
cargo fmt passes
cargo test passes
```

**Step 4: Run Android build**

Run:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri/gen/android && ./gradlew assembleDebug'
```

Expected:

```text
BUILD SUCCESSFUL
```

**Step 5: Manual device verification**

Run logcat:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE '\[PHOTO-DEBUG\]|product_photo_job|product_photo_jobs|asset_sync|asset_upload|asset_hydration|hydrate_asset|upload_asset|presign|complete-upload|processing_failed|failed|error|query_failed|commit|rollback'
```

Test matrix:

```text
1. Gallery photo -> submit product -> product list shows pending preview -> compressed image appears -> upload completes.
2. Camera photo -> submit product -> product list shows preview -> compressed image appears -> upload completes.
3. Pick photo -> submit product -> immediately navigate away and back -> image remains stable.
4. Pick photo -> submit product -> kill app before upload -> reopen -> job resumes or fails with clear missing-temp error.
5. Reinstall app -> login -> product assets hydrate from R2.
```

Healthy log markers:

```text
product_photo_job:enqueued
product_photo_job:done
upload_asset:put_done
upload_asset:complete_done
hydrate_asset:download_done OR hydrate_asset:skip_cached
```

Bad log markers to investigate:

```text
query_failed
rollback
SignatureDoesNotMatch
Missing x-amz-content-sha256
No date provided in x-amz-date nor date header
product_photo_job:failed
```

**Step 6: Final commit if verification fixes were needed**

```bash
git status --short
git add <changed files>
git commit -m "fix: stabilize android photo picker migration"
```

---

## Rollback Plan

If `tauri-plugin-android-fs` causes build or runtime instability:

1. Keep Task 2 because preserving pending temp files is still correct.
2. Revert Tasks 3-7.
3. Restore Kotlin gallery picker temporarily.
4. Add a follow-up issue to replace custom gallery picker with a smaller adapter or forked Android-FS usage.

Do not revert the product photo job pipeline unless sync/photo persistence itself regresses.

## Acceptance Criteria

- Product photo camera path still works.
- Product photo gallery path works through Android-FS.
- Native startup no longer deletes temp files referenced by pending jobs.
- Product form remains instant and does not wait on compression.
- Product list can show pending preview, cached compressed image, or hydrated image reliably.
- R2 upload/download behavior remains unchanged.
- All automated checks pass.
- Device logcat shows no query/rollback/signature/photo-job failures during the manual test matrix.
