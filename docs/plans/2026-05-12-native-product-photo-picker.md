# Native Product Photo Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> Historical note: this plan documents the old app-owned product photo picker. The current implementation uses the plugin-owned `tauri-plugin-image-pipeline` picker flow instead.

**Goal:** Replace Android WebView file-input product photo acquisition with a native Tauri Android plugin that supports both camera and gallery, returns a stable app-cache file path, and lets Rust compress/persist only the WebP asset.

**Architecture:** Add an internal Android plugin modeled after `docs/external/tauri-plugin-native-camera`, but change the contract from "return JPEG base64" to "return temporary app-cache file path". JS only requests a photo source and receives metadata; Rust reads the path, compresses to max 800px WebP, saves the compressed file and asset rows, then deletes the temporary original. The existing local-first upload queue remains unchanged.

**Tech Stack:** Tauri v2, Kotlin Android plugin API, Android `ACTION_IMAGE_CAPTURE`, Android gallery picker intent, `FileProvider`, Rust `image`/`zenwebp`, SQLite via `sqlx`, SolidJS, Vitest, Cargo tests, Bun, Ultracite.

---

## Reference Context

Use these files as reference before implementation:

- External plugin reference: `docs/external/tauri-plugin-native-camera/android/src/main/java/in/kushaldas/plugin/nativecamera/NativeCameraPlugin.kt`
- External plugin Rust bridge: `docs/external/tauri-plugin-native-camera/src/lib.rs`
- Existing internal plugin pattern: `apps/pos-app/src-tauri/src/printer.rs`
- Existing internal Kotlin plugin: `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/printer/ThermalPrinterPlugin.kt`
- Existing image pipeline: `apps/pos-app/src-tauri/src/assets.rs`
- Product form photo flow: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- JS asset helpers: `apps/pos-app/src/lib/assets.ts`
- Android manifest: `apps/pos-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- FileProvider paths: `apps/pos-app/src-tauri/gen/android/app/src/main/res/xml/file_paths.xml`

Important constraints:

- Do not use WebView `FileReader` for Android camera/gallery acquisition.
- Do not persist original/uncompressed images in app-owned storage after processing.
- Rust must own compression and final cache persistence.
- Camera and gallery must use the same post-acquisition Rust path-processing command.
- Product save must remain local-first and not depend on cloud/object storage.
- Existing upload/hydration/sync queue must continue to operate on compressed WebP cache files only.
- Keep broad storage permissions out of the app. Camera permission is acceptable.
- The app is not launched yet; no backward compatibility migration path is required beyond current local baseline.

## Target Runtime Flow

```text
User taps "Pilih Foto"
  -> Drawer opens
  -> User chooses "Ambil Foto" or "Pilih dari Galeri"
  -> JS calls pickProductPhoto({ source })
  -> Rust bridge calls Android ProductPhotoPlugin.pickPhoto
  -> Android plugin returns temp app-cache path + metadata
  -> JS calls prepareLocalProductImageAssetFromPath(...)
  -> Rust reads temp original bytes from path
  -> Rust compresses to WebP max 800px
  -> Rust writes only compressed WebP to asset cache
  -> Rust inserts/updates assets + local_asset_cache + sync_outbox
  -> Rust deletes temp original path
  -> JS stores returned asset id on the form
  -> Product save writes image_asset_id locally
  -> Existing Rust upload job uploads compressed WebP later
```

## Target Contracts

Native picker result:

```ts
export type ProductPhotoSource = "camera" | "gallery";

export interface PickedProductPhoto {
  path: string;
  originalFilename: string;
  mimeType: string;
  source: ProductPhotoSource;
}
```

JS helpers:

```ts
export async function pickProductPhoto(
  source: ProductPhotoSource
): Promise<PickedProductPhoto>;

export async function prepareLocalProductImageAssetFromPath(input: {
  kind: string;
  merchantId: string;
  originalFilename: string;
  path: string;
}): Promise<PreparedLocalAsset>;
```

Rust commands:

```rust
#[tauri::command]
pub async fn pick_product_photo<R: Runtime>(
    app: tauri::AppHandle<R>,
    source: ProductPhotoSource,
) -> Result<PickedProductPhoto, String>;

#[tauri::command]
pub async fn prepare_local_product_image_asset_from_path(
    app: AppHandle,
    state: State<'_, AppState>,
    merchant_id: String,
    original_filename: String,
    kind: String,
    path: String,
) -> Result<PreparedLocalAssetResponse, String>;
```

---

### Task 1: Add JS Contract Tests for Native Photo Picking

**Files:**

- Modify: `apps/pos-app/src/lib/__test__/assets.test.ts`
- Modify: `apps/pos-app/src/lib/assets.ts`

**Step 1: Write the failing test**

Add tests to `apps/pos-app/src/lib/__test__/assets.test.ts`:

```ts
test("pickProductPhoto invokes the native picker with the selected source", async () => {
  mockInvoke.mockResolvedValue({
    path: "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_inputs/photo_1.jpg",
    originalFilename: "photo_1.jpg",
    mimeType: "image/jpeg",
    source: "camera",
  });

  const result = await pickProductPhoto("camera");

  expect(result.source).toBe("camera");
  expect(result.path).toContain("product_photo_inputs");
  expect(mockInvoke).toHaveBeenCalledWith("pick_product_photo", {
    source: "camera",
  });
});

test("prepareLocalProductImageAssetFromPath sends only path metadata to Rust", async () => {
  mockInvoke.mockResolvedValue({
    asset: { id: "asset-1", objectKey: "merchant-1/assets/asset-1" },
    localPath: "/tmp/cache/merchant-1/assets/asset-1.webp",
  });

  const result = await prepareLocalProductImageAssetFromPath({
    kind: "product_photo",
    merchantId: "merchant-1",
    originalFilename: "photo_1.jpg",
    path: "/tmp/product_photo_inputs/photo_1.jpg",
  });

  expect(result.asset.id).toBe("asset-1");
  expect(mockInvoke).toHaveBeenCalledWith(
    "prepare_local_product_image_asset_from_path",
    {
      kind: "product_photo",
      merchantId: "merchant-1",
      originalFilename: "photo_1.jpg",
      path: "/tmp/product_photo_inputs/photo_1.jpg",
    }
  );
});
```

Update the dynamic import destructuring in the test to include:

```ts
pickProductPhoto,
prepareLocalProductImageAssetFromPath,
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun test src/lib/__test__/assets.test.ts
```

Expected: FAIL because `pickProductPhoto` and `prepareLocalProductImageAssetFromPath` do not exist.

**Step 3: Write minimal implementation**

Add types and helpers to `apps/pos-app/src/lib/assets.ts`:

```ts
export type ProductPhotoSource = "camera" | "gallery";

export interface PickedProductPhoto {
  mimeType: string;
  originalFilename: string;
  path: string;
  source: ProductPhotoSource;
}

export async function pickProductPhoto(
  source: ProductPhotoSource
): Promise<PickedProductPhoto> {
  return await invoke<PickedProductPhoto>("pick_product_photo", { source });
}

export async function prepareLocalProductImageAssetFromPath(input: {
  kind: string;
  merchantId: string;
  originalFilename: string;
  path: string;
}): Promise<PreparedLocalAsset> {
  return await invoke<PreparedLocalAsset>(
    "prepare_local_product_image_asset_from_path",
    {
      kind: input.kind,
      merchantId: input.merchantId,
      originalFilename: input.originalFilename,
      path: input.path,
    }
  );
}
```

Keep `processImageFile` as a desktop/test fallback until the form is rewired.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/pos-app && bun test src/lib/__test__/assets.test.ts
```

Expected: PASS.

---

### Task 2: Add Rust Photo Picker Bridge Contract

**Files:**

- Create: `apps/pos-app/src-tauri/src/photo_picker.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Test: `apps/pos-app/src-tauri/src/photo_picker.rs`

**Step 1: Write the failing Rust tests**

Create `apps/pos-app/src-tauri/src/photo_picker.rs` with only test scaffolding first:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProductPhotoSource {
    Camera,
    Gallery,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn product_photo_source_serializes_to_lowercase_for_kotlin() {
        assert_eq!(
            serde_json::to_value(super::ProductPhotoSource::Camera).unwrap(),
            json!("camera")
        );
        assert_eq!(
            serde_json::to_value(super::ProductPhotoSource::Gallery).unwrap(),
            json!("gallery")
        );
    }
}
```

This intentionally fails because `rename_all = "camelCase"` is wrong for enum values.

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test --lib photo_picker -- --nocapture
```

Expected: FAIL because enum serializes as `"Camera"` or `"Gallery"` instead of lowercase.

**Step 3: Write minimal implementation**

Change the enum attribute to:

```rust
#[serde(rename_all = "lowercase")]
```

Add the full bridge:

```rust
use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.sakti_dev.sakti_pos.photo";

#[cfg(not(target_os = "android"))]
const UNSUPPORTED_PLATFORM_ERROR: &str = "Product photo picking is only supported on Android";

#[derive(Debug, Clone, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProductPhotoSource {
    Camera,
    Gallery,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedProductPhoto {
    pub path: String,
    pub original_filename: String,
    pub mime_type: String,
    pub source: ProductPhotoSource,
}

pub struct ProductPhotoPicker<R: Runtime> {
    #[cfg(target_os = "android")]
    mobile_plugin_handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> ProductPhotoPicker<R> {
    fn pick_photo(&self, source: ProductPhotoSource) -> Result<PickedProductPhoto, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("pickPhoto", serde_json::json!({ "source": source }))
                .map_err(|error| {
                    eprintln!("[PHOTO-DEBUG] pick_product_photo:failed {}", error);
                    error.to_string()
                });
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = source;
            Err(unsupported_platform_error().to_string())
        }
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("product-photo-picker")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let mobile_plugin_handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "ProductPhotoPlugin")?;
                app.manage(ProductPhotoPicker::<R> {
                    mobile_plugin_handle,
                });
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(ProductPhotoPicker::<R> {
                    _marker: std::marker::PhantomData,
                });
            }

            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn unsupported_platform_error() -> &'static str {
    UNSUPPORTED_PLATFORM_ERROR
}

#[tauri::command]
pub async fn pick_product_photo<R: Runtime>(
    app: tauri::AppHandle<R>,
    source: ProductPhotoSource,
) -> Result<PickedProductPhoto, String> {
    eprintln!("[PHOTO-DEBUG] pick_product_photo:start source={:?}", source);
    let result = app.state::<ProductPhotoPicker<R>>().pick_photo(source)?;
    eprintln!(
        "[PHOTO-DEBUG] pick_product_photo:done source={:?} path={} filename={} mime_type={}",
        result.source, result.path, result.original_filename, result.mime_type
    );
    Ok(result)
}
```

Register the module and plugin in `apps/pos-app/src-tauri/src/lib.rs`:

```rust
mod photo_picker;
```

Add to builder:

```rust
.plugin(photo_picker::init())
```

Add to invoke handler:

```rust
photo_picker::pick_product_photo,
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test --lib photo_picker -- --nocapture
```

Expected: PASS.

---

### Task 3: Add Rust Path-Based Image Processing and Cleanup

**Files:**

- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing Rust tests**

Add tests to `apps/pos-app/src-tauri/src/assets.rs`:

```rust
#[test]
fn temp_original_path_must_not_be_asset_cache_path() {
    let asset_cache = PathBuf::from("/tmp/app/asset-cache/merchant/assets/hash.webp");
    assert!(!is_deletable_photo_input_path(&asset_cache));

    let photo_input = PathBuf::from("/tmp/app/product_photo_inputs/photo_1.jpg");
    assert!(is_deletable_photo_input_path(&photo_input));
}

#[test]
fn original_filename_falls_back_to_path_file_name() {
    let path = PathBuf::from("/tmp/app/product_photo_inputs/photo_1.jpg");
    assert_eq!(
        normalize_original_filename("", &path),
        "photo_1.jpg".to_string()
    );
    assert_eq!(
        normalize_original_filename("custom.jpg", &path),
        "custom.jpg".to_string()
    );
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test --lib assets -- --nocapture
```

Expected: FAIL because `is_deletable_photo_input_path` and `normalize_original_filename` do not exist.

**Step 3: Write minimal pure helpers**

Add:

```rust
fn is_deletable_photo_input_path(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "product_photo_inputs")
}

fn normalize_original_filename(original_filename: &str, path: &Path) -> String {
    let trimmed = original_filename.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }

    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("product-photo")
        .to_string()
}
```

**Step 4: Add the path command**

Refactor `prepare_local_product_image_asset` to reuse a shared private function:

```rust
struct PreparedImageInput {
    byte_size: i64,
    content_hash: String,
    content_type: String,
    data_base64: String,
    height: i32,
    kind: String,
    merchant_id: String,
    original_filename: String,
    width: i32,
}

async fn prepare_local_product_image_asset_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    input: PreparedImageInput,
) -> Result<PreparedLocalAssetResponse, String> {
    // move existing DB/cache implementation here without behavior changes
}
```

Then make the existing command call the inner function.

Add the new command:

```rust
#[command]
pub async fn prepare_local_product_image_asset_from_path(
    app: AppHandle,
    state: State<'_, AppState>,
    merchant_id: String,
    original_filename: String,
    kind: String,
    path: String,
) -> Result<PreparedLocalAssetResponse, String> {
    let path_buf = PathBuf::from(&path);
    eprintln!(
        "[PHOTO-DEBUG] process_image_path:start path={} filename={} kind={}",
        path,
        original_filename,
        kind
    );

    let normalized_filename = normalize_original_filename(&original_filename, &path_buf);
    let data = fs::read(&path_buf)
        .await
        .map_err(|error| format!("Failed to read selected image path: {}", error))?;

    let processed = tauri::async_runtime::spawn_blocking(move || {
        process_image_bytes(&data, &normalized_filename)
    })
    .await
    .map_err(|error| format!("Failed to process image path on blocking thread: {}", error))??;

    let result = prepare_local_product_image_asset_inner(
        &app,
        &state.db_pool,
        PreparedImageInput {
            byte_size: processed.byte_size as i64,
            content_hash: processed.content_hash,
            content_type: processed.content_type,
            data_base64: processed.data_base64,
            height: processed.height as i32,
            kind,
            merchant_id,
            original_filename: normalized_filename,
            width: processed.width as i32,
        },
    )
    .await;

    if result.is_ok() && is_deletable_photo_input_path(&path_buf) {
        match fs::remove_file(&path_buf).await {
            Ok(()) => eprintln!("[PHOTO-DEBUG] process_image_path:delete_original path={}", path),
            Err(error) => eprintln!(
                "[PHOTO-DEBUG] process_image_path:delete_original_failed path={} error={}",
                path,
                error
            ),
        }
    }

    if let Ok(response) = &result {
        eprintln!(
            "[PHOTO-DEBUG] process_image_path:done asset_id={} local_path={}",
            response.asset.id,
            response.local_path
        );
    }

    result
}
```

Register in `apps/pos-app/src-tauri/src/lib.rs`:

```rust
assets::prepare_local_product_image_asset_from_path,
```

**Step 5: Run test to verify it passes**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test --lib assets -- --nocapture
```

Expected: PASS.

---

### Task 4: Add Android Product Photo Plugin for Camera and Gallery

**Files:**

- Create: `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPlugin.kt`
- Modify: `apps/pos-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/pos-app/src-tauri/gen/android/app/src/main/res/xml/file_paths.xml`

**Step 1: Add manifest declarations**

Modify `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

<queries>
    <intent>
        <action android:name="android.media.action.IMAGE_CAPTURE" />
    </intent>
    <intent>
        <action android:name="android.intent.action.GET_CONTENT" />
        <data android:mimeType="image/*" />
    </intent>
</queries>
```

Keep the existing `FileProvider`.

Ensure `file_paths.xml` has cache access:

```xml
<cache-path name="product_photo_inputs" path="product_photo_inputs/" />
```

The existing broad cache path can remain, but the explicit path documents intent.

**Step 2: Create plugin skeleton**

Create `ProductPhotoPlugin.kt` with:

```kotlin
package com.sakti_dev.sakti_pos.photo

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

private const val TAG = "SaktiPhotoPicker"
private const val CAMERA_PERMISSION = Manifest.permission.CAMERA
private const val PHOTO_INPUT_DIR = "product_photo_inputs"

@InvokeArg
class PickPhotoArgs {
    lateinit var source: String
}

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera")
    ],
)
class ProductPhotoPlugin(private val activity: Activity) : Plugin(activity) {
    private var currentPhotoFile: File? = null

    @Command
    fun pickPhoto(invoke: Invoke) {
        val args = invoke.parseArgs(PickPhotoArgs::class.java)
        Log.i(TAG, "pickPhoto source=${args.source}")
        when (args.source) {
            "camera" -> pickCamera(invoke)
            "gallery" -> pickGallery(invoke)
            else -> invoke.reject("Unsupported photo source: ${args.source}")
        }
    }

    private fun pickCamera(invoke: Invoke) {
        if (ContextCompat.checkSelfPermission(activity, CAMERA_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
            Log.i(TAG, "requesting camera permission")
            requestPermissionForAlias("camera", invoke, "handleCameraPermissionResult")
            return
        }
        launchCamera(invoke)
    }

    @ActivityCallback
    private fun handleCameraPermissionResult(invoke: Invoke) {
        if (ContextCompat.checkSelfPermission(activity, CAMERA_PERMISSION) == PackageManager.PERMISSION_GRANTED) {
            launchCamera(invoke)
            return
        }
        Log.e(TAG, "camera permission denied")
        invoke.reject("Camera permission denied")
    }
}
```

**Step 3: Add camera implementation**

Add:

```kotlin
private fun launchCamera(invoke: Invoke) {
    try {
        val photoFile = createTempPhotoFile("photo", "jpg")
        currentPhotoFile = photoFile
        val photoUri = FileProvider.getUriForFile(
            activity,
            "${activity.packageName}.fileprovider",
            photoFile
        )

        val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        Log.i(TAG, "launchCamera path=${photoFile.absolutePath}")
        startActivityForResult(invoke, cameraIntent, "handleCameraResult")
    } catch (error: Exception) {
        Log.e(TAG, "launchCamera failed", error)
        invoke.reject("Failed to launch camera: ${error.message}")
    }
}

@ActivityCallback
private fun handleCameraResult(invoke: Invoke, result: ActivityResult) {
    Log.i(TAG, "cameraResult resultCode=${result.resultCode}")
    if (result.resultCode != Activity.RESULT_OK) {
        currentPhotoFile?.delete()
        currentPhotoFile = null
        invoke.reject("Camera operation was cancelled by user")
        return
    }

    val photoFile = currentPhotoFile
    if (photoFile == null || !photoFile.exists()) {
        currentPhotoFile = null
        invoke.reject("Captured photo file was not found")
        return
    }

    currentPhotoFile = null
    invoke.resolve(photoResult(photoFile, "image/jpeg", "camera"))
}
```

**Step 4: Add gallery implementation**

Add:

```kotlin
private fun pickGallery(invoke: Invoke) {
    val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
        type = "image/*"
        addCategory(Intent.CATEGORY_OPENABLE)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    Log.i(TAG, "launchGallery")
    startActivityForResult(invoke, intent, "handleGalleryResult")
}

@ActivityCallback
private fun handleGalleryResult(invoke: Invoke, result: ActivityResult) {
    Log.i(TAG, "galleryResult resultCode=${result.resultCode}")
    if (result.resultCode != Activity.RESULT_OK) {
        invoke.reject("Gallery operation was cancelled by user")
        return
    }

    val uri = result.data?.data
    if (uri == null) {
        invoke.reject("Gallery did not return an image")
        return
    }

    try {
        val mimeType = activity.contentResolver.getType(uri) ?: "image/jpeg"
        val filename = displayNameForUri(uri) ?: "gallery_${System.currentTimeMillis()}.${extensionForMimeType(mimeType)}"
        val extension = filename.substringAfterLast('.', extensionForMimeType(mimeType)).lowercase()
        val target = createTempPhotoFile("gallery", extension)

        activity.contentResolver.openInputStream(uri).use { input ->
            if (input == null) {
                invoke.reject("Failed to open gallery image")
                return
            }
            target.outputStream().use { output -> input.copyTo(output) }
        }

        Log.i(TAG, "galleryCopy uri=$uri path=${target.absolutePath} mimeType=$mimeType")
        invoke.resolve(photoResult(target, mimeType, "gallery", filename))
    } catch (error: Exception) {
        Log.e(TAG, "gallery copy failed", error)
        invoke.reject("Failed to copy gallery image: ${error.message}")
    }
}
```

**Step 5: Add shared Kotlin helpers**

Add:

```kotlin
private fun createTempPhotoFile(prefix: String, extension: String): File {
    val cacheDir = File(activity.cacheDir, PHOTO_INPUT_DIR)
    if (!cacheDir.exists()) {
        cacheDir.mkdirs()
    }
    val safeExtension = extension.trim('.').ifBlank { "jpg" }
    return File(cacheDir, "${prefix}_${System.currentTimeMillis()}.$safeExtension")
}

private fun photoResult(
    file: File,
    mimeType: String,
    source: String,
    originalFilename: String = file.name,
): JSObject {
    return JSObject().apply {
        put("path", file.absolutePath)
        put("originalFilename", originalFilename)
        put("mimeType", mimeType)
        put("source", source)
    }
}

private fun displayNameForUri(uri: Uri): String? {
    return activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
    }
}

private fun extensionForMimeType(mimeType: String): String {
    return when (mimeType.lowercase()) {
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/heic" -> "heic"
        "image/heif" -> "heif"
        else -> "jpg"
    }
}
```

**Step 6: Build Android Kotlin to catch compile errors**

Run via distrobox:

```bash
distrobox enter dev -- /bin/bash -lc "
set -euo pipefail
export ANDROID_HOME=\"\$HOME/Android/Sdk\"
export NDK_HOME=\"\$ANDROID_HOME/ndk/26.1.10909125\"
export JAVA_HOME=\"\$HOME/android-studio/jbr\"
export PATH=\"\$PATH:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/cmdline-tools/latest/bin\"
cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri/gen/android
./gradlew :app:compileDebugKotlin
"
```

Expected: PASS. If Gradle variant names differ, use:

```bash
./gradlew tasks | grep -i compile
```

and run the matching debug Kotlin compile task.

---

### Task 5: Wire Product Form to Native Picker With Desktop Fallback

**Files:**

- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`
- Modify: `apps/pos-app/src/lib/assets.ts` only if helper types need exports

**Step 1: Write failing form tests**

Modify the `~/lib/assets` mock:

```ts
const mockPickProductPhoto = vi.fn();
const mockPrepareLocalProductImageAssetFromPath = vi.fn();

vi.mock("~/lib/assets", () => ({
  createWebpPreviewUrl: () => "blob:preview-url",
  pickProductPhoto: (...args: unknown[]) => mockPickProductPhoto(...args),
  prepareLocalProductImageAsset: (...args: unknown[]) =>
    mockPrepareLocalProductImageAsset(...args),
  prepareLocalProductImageAssetFromPath: (...args: unknown[]) =>
    mockPrepareLocalProductImageAssetFromPath(...args),
  processImageFile: (...args: unknown[]) => mockProcessImageFile(...args),
}));
```

Add test:

```ts
test("choosing camera uses the native path picker before preparing the local asset", async () => {
  mockPickProductPhoto.mockResolvedValue({
    path: "/tmp/product_photo_inputs/photo_1.jpg",
    originalFilename: "photo_1.jpg",
    mimeType: "image/jpeg",
    source: "camera",
  });
  mockPrepareLocalProductImageAssetFromPath.mockResolvedValue({
    asset: { id: "asset-1", objectKey: "merchant-1/assets/asset-1" },
    localPath: "/tmp/cache/asset-1.webp",
  });

  render(() => <ProductForm />);
  await user.click(screen.getAllByTestId("action-btn")[0]);
  await user.click(screen.getByText("Ambil Foto"));

  expect(mockPickProductPhoto).toHaveBeenCalledWith("camera");
  expect(mockPrepareLocalProductImageAssetFromPath).toHaveBeenCalledWith({
    kind: "product_photo",
    merchantId: "merchant-1",
    originalFilename: "photo_1.jpg",
    path: "/tmp/product_photo_inputs/photo_1.jpg",
  });
  expect(await screen.findByText("Foto akan diupload saat online.")).toBeInTheDocument();
});
```

Add equivalent gallery test:

```ts
test("choosing gallery uses the native path picker before preparing the local asset", async () => {
  mockPickProductPhoto.mockResolvedValue({
    path: "/tmp/product_photo_inputs/gallery_1.png",
    originalFilename: "menu.png",
    mimeType: "image/png",
    source: "gallery",
  });
  mockPrepareLocalProductImageAssetFromPath.mockResolvedValue({
    asset: { id: "asset-2", objectKey: "merchant-1/assets/asset-2" },
    localPath: "/tmp/cache/asset-2.webp",
  });

  render(() => <ProductForm />);
  await user.click(screen.getAllByTestId("action-btn")[0]);
  await user.click(screen.getByText("Pilih dari Galeri"));

  expect(mockPickProductPhoto).toHaveBeenCalledWith("gallery");
  expect(mockPrepareLocalProductImageAssetFromPath).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun test src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: FAIL because drawer actions still click hidden file inputs and do not call native helpers.

**Step 3: Implement native picker flow**

In `product-form.tsx`, import:

```ts
import {
  pickProductPhoto,
  prepareLocalProductImageAssetFromPath,
} from "~/lib/assets";
```

Add:

```ts
const handleNativePhotoPick = async (source: "camera" | "gallery") => {
  setIsUploadingImage(true);
  setImageError("");

  try {
    photoLogger.info("native_picker_requested", { source });
    const picked = await pickProductPhoto(source);
    photoLogger.info("native_picker_finished", {
      source: picked.source,
      originalFilename: picked.originalFilename,
      mimeType: picked.mimeType,
      path: picked.path,
    });

    setImageFileName(picked.originalFilename);
    photoLogger.info("path_processing_started", {
      name: picked.originalFilename,
      source: picked.source,
    });

    const merchantId = currentMerchantId();
    if (!merchantId) {
      throw new Error("Merchant belum dipilih");
    }

    const { asset, localPath } = await prepareLocalProductImageAssetFromPath({
      kind: "product_photo",
      merchantId,
      originalFilename: picked.originalFilename,
      path: picked.path,
    });

    photoLogger.info("path_processing_finished", {
      assetId: asset.id,
      localPath,
    });
    photoLogger.info("local_asset_prepared", {
      assetId: asset.id,
      localPath,
    });

    const previousPreviewUrl = imagePreviewUrl();
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }
    setImagePreviewUrl(null);
    setImageAssetId(asset.id);
  } catch (uploadError) {
    photoLogger.error("processing_failed", uploadError, { source });
    setImageError(
      uploadError instanceof Error
        ? uploadError.message
        : "Gagal memproses foto"
    );
    setImageAssetId(null);
    setImagePreviewUrl(null);
    setImageFileName("");
  } finally {
    setIsUploadingImage(false);
  }
};
```

Update drawer actions:

```ts
const triggerCameraPicker = () => {
  void handleNativePhotoPick("camera");
};

const triggerGalleryPicker = () => {
  void handleNativePhotoPick("gallery");
};
```

Keep hidden file inputs only if tests or desktop development need fallback. If keeping them, do not call them for Android drawer actions.

Preview behavior note:

- The path-based command currently returns `PreparedLocalAssetResponse`, not base64 WebP.
- For the first implementation, show the queued upload copy and asset state without a preview.
- Optional follow-up: add Rust response field `dataBase64` or resolve local path via `convertFileSrc(localPath)` for immediate preview.
- If adding preview now, prefer `convertFileSrc(localPath)` over reintroducing base64 through JS.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/pos-app && bun test src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: PASS.

---

### Task 6: Add Immediate Preview From Compressed Local Path

**Files:**

- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`

**Step 1: Write failing test**

Mock `convertFileSrc` in the test if not already mocked:

```ts
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));
```

Add assertion to the native camera test:

```ts
expect(await screen.findByAltText("Preview foto produk")).toHaveAttribute(
  "src",
  "asset:///tmp/cache/asset-1.webp"
);
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun test src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: FAIL because path-based flow does not set preview URL.

**Step 3: Implement minimal preview**

Import:

```ts
import { convertFileSrc } from "@tauri-apps/api/core";
```

After `prepareLocalProductImageAssetFromPath` succeeds:

```ts
const previewUrl = convertFileSrc(localPath);
setImagePreviewUrl(previewUrl);
```

Adjust cleanup so `URL.revokeObjectURL` is only used for blob URLs:

```ts
const revokePreviewUrl = (previewUrl: string | null) => {
  if (previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl);
  }
};
```

Use `revokePreviewUrl(imagePreviewUrl())` everywhere instead of direct `URL.revokeObjectURL`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/pos-app && bun test src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: PASS.

---

### Task 7: Add Android Logcat-Targeted Logging

**Files:**

- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- Modify: `apps/pos-app/src-tauri/src/photo_picker.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPlugin.kt`

**Step 1: Verify logs exist in code**

Ensure JS logs include:

- `native_picker_requested`
- `native_picker_finished`
- `path_processing_started`
- `path_processing_finished`
- `local_asset_prepared`
- `processing_failed`

Ensure Rust logs include:

- `[PHOTO-DEBUG] pick_product_photo:start`
- `[PHOTO-DEBUG] pick_product_photo:done`
- `[PHOTO-DEBUG] process_image_path:start`
- `[PHOTO-DEBUG] process_image_path:delete_original`
- `[PHOTO-DEBUG] process_image_path:done`

Ensure Android logs use tag:

- `SaktiPhotoPicker`

**Step 2: Run targeted unit tests**

Run:

```bash
cd apps/pos-app && bun test src/pages/settings/product-categories/__test__/product-form.test.tsx src/lib/__test__/assets.test.ts
```

Expected: PASS.

**Step 3: Use this ADB command during manual testing**

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE "\[PHOTO-DEBUG\]|product-photo|SaktiPhotoPicker|native_picker|path_processing|local_asset_prepared|processing_failed|camera|gallery|FileProvider|permission|FAILED|Failed|Error"
```

Expected camera success log sequence:

```text
native_picker_requested source=camera
SaktiPhotoPicker pickPhoto source=camera
SaktiPhotoPicker launchCamera path=...
SaktiPhotoPicker cameraResult resultCode=-1
[PHOTO-DEBUG] pick_product_photo:done source=Camera path=...
path_processing_started
[PHOTO-DEBUG] process_image_path:start
[PHOTO-DEBUG] process_image_path:delete_original
[PHOTO-DEBUG] process_image_path:done
local_asset_prepared
```

Expected gallery success log sequence:

```text
native_picker_requested source=gallery
SaktiPhotoPicker pickPhoto source=gallery
SaktiPhotoPicker launchGallery
SaktiPhotoPicker galleryCopy uri=... path=...
[PHOTO-DEBUG] pick_product_photo:done source=Gallery path=...
path_processing_started
[PHOTO-DEBUG] process_image_path:start
[PHOTO-DEBUG] process_image_path:delete_original
[PHOTO-DEBUG] process_image_path:done
local_asset_prepared
```

---

### Task 8: Full Verification

**Files:**

- No new code unless verification fails.

**Step 1: Run focused frontend tests**

Run:

```bash
cd apps/pos-app && bun test src/lib/__test__/assets.test.ts src/pages/settings/product-categories/__test__/product-form.test.tsx src/components/__test__/photo-source-drawer.test.tsx src/lib/product-images/__test__/cache.test.ts
```

Expected: PASS.

**Step 2: Run frontend typecheck**

Run:

```bash
cd apps/pos-app && bun run typecheck
```

Expected: PASS.

**Step 3: Run Rust tests**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test --lib assets photo_picker -- --nocapture
```

Expected: PASS.

**Step 4: Run Ultracite**

Run:

```bash
cd apps/pos-app && bun x ultracite check
```

Expected: PASS.

**Step 5: Build Android Kotlin via distrobox**

Run:

```bash
distrobox enter dev -- /bin/bash -lc "
set -euo pipefail
export ANDROID_HOME=\"\$HOME/Android/Sdk\"
export NDK_HOME=\"\$ANDROID_HOME/ndk/26.1.10909125\"
export JAVA_HOME=\"\$HOME/android-studio/jbr\"
export PATH=\"\$PATH:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/cmdline-tools/latest/bin\"
cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri/gen/android
./gradlew :app:compileDebugKotlin
"
```

Expected: PASS.

**Step 6: Manual Android test**

Rebuild/reinstall the app, then run:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE "\[PHOTO-DEBUG\]|product-photo|SaktiPhotoPicker|native_picker|path_processing|local_asset_prepared|processing_failed|camera|gallery|FileProvider|permission|FAILED|Failed|Error"
```

Manual checks:

- Tap `Pilih Foto`.
- Choose `Ambil Foto`.
- Capture/confirm image.
- Verify product form shows queued upload state and preview.
- Save product.
- Confirm logs show temp original deletion.
- Repeat with `Pilih dari Galeri`.
- Confirm no `NotFoundError` appears.
- Confirm no `FileReader` path appears in Android logs.

---

## Rollback Plan

If the native plugin has Android compile/runtime issues:

1. Leave the existing drawer UI intact.
2. Temporarily route camera/gallery drawer actions back to hidden file inputs.
3. Keep the Rust path-processing command and JS helpers in place.
4. Fix the native plugin separately without touching asset sync schema.

Do not roll back:

- `assets` table
- `local_asset_cache`
- upload queue
- product `image_asset_id`

Those are still the correct local-first model.

## Completion Criteria

- Android camera no longer uses WebView file input.
- Android gallery no longer depends on WebView `FileReader`.
- Both camera and gallery return app-cache paths.
- Rust compresses the temp original into WebP max 800px.
- Rust deletes the temp original after successful compressed persistence.
- Product save remains local-first.
- Upload remains a Rust sync job.
- Targeted logcat shows native picker and Rust path-processing logs.
- Focused frontend tests, Rust tests, typecheck, Ultracite, and Android Kotlin compile pass.
