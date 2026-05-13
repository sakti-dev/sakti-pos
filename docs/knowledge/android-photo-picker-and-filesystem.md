# Android Photo Picker And Filesystem

Date: 2026-05-13

This note documents the Android photo picking decision for the POS app. Read it with `docs/knowledge/pos-product-photo-jobs-and-asset-sync.md`.

## Decision

Use a hybrid native approach:

- Gallery selection uses `tauri-plugin-android-fs`.
- Camera capture stays in our custom Android plugin.
- Rust exposes one stable command, `pick_product_photo`, to the frontend.
- Frontend code never talks to Android-FS or the custom camera plugin directly.

This keeps the frontend API stable while reducing custom Android surface area.

## Why Gallery Moved To Android-FS

Gallery file selection is mostly Android Storage Access Framework plumbing:

- opening the system picker
- receiving a `content://` URI
- reading bytes through a content resolver
- deriving a display name and MIME type
- copying the selected bytes into app-private cache

That is generic filesystem/picker behavior. Maintaining our own implementation creates long-term risk around Android versions, URI permissions, MIME handling, and content provider quirks. Android-FS already owns that problem.

Our Rust wrapper still copies the picked content into:

```text
app cache/product_photo_inputs/<generated-name>.<extension>
```

That path is important because persisted photo jobs reference it.

## Why Camera Stays Custom

The camera path is not only "pick an image". It must integrate with our product-photo lifecycle:

- create an app-owned capture target
- return a stable local path for a persisted photo job
- return a small preview for instant UI rendering
- avoid base64-only full image transfer through the frontend
- let Rust own compression settings and WebP asset creation

The community native camera plugin is useful for generic camera capture, but its model is not a direct fit for this product-photo pipeline. Our problem is not just capturing a photo; it is capturing a durable job input and later producing a 400px WebP product-card asset.

We may revisit the camera plugin later if it can cleanly return durable file paths and avoid fighting our compression/job model. Until then, keeping the custom camera path is less risky than adapting a plugin around the wrong ownership model.

## Ownership Contract

The product form owns:

- source choice: `camera` or `gallery`
- immediate preview UI
- saving the product row
- enqueueing a persisted photo job
- triggering `syncNow()`

Rust owns:

- choosing the Android native picker implementation
- copying gallery content into app-private cache
- creating camera temp files
- generating preview bytes returned to the frontend
- processing persisted photo jobs
- compressing to product-card WebP
- deleting temp inputs after job success

Android-FS owns:

- gallery picker UI
- content URI reads
- content MIME/name helpers

Custom Android plugin owns:

- camera intent
- camera output file creation
- camera capture result handling

## Critical Rules

- Do not delete `product_photo_inputs` on app startup.
- Do not store gallery `content://` URIs in SQLite photo jobs.
- Do not require broad gallery read permissions for gallery picking.
- Do not process photo jobs directly from the form.
- Do not upload product rows before photo jobs have had a chance to link `image_asset_id`.
- Do not let frontend feature code depend on Android-FS APIs.

## Android Permissions

Gallery selection should not require broad media read permissions because the system picker grants access to the selected item.

The app still needs camera permission for camera capture:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

If a future change reintroduces `READ_EXTERNAL_STORAGE` or `READ_MEDIA_IMAGES`, verify why it is required. It should not be needed for the current gallery picker flow.

## Restart And Rebuild Rules

Use these rules when testing changes:

- Frontend-only TypeScript/Solid changes: dev server hot reload is usually enough.
- API-only changes: restart `bun api:dev`.
- Rust command changes: rebuild and reinstall the Android app.
- Kotlin plugin changes: rebuild and reinstall the Android app.
- `Cargo.toml`, `Cargo.lock`, Tauri plugin, capability, or Android manifest changes: rebuild and reinstall the Android app.

For Android builds, use the Tauri build path from `apps/pos-app/scripts/dev` or an equivalent distrobox command. Raw Gradle tasks can miss the Rust cross-linker environment and fail even when the Tauri Android build is valid.

Example release APK verification command:

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app && bun tauri android build --target aarch64 --apk'
```

## Logcat Command

Use this when testing product photos on device:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE '\[PHOTO-DEBUG\]|product_photo_job|product_photo_jobs|asset_sync|asset_upload|asset_hydration|hydrate_asset|upload_asset|presign|complete-upload|processing_failed|failed|error|query_failed|commit|rollback'
```

Healthy upload sequence:

```text
pick_product_photo:done
product_photo_job:enqueued
product_photo_job:done
upload_asset:put_done
upload_asset:complete_done
asset_upload_queue_finished {"uploadedCount":1}
```

Healthy hydration sequence after reinstall or cache miss:

```text
hydrate_product_images:ready count=N
hydrate_asset:download_done
hydrate_product_images:done hydrated=N
```

Healthy cached hydration sequence:

```text
hydrate_asset:skip_cached
```

Problem markers:

```text
processing_failed
query_failed
rollback
SignatureDoesNotMatch
Missing x-amz-content-sha256
No date provided in x-amz-date nor date header
product_photo_job:failed
upload_asset:failed
hydrate_asset:failed
```

## Verification Checklist

Before changing this area, run the relevant checks:

```bash
cd apps/pos-app/src-tauri && cargo test --lib
```

```bash
distrobox enter dev -- /bin/bash -lc 'set -euo pipefail; export ANDROID_HOME="$HOME/Android/Sdk"; export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"; export JAVA_HOME="$HOME/android-studio/jbr"; cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src-tauri/gen/android && ./gradlew :app:testArmDebugUnitTest --tests "com.sakti_dev.sakti_pos.photo.ProductPhotoPluginTest"'
```

```bash
cd apps/pos-app && bun run test
```

```bash
cd apps/pos-app && bun run typecheck
```

```bash
cd apps/pos-app && bun x ultracite check
```

For native Android changes, also run a Tauri Android build through distrobox.
