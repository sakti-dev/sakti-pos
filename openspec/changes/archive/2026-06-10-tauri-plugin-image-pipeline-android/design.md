## Context

`tauri-plugin-image-pipeline` already owns the image-processing boundary for Sakti POS. The missing piece is the Android backend: the system needs the same plugin-owned compression flow on Android, but the actual decode/resize/encode work must use Android platform APIs instead of the Rust desktop compressor.

The POS app should stay out of compression logic. Its job is to validate attachment targets, enqueue work, reconcile completed jobs, and present results. The Android compressor belongs behind the plugin boundary so the app does not fork image behavior by platform.

The repo already contains generated Android plugin examples under `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/...`. That is the correct place for the Kotlin implementation and it keeps the platform-specific code adjacent to the other mobile plugins rather than in app business logic.

## Goals / Non-Goals

**Goals:**
- Keep all image compression behind `tauri-plugin-image-pipeline`.
- Add an Android-native compressor that uses platform APIs for decode, EXIF correction, resize, preview generation, and encode.
- Preserve the existing output contract: final assets are WebP, previews are JPEG, and hashes are derived from the final encoded bytes.
- Ensure Android work runs off the main thread and returns explicit failures instead of silent fallbacks.
- Make the implementation test-first so Android behavior is locked by failing tests before code lands.

**Non-Goals:**
- Redesign the job queue or reconciliation protocol.
- Move asset persistence or business validation into Kotlin.
- Add new image formats or a format auto-detection layer.
- Replace the existing desktop Rust compressor.

## Decisions

### 1. Keep compression behind the plugin boundary

The plugin remains the only place where image compression happens. The app only passes source bytes and metadata into the plugin and consumes results after reconciliation.

Why this choice:
- It keeps business behavior centralized.
- It prevents the app from growing a second compression stack.
- It makes Android and desktop behavior easier to test against the same contract.

Alternative considered:
- App-owned Android compression helpers. Rejected because that duplicates codec logic and makes the boundary inconsistent.

### 2. Use a Kotlin Android compressor for Android targets

Android compression will be implemented in Kotlin using Android platform APIs, not in Rust. The Kotlin side handles decode, EXIF orientation, resize, and encoding.

Suggested shape:

```kotlin
interface AndroidImageCompressor {
    suspend fun compress(request: ImageCompressionRequest): ImageCompressionResult
    suspend fun generatePreview(request: ImagePreviewRequest): ImageCompressionResult
}
```

The compressor should use `BitmapFactory` for decode, `ExifInterface` for orientation, and `Bitmap.compress(...)` for encode.

Alternative considered:
- Porting the Rust compressor to Android through a native layer. Rejected because the spec explicitly wants the platform compressor and Kotlin already matches the Android runtime APIs.

### 3. Select WebP by API level, with no fallback format

Final assets on Android will be encoded as WebP:
- API 30+ uses `Bitmap.CompressFormat.WEBP_LOSSY`
- API 24 through 29 uses legacy `Bitmap.CompressFormat.WEBP`

Preview output stays JPEG at quality 75 so the existing plugin response shape remains stable.

Why this choice:
- It matches the current contract for processed assets.
- It avoids inventing a cross-format fallback path that would violate output expectations.

Alternative considered:
- Falling back to JPEG when WebP fails. Rejected because it changes asset semantics and makes hashes and content types less predictable.

### 4. Run compression work off the main thread

All decode, resize, preview, and encode work must execute on a background dispatcher such as `Dispatchers.Default` or `Dispatchers.IO`.

Suggested shape:

```kotlin
suspend fun compress(request: ImageCompressionRequest): ImageCompressionResult =
    withContext(Dispatchers.Default) {
        val bitmap = decode(request.source)
        val oriented = applyExif(bitmap, request.source)
        val resized = resize(oriented, request.maxLongEdge)
        encodeWebp(resized, request.quality)
    }
```

Why this choice:
- Large images can trigger long-running decode and encode work.
- Main-thread execution risks ANRs and makes the plugin unreliable under device load.

Alternative considered:
- Synchronous processing on the caller thread. Rejected because it is unsafe on Android.

### 5. Derive hashes from the final bytes only

The asset ID and content hash are computed after encoding, from the exact bytes written to cache.

Why this choice:
- It keeps identity aligned with the actual stored artifact.
- It avoids input-hash versus output-hash confusion across codecs and API levels.

Alternative considered:
- Hashing the source file before compression. Rejected because the output, not the input, is what the rest of the system stores and serves.

### 6. Keep previews separate from final assets

Preview generation remains a separate path even though it uses the same Android compressor stack. The preview is JPEG, smaller, and tuned for UI display.

Why this choice:
- The preview path is a UI concern, not a durable asset concern.
- It keeps the existing pending-preview contract stable.

Alternative considered:
- Reusing the final WebP output for previews. Rejected because previews need faster UI decode and smaller files.

## Risks / Trade-offs

- [Bitmap memory pressure on large inputs] → Cap the longest edge, keep decode/resize on a background dispatcher, and add tests with large fixtures.
- [Android API-level differences in WebP encoding] → Lock the API-level selection in tests for API 24-29 and 30+ separately.
- [Bridge complexity between Rust and Kotlin] → Keep the bridge narrow: request in, result out, no business logic in the mobile layer.
- [Drift between Android and desktop image output] → Treat platform-specific byte output as acceptable, but keep dimension, orientation, content type, and hash semantics strict for each backend.
- [Silent fallback bugs] → Explicitly fail on decode or encode errors and add regression tests that assert no alternate format is written.

## Migration Plan

1. Write the Android spec tests first, including failure cases for decode, encode, and wrong-thread execution.
2. Add the Kotlin Android compressor implementation in the generated Android plugin area.
3. Add the Rust-side Android bridge and target selection so the plugin dispatches to Kotlin only on Android builds.
4. Wire preview and final-asset processing through the new Android backend while leaving non-Android behavior unchanged.
5. Verify the result on an Android emulator for API 24-29 and API 30+.
6. If the change needs rollback, keep the plugin API stable and revert only the Android backend wiring; do not reintroduce app-owned compression.

## Verification Guide

Use this as the release gate for `tauri-plugin-image-pipeline`.

### Must pass

1. Rust plugin tests.
   - Command:
     ```bash
     cargo test --manifest-path tauri-plugin-image-pipeline/Cargo.toml
     ```
   - Purpose: DTO coverage, queue state behavior, backend selection, and plugin error mapping.

2. Kotlin JVM tests for pure Android compressor logic.
   - Command:
     ```bash
     cd apps/pos-app/src-tauri/gen/android
     ./gradlew :app:testUniversalDebugUnitTest
     ```
   - Purpose: decode, resize, preview, failure, and thread-confinement behavior that does not require a real device.

3. Host app Android runtime boot.
   - Command:
     ```bash
     cd apps/pos-app
     bash scripts/dev
     ```
   - Purpose: prove the plugin loads through the real POS app path, the Android bridge is reachable, and the app starts on the connected device/emulator.

### Should pass

4. Android log capture for the plugin path.
   - Command:
     ```bash
     logs/capture-adb-logcat.sh
     ```
   - Purpose: capture `ImagePipelinePlugin`, `compressImage`, `generatePreview`, and related asset logs for diagnosis.

5. One failure-path check.
   - Purpose: confirm decode or encode failures reject explicitly and do not write fallback assets.

### Optional

6. Android instrumentation or WebDriver E2E.
   - Use only if a change needs real Android APIs beyond JVM coverage or automated UI proof beyond the host app boot.

## Open Questions

- What is the exact bridge surface already preferred by the repo for mobile plugin calls in the generated Android module?
- Do we want any Android-specific cache filename decoration, or is the existing plugin cache key sufficient?
