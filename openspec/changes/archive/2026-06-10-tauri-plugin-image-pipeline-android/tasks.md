## 1. Red: Lock the Android contract in tests

- [x] 1.1 Add Android-side tests for final asset compression on API 24-29 and API 30+, asserting WebP output, quality 75, EXIF correction, preserved aspect ratio, and `content_type = "image/webp"`.
- [x] 1.2 Add Android-side tests for preview generation, asserting JPEG output, quality 75, and the existing plugin response shape.
- [x] 1.3 Add Android-side tests that prove decode failures and encode failures return explicit errors and do not write fallback assets.
- [x] 1.4 Add Rust-side tests for target selection so non-Android builds keep the Rust compressor and Android builds route through the Android backend.
- [x] 1.5 Add a background-thread test or instrumentation check that fails if Android decode or encode work runs on the main thread.

## 2. Green: Implement the Android Kotlin compressor

- [x] 2.1 Add the Android compressor class in the generated Tauri Android module alongside the existing mobile plugins.
- [x] 2.2 Implement Android decode, EXIF correction, resize, and WebP encode for final assets using the platform APIs and API-level-specific WebP selection.
- [x] 2.3 Implement Android preview generation as a separate JPEG path that reuses the same decode, EXIF, and resize logic.
- [x] 2.4 Run Android compression work on `Dispatchers.Default` or `Dispatchers.IO` so the main thread is never blocked by bitmap work.
- [x] 2.5 Return explicit processing errors for decode failures, encode failures, and unsupported inputs without silently changing the output format.

## 3. Green: Wire the plugin boundary

- [x] 3.1 Add the Rust-side Android bridge in `tauri-plugin-image-pipeline` so Android builds invoke the Kotlin compressor through the plugin boundary.
- [x] 3.2 Keep the existing desktop Rust compressor path intact for non-Android targets and ensure the build still excludes the Android backend there.
- [x] 3.3 Expose the same plugin-level request and response contract on both backends so the app does not branch on compression behavior.

## 4. Refactor and verify the cutover

- [x] 4.1 Verify the POS app continues to call only the plugin-owned image pipeline and does not reintroduce app-owned compression helpers.
- [x] 4.2 Run focused desktop and Android tests for the new compressor path and confirm the output hashes come from the final encoded bytes.
- [x] 4.3 Validate the generated Android module is registered in the app build and that the plugin implementation can be reached from the Android runtime.
