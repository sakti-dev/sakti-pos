## Why

Five prior OpenSpec changes progressively built `tauri-plugin-image-pipeline` through extraction (change 1), Android compression (change 2), picker ownership (change 3), vendored picker (change 4), and simplification (change 5). The JS-side simplification was committed and is working on Android, but the Rust-side simplify changes were lost when the plugin was moved to a git submodule at `vendor/tauri-plugin-image-pipeline/`. The submodule currently has the old 11-command version while the JS consumer expects 4 commands. Additionally, the vendored `tauri-plugin-dialog` dependency was deleted instead of preserved — the plugin should be fully self-contained for consumers via a subtree-vendored dialog dependency.

## What Changes

- Rebuild the plugin crate inside `vendor/tauri-plugin-image-pipeline/` to match the JS-side contract: 4 commands (`pick_image`, `compress_asset`, `get_asset_path`, `delete_asset`), flat cache layout, no merchant_id, no job queue modules.
- Add `vendor/tauri-plugin-dialog/` as a git subtree inside the plugin submodule so the plugin is self-contained — consumers add one dependency, not two.
- Delete `job_queue.rs`, `pipeline.rs`, `queue_state.rs` and their tests.
- Simplify `lib.rs`, `commands.rs`, `dto.rs`, `cache.rs` to the 4-command surface.
- Regenerate permissions for exactly 4 commands.
- Update `guest-js/index.ts` to export only the 4 public functions.
- Keep `picker_stage.rs` (plugin-owned picker staging), `processor.rs` (desktop compression), `path_safety.rs`, `error.rs`.
- Keep Android Kotlin compressor behind the plugin boundary.

## Supersedes

- `tauri-plugin-image-pipeline` (base extraction, 13 commands, merchant-scoped cache)
- `tauri-plugin-image-pipeline-android` (Android compression spec)
- `tauri-plugin-image-pipeline-picker` (picker moves into plugin)
- `tauri-plugin-image-pipeline-vendored-picker` (vendored picker staging)
- `simplify-image-pipeline` (4-command simplification, flat cache, JS lifecycle)

## Capabilities

### New Capabilities

- `plugin-api-v2`: The 4-command public API surface, flat cache layout, smart asset path resolution, and event contract.
- `plugin-vendor-deps`: Subtree-vendored `tauri-plugin-dialog` inside the plugin crate, making the plugin self-contained for consumers.

### Modified Capabilities

None — this change defines the plugin crate only. The POS app JS side is already committed and correct.
