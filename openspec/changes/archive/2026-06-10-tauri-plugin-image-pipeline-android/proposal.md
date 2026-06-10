## Why

Sakti POS needs a single compression path for product images so business logic stays outside the UI layer and image handling remains owned by `tauri-plugin-image-pipeline`. The current gap is the Android backend: the plugin contract exists, but the platform-native compressor behavior is not yet specified tightly enough for a separate implementation team or a smaller model to implement without guessing.

## What Changes

- Define the Android image compression path as a plugin-owned capability, not an app-owned helper.
- Require the POS app to call `tauri-plugin-image-pipeline` for image compression on all platforms.
- Specify that Android uses a platform-specific Kotlin compressor behind the plugin boundary.
- Specify that non-Android targets continue to use the Rust compressor behind the same plugin API.
- Clarify the expected output contract for Android compression, including decoded image handling, EXIF correction, resize rules, content type, and error behavior.
- Add implementation guidance and tests that force a test-first workflow for the Android backend before production code lands.
- **BREAKING** remove any expectation that the POS app, guest JS, or shared UI code compresses images directly.

## Capabilities

### New Capabilities
- `android-image-compression`: Android-specific compression and preview generation implemented through `tauri-plugin-image-pipeline` with a Kotlin platform compressor.

### Modified Capabilities
- None.

## Impact

- `tauri-plugin-image-pipeline`: adds Android-specific processing behavior and keeps compression logic behind the plugin API.
- Android app module generated from Tauri: adds the Kotlin-side compressor implementation and its tests.
- POS app Rust integration: continues to orchestrate enqueue/reconcile flows but does not implement compression itself.
- OpenSpec artifacts: adds a new spec for Android compression and a delta update to the existing image-processing contract.
- Verification workflow: adds TDD-oriented test cases for codec selection, EXIF handling, resize behavior, output format, and failure paths.
