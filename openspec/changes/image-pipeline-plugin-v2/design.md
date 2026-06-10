## Context

`vendor/tauri-plugin-image-pipeline/` is a git submodule (remote: `sakti-dev/tauri-plugin-image-pipeline`) currently at commit `c8f1faa` which contains the old 11-command version. The POS app's JS side has already been simplified to use exactly 4 commands (`pick_image`, `compress_asset`, `get_asset_path`, `delete_asset`) with a flat cache layout and no merchant_id. The Rust side must be rebuilt to match.

The plugin must be self-contained — a consumer should add one Cargo/npm dependency and get everything including the dialog picker. Currently `tauri-plugin-dialog` is a separate crates.io dependency; it should be subtree-vendored inside the plugin at `vendor/tauri-plugin-dialog/`.

The existing codebase inside the submodule has modules to keep and modules to delete:

**Keep**: `picker_stage.rs` (plugin-owned picker staging), `processor.rs` (desktop-only compression), `path_safety.rs`, `error.rs`, `cache.rs` (rewrite to flat layout), `commands.rs` (simplify to 4), `dto.rs` (simplify), `lib.rs` (simplify), `android/` (Kotlin compressor).

**Delete**: `job_queue.rs`, `pipeline.rs`, `queue_state.rs` and their test files (`tests/job_queue.rs`, `tests/queue_state.rs`, `tests/scaffold_api.rs`).

## Goals / Non-Goals

**Goals:**
- Rebuild the plugin crate to expose exactly 4 commands matching the JS consumer contract.
- Flat cache layout: `<cache>/assets/<assetId>.webp`, `<cache>/previews/<jobId_prefix>_preview.jpg`, `<cache>/picked/<jobId>.source`.
- Subtree-vendored `tauri-plugin-dialog` at `vendor/tauri-plugin-dialog/` so the plugin is self-contained.
- No app-domain concepts in any DTO (no merchant_id, entity_type, entity_id, attachment_field).
- Event-driven: `image_pipeline://job_completed` emitted after background compression.
- Smart `get_asset_path(assetId, jobId?)` with compressed → preview fallback → null.
- Preserve desktop Rust processor and Android Kotlin compressor behind the same plugin boundary.
- All existing JS-side tests and Android E2E continue passing without changes.

**Non-Goals:**
- Change the JS-side consumer code (already committed, correct, tested).
- Change the POS app Rust code (already deleted its `assets/` module).
- Add new image formats, cropping, rotation UI, or batch selection.
- Reintroduce a durable job queue — JS owns the lifecycle via baresync `writeTransaction`.
- Support `image_pipeline://job_failed` event — recovery marks pending as failed via JS Drizzle queries.

## Decisions

### 1. Four commands, no queue management

The plugin exposes exactly: `pick_image`, `compress_asset`, `get_asset_path`, `delete_asset`.

Why:
- The JS consumer already calls these 4 and nothing else.
- Lifecycle state (pending → compressed → ready → uploaded) is managed by the JS layer via baresync `writeTransaction` + Drizzle.
- A durable queue inside the plugin is unnecessary overhead — the SQLite assets table is the source of truth.

Alternative considered:
- Keep queue management commands for recovery. Rejected because JS recovery queries the assets table directly and marks stuck assets as `failed` without re-compressing (staged source is cleaned up after pick).

### 2. Split pick and compress into separate commands

`pick_image` opens the picker, stages the source, generates a preview, and returns immediately. `compress_asset` is called separately by JS at submit time with `{ assetId, jobId, stagedSourcePath, maxLongEdge, quality }`.

Why:
- The product form needs to create an asset row via `writeTransaction` (with status `pending`) before compression starts, so the asset has an ID for the sync outbox.
- This matches the actual JS flow: pick → form submit → `writeTransaction` creates asset row → `compressAsset` fire-and-forget → event listener updates asset to `compressed` → upload.

Alternative considered:
- Auto-compress inside `pick_image` (change 3's design). Rejected because the asset row doesn't exist yet at pick time, so there's no ID for the compressed file path.

### 3. Flat cache layout, no merchant directories

Cache paths use only the asset ID or job ID:
- Compressed: `<cache_root>/assets/<assetId>.webp`
- Preview: `<cache_root>/previews/<jobId_prefix>_preview.jpg`
- Staged source: `<cache_root>/picked/<jobId>.source`

Why:
- The plugin is domain-agnostic. Merchant scoping is a POS app concern, not a plugin concern.
- Flat layout simplifies path construction and cleanup.

Alternative considered:
- Keep merchant-scoped paths. Rejected because it requires the host app to pass merchant_id into every plugin call, coupling the plugin to the host's domain model.

### 4. Subtree-vendored tauri-plugin-dialog

Add `tauri-plugin-dialog` as a git subtree at `vendor/tauri-plugin-dialog/` inside the plugin crate. Change `Cargo.toml` from `tauri-plugin-dialog = "2"` to `tauri-plugin-dialog = { path = "vendor/tauri-plugin-dialog" }`.

Why:
- The plugin is intended as a public, standalone Tauri plugin. Consumers should add one dependency, not two.
- Subtree keeps the dialog source inside the plugin repo, updateable via `git subtree pull`.
- This was the intent of the vendored-picker change (change 4) before the directory was lost.

Alternative considered:
- Keep dialog as a crates.io dependency. Rejected because it defeats the "one dependency" goal and forces consumers to also add `tauri-plugin-dialog` separately.
- Git submodule for dialog. Rejected because nested submodules are fragile and subtree is simpler for a single-directory dependency.

### 5. Event name: `image_pipeline://job_completed`

The single event emitted after `compress_asset` succeeds. Payload: `{ jobId, contentHash, byteSize, width, height, contentType, originalFilename }`.

Why:
- Matches the JS `lifecycle.ts` listener that's already committed and tested.
- The `assetPath` field is intentionally omitted from the event — the JS listener doesn't need it because it queries the asset by `jobId` from the database and then uses `get_asset_path` for display.

Alternative considered:
- Include `assetPath` in the payload. Unnecessary — JS already has the asset ID and uses `get_asset_path` for resolution.

### 6. Smart asset path resolution

`get_asset_path(assetId, jobId?)` checks:
1. Compressed file at `<cache>/assets/<assetId>.webp` → return it
2. Preview file at `<cache>/previews/<jobId_prefix>_preview.jpg` (if jobId provided) → return it
3. Neither → return null

Why:
- Matches the committed `cache.ts` `resolveAssetUrl()` implementation.
- Allows the UI to show a preview while the compressed version is still being uploaded.

### 7. Staged source and preview cleanup after compress

After `compress_asset` succeeds and emits the event, the plugin deletes the staged source file and preview file.

Why:
- Staged source is only needed for compression. Once compressed, it's dead weight.
- Preview is replaced by the compressed file for display. Keeping it around wastes storage.

### 8. Keep Android Kotlin compressor unchanged

The Android Kotlin code in `android/src/` stays as-is. It handles decode, EXIF, resize, WebP encode behind the plugin boundary. The Rust side calls through `PluginHandle::run_mobile_plugin` on Android targets.

Why:
- It's already implemented and tested.
- No functional changes needed — the compression math and output format are the same.

## Risks / Trade-offs

- **Subtree merge complexity**: Updating the vendored dialog requires `git subtree pull` which can produce merge conflicts. Mitigate by pinning to a specific tag and only updating intentionally.
- **No durable queue means no crash recovery for in-flight compress**: If the app crashes during `compress_asset`, the staged source is lost and JS recovery marks the asset as `failed`. This is acceptable because the user can re-pick the image.
- **Plugin repo must be committed and pushed**: The simplified version must be committed to the submodule's remote before sakti-pos can build against it. The work happens inside `vendor/tauri-plugin-image-pipeline/` and is pushed to `sakti-dev/tauri-plugin-image-pipeline`.
- **Tests for deleted modules must be removed**: `tests/job_queue.rs`, `tests/queue_state.rs`, `tests/scaffold_api.rs` test code that no longer exists. `tests/pick_image_contract.rs` and `tests/dto_error.rs` need updating for the new DTOs.
