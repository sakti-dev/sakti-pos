# Rust Crate Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the Tauri Rust crate into stable domain modules so future development can add assets, sync, Android integrations, and hardware features without growing giant files.

**Architecture:** Keep `src-tauri/src/lib.rs` as thin app wiring. Move implementation into domain modules: `app`, `db`, `sync`, `assets`, `android`, and `hardware`. Rename generic asset pipeline commands while preserving product-specific database linkers only where the schema is product-specific.

**Tech Stack:** Rust, Tauri, SQLx SQLite, Vitest-triggered Tauri commands from TS, Cargo tests, `cargo fmt`, `rtk`.

---

## Target Structure

```text
apps/pos-app/src-tauri/src/
  main.rs
  lib.rs
  logging.rs
  time_utils.rs

  app/
    mod.rs
    state.rs
    startup.rs

  db/
    mod.rs
    sqlite.rs
    migrations.rs
    drizzle_proxy.rs

  sync/
    mod.rs
    commands.rs
    dto.rs
    local_state.rs
    outbox.rs
    pull.rs
    push.rs
    protobuf.rs
    schema.rs

  assets/
    mod.rs
    commands.rs
    dto.rs
    image.rs
    cache.rs
    targets.rs
    processing_jobs.rs
    upload_queue.rs
    hydration.rs

  android/
    mod.rs
    fs.rs
    photo_picker.rs

  hardware/
    mod.rs
    printer.rs
```

## Naming Rules

- Generic image/asset pipeline names:
  - `upload_pending_assets`
  - `hydrate_missing_assets`
  - `get_pending_asset_preview`
  - `prepare_local_image_asset`
  - `prepare_local_image_asset_from_path`
- Product-specific names stay only when the product schema is directly referenced:
  - `update_product_image_asset_id`
  - `product_image_link` logs
  - TS product UI wrapper names such as `getPendingProductPhotoPreviewUrl`
- Do not use dynamic table/column SQL for asset attachment. Use explicit target registry/linkers in `assets/targets.rs`.

---

### Task 1: Establish App State Module

**Files:**
- Create: `apps/pos-app/src-tauri/src/app/mod.rs`
- Create: `apps/pos-app/src-tauri/src/app/state.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/sync.rs`
- Modify: `apps/pos-app/src-tauri/src/drizzle_proxy.rs`

**Step 1: Write the failing compile change**

Create `app/state.rs` with:

```rust
use sqlx::SqlitePool;

pub struct AppState {
    pub db_pool: SqlitePool,
}
```

Create `app/mod.rs`:

```rust
pub mod state;
```

In `lib.rs`, add:

```rust
mod app;
```

and change:

```rust
handle.manage(drizzle_proxy::AppState { db_pool: pool });
```

to:

```rust
handle.manage(app::state::AppState { db_pool: pool });
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: FAIL because `assets.rs` and `sync.rs` still import `crate::drizzle_proxy::AppState`.

**Step 2: Implement minimal migration**

In `assets.rs` and `sync.rs`, replace:

```rust
use crate::drizzle_proxy::AppState;
```

with:

```rust
use crate::app::state::AppState;
```

Remove `AppState` from `drizzle_proxy.rs`.

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
rtk cargo fmt --manifest-path apps/pos-app/src-tauri/Cargo.toml --check
```

Expected: PASS.

---

### Task 2: Move Database Utilities Into `db/`

**Files:**
- Create: `apps/pos-app/src-tauri/src/db/mod.rs`
- Move: `apps/pos-app/src-tauri/src/db_utils.rs` -> `apps/pos-app/src-tauri/src/db/sqlite.rs`
- Move: `apps/pos-app/src-tauri/src/migration_discovery.rs` -> `apps/pos-app/src-tauri/src/db/migrations.rs`
- Move: `apps/pos-app/src-tauri/src/drizzle_proxy.rs` -> `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify imports in moved files.

**Step 1: Write the failing move**

Create `db/mod.rs`:

```rust
pub mod drizzle_proxy;
pub mod migrations;
pub mod sqlite;
```

Move files to the target paths.

In `lib.rs`, replace:

```rust
mod db_utils;
mod drizzle_proxy;
```

with:

```rust
mod db;
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml drizzle_proxy::tests
```

Expected: FAIL because old module paths no longer resolve.

**Step 2: Fix paths**

In `db/drizzle_proxy.rs`, replace:

```rust
use crate::{db_utils, migration_discovery};
```

with:

```rust
use crate::db::{migrations, sqlite};
```

Rename calls:

```rust
db_utils::get_app_db_path -> sqlite::get_app_db_path
db_utils::sqlx_value_to_json -> sqlite::sqlx_value_to_json
migration_discovery::collect_migration_files -> migrations::collect_migration_files
```

In `sync.rs`, replace:

```rust
use crate::db_utils;
```

with:

```rust
use crate::db::sqlite;
```

and update call sites.

In `lib.rs`, update:

```rust
drizzle_proxy::init_db
drizzle_proxy::run_sql
drizzle_proxy::run_sql_batch
drizzle_proxy::get_db_info
```

to:

```rust
db::drizzle_proxy::init_db
db::drizzle_proxy::run_sql
db::drizzle_proxy::run_sql_batch
db::drizzle_proxy::get_db_info
```

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml drizzle_proxy::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::sqlite_proxy_uses_a_single_connection
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS. If test module paths changed, use the new paths printed by Cargo.

---

### Task 3: Move Android Modules Into `android/`

**Files:**
- Create: `apps/pos-app/src-tauri/src/android/mod.rs`
- Move: `apps/pos-app/src-tauri/src/android_fs.rs` -> `apps/pos-app/src-tauri/src/android/fs.rs`
- Move: `apps/pos-app/src-tauri/src/photo_picker.rs` -> `apps/pos-app/src-tauri/src/android/photo_picker.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify imports in moved files.

**Step 1: Write the failing move**

Create `android/mod.rs`:

```rust
pub mod fs;
pub mod photo_picker;
```

Move the files.

In `lib.rs`, replace:

```rust
mod android_fs;
mod photo_picker;
```

with:

```rust
mod android;
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml android_fs::tests photo_picker::tests
```

Expected: FAIL because old module paths are gone.

**Step 2: Fix paths**

In `android/photo_picker.rs`, replace:

```rust
crate::android_fs::pick_gallery_to_product_photo_input
```

with:

```rust
crate::android::fs::pick_gallery_to_product_photo_input
```

In `android/fs.rs`, replace:

```rust
crate::photo_picker::PickedProductPhoto
crate::photo_picker::picked_product_photo_from_path
crate::photo_picker::ProductPhotoSource
```

with:

```rust
crate::android::photo_picker::PickedProductPhoto
crate::android::photo_picker::picked_product_photo_from_path
crate::android::photo_picker::ProductPhotoSource
```

In `lib.rs`, update:

```rust
.plugin(photo_picker::init())
photo_picker::pick_product_photo
photo_picker::delete_temp_product_photo
```

to:

```rust
.plugin(android::photo_picker::init())
android::photo_picker::pick_product_photo
android::photo_picker::delete_temp_product_photo
```

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml android::fs::tests android::photo_picker::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 4: Move Hardware Printer Into `hardware/`

**Files:**
- Create: `apps/pos-app/src-tauri/src/hardware/mod.rs`
- Move: `apps/pos-app/src-tauri/src/printer.rs` -> `apps/pos-app/src-tauri/src/hardware/printer.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing move**

Create `hardware/mod.rs`:

```rust
pub mod printer;
```

Move `printer.rs` to `hardware/printer.rs`.

In `lib.rs`, replace:

```rust
mod printer;
```

with:

```rust
mod hardware;
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml printer::tests
```

Expected: FAIL because `printer` moved.

**Step 2: Fix paths**

In `lib.rs`, update:

```rust
.plugin(printer::init())
printer::list_paired_thermal_printers
printer::test_thermal_printer
printer::print_thermal_receipt
printer::request_bluetooth_permission
```

to:

```rust
.plugin(hardware::printer::init())
hardware::printer::list_paired_thermal_printers
hardware::printer::test_thermal_printer
hardware::printer::print_thermal_receipt
hardware::printer::request_bluetooth_permission
```

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml hardware::printer::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 5: Extract Asset DTOs

**Files:**
- Create: `apps/pos-app/src-tauri/src/assets/dto.rs`
- Create or update: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write the failing move**

Create `assets/dto.rs` and move these types from `assets.rs`:

```rust
ProcessedImageResponse
CachedAssetResponse
CachedAssetDataResponse
PreparedAssetRecord
PreparedLocalAssetResponse
EnqueueAssetProcessingRequest
EnqueueAssetProcessingResponse
AssetAttachmentTarget
AssetAttachmentReadyPayload
AssetCacheReadyPayload
PendingProductPhotoPreviewResponse
ProductPhotoPreview
PreparedImageInput
PendingAssetProcessingJobRecord
PendingUploadAsset
LocalAssetPersistState
```

At top of `assets.rs`, add:

```rust
mod dto;
use dto::*;
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests
```

Expected: FAIL due to private visibility and unresolved imports.

**Step 2: Fix visibility minimally**

In `assets/dto.rs`, mark types and fields as `pub(super)` where only asset modules need them, and `pub` only for Tauri command response/request types used externally.

Rules:
- Tauri command request/response structs: `pub`
- Internal records: `pub(super)`
- Event payloads: `pub(super)`

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 6: Extract Asset Image Processing

**Files:**
- Create: `apps/pos-app/src-tauri/src/assets/image.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/android/fs.rs`

**Step 1: Write the failing move**

Move pure image functions/constants:

```rust
MAX_LONG_EDGE
PREVIEW_MAX_LONG_EDGE
ASSET_IMAGE_PREVIEW_MIME_TYPE
WEBP_QUALITY
WEBP_METHOD
fit_within_max_edge
decode_image_bytes
read_exif_orientation
apply_exif_orientation
decode_oriented_image_bytes
process_image_bytes
product_photo_preview_from_bytes
```

Rename:

```rust
PRODUCT_PHOTO_PREVIEW_MIME_TYPE -> ASSET_IMAGE_PREVIEW_MIME_TYPE
product_photo_preview_from_bytes -> asset_image_preview_from_bytes
ProductPhotoPreview -> AssetImagePreview
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests::process_image_bytes_resizes_and_encodes_webp
```

Expected: FAIL until imports and renamed calls are fixed.

**Step 2: Fix imports and callers**

In `assets.rs`:

```rust
mod image;
use image::{asset_image_preview_from_bytes, process_image_bytes};
```

In `android/fs.rs`, replace:

```rust
crate::assets::product_photo_preview_from_bytes
```

with:

```rust
crate::assets::image::asset_image_preview_from_bytes
```

Expose the module as needed:

```rust
pub(crate) mod image;
```

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests::process_image_bytes_resizes_and_encodes_webp
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml android::fs::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 7: Extract Asset Cache

**Files:**
- Create: `apps/pos-app/src-tauri/src/assets/cache.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write the failing move**

Move cache/path helpers:

```rust
validate_object_key
asset_relative_path
asset_object_key
asset_cache_file_path_from_root
asset_cache_root
write_cached_asset
cache_asset_webp
read_cached_asset_data
sha256_hex
normalize_original_filename
is_deletable_photo_input_path
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests::asset_cache_path_rejects_traversal
```

Expected: FAIL until imports and visibility are fixed.

**Step 2: Fix imports and visibility**

In `assets.rs`:

```rust
mod cache;
use cache::{asset_object_key, read_cached_asset_data, write_cached_asset};
```

Keep Tauri commands exported through `assets.rs`:

```rust
pub use cache::{cache_asset_webp, read_cached_asset_data};
```

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 8: Extract Asset Target Registry And Linkers

**Files:**
- Create: `apps/pos-app/src-tauri/src/assets/targets.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write the failing move**

Move:

```rust
SupportedAssetAttachmentTarget
SUPPORTED_ASSET_ATTACHMENT_TARGETS
unsupported_asset_attachment_target_error
supported_asset_attachment_target
validate_asset_attachment_target
update_product_image_asset_id
resolve_asset_target_merchant_id
link_asset_to_attachment_target
asset_kind_for_processing_job
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests::supported_asset_attachment_target_metadata_is_centralized
```

Expected: FAIL until imports and test paths are fixed.

**Step 2: Fix imports and visibility**

In `targets.rs`, expose:

```rust
pub(super) fn validate_asset_attachment_target(...)
pub(super) async fn resolve_asset_target_merchant_id(...)
pub(super) async fn link_asset_to_attachment_target(...)
pub(super) fn asset_kind_for_processing_job(...)
```

Keep `update_product_image_asset_id` private inside `targets.rs`.

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests::supported_asset_attachment_target_metadata_is_centralized
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests
```

Expected: PASS.

---

### Task 9: Extract Asset Processing Jobs

**Files:**
- Create: `apps/pos-app/src-tauri/src/assets/processing_jobs.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write the failing move**

Move:

```rust
write_pending_asset_processing_preview
pending_asset_preview_file_path
is_valid_pending_product_photo_job_status
reset_incomplete_pending_asset_processing_jobs
load_pending_asset_processing_jobs
claim_pending_asset_processing_job
mark_pending_asset_processing_job_failed
delete_pending_asset_processing_job
get_pending_product_photo_preview_inner
get_pending_product_photo_preview
process_pending_asset_jobs_inner
process_pending_asset_jobs
enqueue_asset_processing
```

Rename generic preview command:

```rust
get_pending_product_photo_preview -> get_pending_asset_preview
PendingProductPhotoPreviewResponse -> PendingAssetPreviewResponse
```

Keep a TS product wrapper if needed on the frontend:

```ts
getPendingProductPhotoPreviewUrl(productId)
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests::pending_product_photo_preview_reads_pending_asset_job_preview
```

Expected: FAIL until renamed command/test imports are fixed.

**Step 2: Fix command registration and TS invocation**

In `lib.rs`, replace:

```rust
assets::get_pending_product_photo_preview
assets::process_pending_asset_jobs
assets::enqueue_asset_processing
```

with:

```rust
assets::get_pending_asset_preview
assets::process_pending_asset_jobs
assets::enqueue_asset_processing
```

In `apps/pos-app/src/lib/product-images/pending.ts`, update `invoke`:

```ts
invoke<PendingProductPhotoPreview | null>("get_pending_asset_preview", {
  target: createAssetProcessingTarget("productImage", productId),
})
```

If this creates too much frontend churn, keep a Rust compatibility command for one release:

```rust
pub async fn get_pending_product_photo_preview(product_id: String, state: State<'_, AppState>)
```

that delegates to `get_pending_asset_preview`.

**Step 3: Verify**

Run:

```bash
rtk bun --filter @repo/pos-app test src/lib/product-images/__test__/pending.test.ts src/components/__test__/product-image.test.tsx
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 10: Extract Asset Upload Queue

**Files:**
- Create: `apps/pos-app/src-tauri/src/assets/upload_queue.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: frontend callers/tests if command names change.

**Step 1: Write the failing rename test**

Update frontend upload queue helper test to expect generic command:

```ts
expect(mockInvoke).toHaveBeenCalledWith("upload_pending_assets", ...)
```

Run:

```bash
rtk bun --filter @repo/pos-app test src/lib/product-images/__test__/upload-queue.test.ts
```

Expected: FAIL if the test exists and command is still product-named. If no test exists, add one before implementation.

**Step 2: Move and rename Rust upload command**

Move:

```rust
build_api_client
build_signed_url_client
post_protobuf
presign_response_means_already_ready
asset_headers_to_map
put_bytes_to_signed_url
load_pending_upload_assets
mark_asset_uploading
mark_asset_upload_failed
mark_asset_ready
mark_reused_asset_ready
upload_pending_product_images
```

Rename:

```rust
upload_pending_product_images -> upload_pending_assets
```

Keep logs generic where possible:

```text
upload_pending_assets:start
upload_pending_assets:done
```

**Step 3: Update frontend helper names**

Rename TS helper if present:

```ts
requestUploadPendingProductImages -> requestUploadPendingAssets
```

If the UI still wants product-specific naming, keep a wrapper at the product-image layer, but the Rust command should be generic.

**Step 4: Verify**

Run:

```bash
rtk bun --filter @repo/pos-app test src/store/__test__/sync.test.ts src/lib/product-images/__test__/upload-queue.test.ts
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests
```

Expected: PASS.

---

### Task 11: Extract Asset Hydration

**Files:**
- Create: `apps/pos-app/src-tauri/src/assets/hydration.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify frontend cache/sync helpers/tests if command names change.

**Step 1: Write the failing rename test**

Update frontend cache/hydration tests to expect generic command:

```ts
expect(mockInvoke).toHaveBeenCalledWith("hydrate_missing_assets", ...)
```

Run:

```bash
rtk bun --filter @repo/pos-app test src/lib/product-images/__test__/cache.test.ts src/store/__test__/sync.test.ts
```

Expected: FAIL if command/helper is still product-named.

**Step 2: Move and rename Rust hydration command**

Move:

```rust
load_ready_assets
hydrate_product_images
```

Rename:

```rust
hydrate_product_images -> hydrate_missing_assets
```

Use generic logs:

```text
hydrate_missing_assets:start
hydrate_missing_assets:ready
hydrate_missing_assets:done
```

**Step 3: Update frontend helper names**

Rename TS helper if present:

```ts
hydrateMissingProductImages -> hydrateMissingAssets
```

Keep product UI wrappers only if they improve call-site clarity.

**Step 4: Verify**

Run:

```bash
rtk bun --filter @repo/pos-app test src/lib/product-images/__test__/cache.test.ts src/store/__test__/sync.test.ts
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests
```

Expected: PASS.

---

### Task 12: Create Asset Command Facade

**Files:**
- Create: `apps/pos-app/src-tauri/src/assets/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing move**

Move all `#[command]` functions from `assets.rs` into `assets/commands.rs`, or re-export command functions from submodules through `commands.rs`.

Preferred facade:

```rust
pub use super::cache::{cache_asset_webp, read_cached_asset_data};
pub use super::hydration::hydrate_missing_assets;
pub use super::image::process_image_to_webp;
pub use super::processing_jobs::{
    enqueue_asset_processing,
    get_pending_asset_preview,
    process_pending_asset_jobs,
};
pub use super::upload_queue::upload_pending_assets;
```

In `assets.rs`:

```rust
pub mod commands;
```

In `lib.rs`, use:

```rust
assets::commands::process_image_to_webp
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: FAIL until re-exports and handler paths are correct.

**Step 2: Fix handler paths**

Update all asset command handler paths in `lib.rs` to `assets::commands::*`.

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 13: Split Sync DTO And Schema

**Files:**
- Create: `apps/pos-app/src-tauri/src/sync/`
- Create: `apps/pos-app/src-tauri/src/sync/mod.rs`
- Create: `apps/pos-app/src-tauri/src/sync/dto.rs`
- Create: `apps/pos-app/src-tauri/src/sync/schema.rs`
- Modify or replace: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Write the failing move**

Create `sync/mod.rs` and move from `sync.rs`:

```rust
SYNC_TABLES
LOCAL_ONLY_COLUMNS
LocalSyncState
PushResult
PullResult
SyncNowResult
```

Move table/filter helpers to `schema.rs`:

```rust
get_table_filter_column
get_filter_value
camel_to_snake
snake_to_camel
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::build_push_request_encodes_outlet_and_payload_json
```

Expected: FAIL until module paths are fixed.

**Step 2: Fix imports and visibility**

Use `pub(super)` for helpers shared inside `sync`.

`sync/mod.rs` should declare:

```rust
mod commands;
mod dto;
mod local_state;
mod outbox;
mod protobuf;
mod pull;
mod push;
mod schema;

pub use commands::{
    get_sync_local_state,
    purge_synced_outbox,
    run_garbage_collection,
    sync_full_resync,
    sync_now,
    sync_pull,
    sync_pull_events,
    sync_push,
    sync_push_outbox,
};
```

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests
```

Expected: PASS.

---

### Task 14: Split Sync Protobuf And Outbox

**Files:**
- Create: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Create: `apps/pos-app/src-tauri/src/sync/outbox.rs`
- Modify: sync module files.

**Step 1: Write the failing move**

Move protobuf helpers:

```rust
protobuf_tables_to_json_map
build_sync_push_request
server_wins_to_skip_map
build_sync_pull_request
build_sync_pull_events_request
cursor_gap_requires_full_resync
```

Move outbox helpers:

```rust
count_pending_outbox
mark_outbox_synced_tx
mark_rows_synced_tx
read_unsynced_rows
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::protobuf_table_rows_decode_json_rows sync::tests::detects_cursor_gap_only_when_next_event_is_missing
```

Expected: FAIL until imports are fixed.

**Step 2: Fix imports and visibility**

Expose only what `push`, `pull`, and `commands` need with `pub(super)`.

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 15: Split Sync Push, Pull, Local State, Commands

**Files:**
- Create: `apps/pos-app/src-tauri/src/sync/push.rs`
- Create: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Create: `apps/pos-app/src-tauri/src/sync/local_state.rs`
- Create: `apps/pos-app/src-tauri/src/sync/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing move**

Move:

```rust
sync_push_inner -> push.rs
sync_pull_inner -> pull.rs
get_sync_local_state internals -> local_state.rs
sync_push, sync_pull, sync_push_outbox, sync_pull_events, sync_full_resync,
purge_synced_outbox, run_garbage_collection, sync_now -> commands.rs
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::push_response_server_wins_to_map_groups_ids_by_table sync::tests::pull_upsert_keeps_newer_local_dirty_rows
```

Expected: FAIL until imports are fixed.

**Step 2: Fix command facade**

In `sync/mod.rs`, re-export commands:

```rust
pub use commands::{
    get_sync_local_state,
    purge_synced_outbox,
    run_garbage_collection,
    sync_full_resync,
    sync_now,
    sync_pull,
    sync_pull_events,
    sync_push,
    sync_push_outbox,
};
```

No `lib.rs` changes should be needed if it still references `sync::sync_now`, etc.

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 16: Move App Startup Logic Out Of `lib.rs`

**Files:**
- Create: `apps/pos-app/src-tauri/src/app/startup.rs`
- Modify: `apps/pos-app/src-tauri/src/app/mod.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing extraction**

Move setup logic from `lib.rs`:

```rust
drizzle_proxy::init_db
handle.manage(AppState { db_pool: pool })
spawn reset_incomplete_pending_asset_processing_jobs
DB init failure logging
```

into:

```rust
pub fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>>
```

or:

```rust
pub fn setup_app(app: &mut tauri::App) -> tauri::Result<()>
```

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: FAIL until lifetimes/error types/imports are fixed.

**Step 2: Wire setup**

In `lib.rs`:

```rust
.setup(app::startup::setup_app)
```

Keep logging behavior unchanged.

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 17: Clean `lib.rs` Command Registration

**Files:**
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Verify current command paths compile**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS before cleanup.

**Step 2: Group command paths by domain**

Keep one `tauri::generate_handler!` but group entries:

```rust
assets::commands::...
android::photo_picker::...
db::drizzle_proxy::...
hardware::printer::...
sync::...
```

Do not introduce clever macro abstractions. Keep it searchable.

**Step 3: Verify**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

---

### Task 18: Add Rust Module Ownership README

**Files:**
- Create: `apps/pos-app/src-tauri/src/README.md`
- Modify: `AGENTS.md` if needed.

**Step 1: Write docs**

Create `apps/pos-app/src-tauri/src/README.md`:

```md
# Rust Module Layout

The Rust crate is organized by backend domain, not by command type.

- `app/`: app state and startup wiring.
- `db/`: SQLite setup, migrations, and Drizzle SQL proxy.
- `sync/`: offline-first push/pull/outbox/event sync.
- `assets/`: generic image asset pipeline, cache, upload, hydration, and safe attachment targets.
- `android/`: Android filesystem and native picker bridge.
- `hardware/`: device integrations such as thermal printers.
- `logging.rs`, `time_utils.rs`: small cross-cutting utilities.

Tauri commands should be thin wrappers. Put business logic in the owning domain module and keep SQL target-specific linkers explicit.
```

**Step 2: Verify docs references**

Run:

```bash
rtk rg -n "drizzle_proxy.rs|android_fs.rs|photo_picker.rs|printer.rs|assets.rs|sync.rs" AGENTS.md docs apps/pos-app/src-tauri/src/README.md
```

Expected: Review output manually. Update stale references only when they are intended source-of-truth docs, not historical plans.

---

### Task 19: Full Verification

**Files:**
- No code changes unless verification fails.

**Step 1: Rust formatting**

```bash
rtk cargo fmt --manifest-path apps/pos-app/src-tauri/Cargo.toml --check
```

Expected: exit 0.

**Step 2: Rust tests**

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: all Rust lib tests pass.

**Step 3: Frontend/command wrapper tests**

```bash
rtk bun --filter @repo/pos-app test src/lib/__test__/assets.test.ts src/lib/product-images/__test__/cache.test.ts src/lib/product-images/__test__/pending.test.ts src/lib/product-images/__test__/upload-queue.test.ts src/store/__test__/sync.test.ts src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: all selected tests pass. If a listed test file does not exist, remove it from the command and run the closest existing test discovered by `rtk rg --files apps/pos-app/src | rtk rg "__test__.*(asset|image|sync|product-form)"`.

**Step 4: Full POS tests**

```bash
rtk bun --filter @repo/pos-app test
```

Expected: all tests pass.

**Step 5: TypeScript typecheck**

```bash
rtk bun --filter @repo/pos-app typecheck
```

Expected: exit 0.

**Step 6: Stale Rust file scan**

```bash
rtk rg -n "mod android_fs|mod photo_picker|mod printer|mod drizzle_proxy|mod db_utils|mod migration_discovery|prepare_local_product_image_asset|upload_pending_product_images|hydrate_product_images|get_pending_product_photo_preview" apps/pos-app/src-tauri/src apps/pos-app/src docs/DOCUMENTED-LOG-PREFIX.md
```

Expected: no active source references to old module declarations or old generic asset command names. Product UI wrapper names may remain only if intentionally documented.

**Step 7: Android logcat verification command**

For image asset flow:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC):|native_picker|enqueue_asset_processing|prepare_local_image_asset|upload_pending_assets|hydrate_missing_assets|get_pending_asset_preview|asset_processing_job|product_image_link|resolve_cached_image'
```

For crash/native issues:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|PRINTER):|AndroidRuntime|libc|fatal|exception|crash'
```

Expected: app starts, product image creation still emits picker/enqueue/process/cache logs, sync still runs, printer commands compile and remain callable.

---

## Implementation Notes

- Use `rtk` for all commands.
- Do not run `nix develop`.
- Prefer `git mv` for file moves if committing manually later, but use normal filesystem moves only if needed by the tooling.
- Do not change behavior while moving modules unless the task explicitly says to rename a generic command.
- Keep visibility narrow:
  - `pub` only for Tauri commands and cross-domain APIs.
  - `pub(crate)` for crate-internal APIs used by another domain.
  - `pub(super)` for same-domain submodules.
- If a task becomes too large, stop after a passing compile and split the next move into a new task.
