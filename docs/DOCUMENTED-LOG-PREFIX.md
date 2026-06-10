# POS Logging Prefixes

Purpose: canonical prefix inventory and logcat filters for current app behavior.
Scope: app log prefixes only, not feature walkthroughs or design rationale.
Related: `README.md`, `../adr/0001-use-tauri-plugin-log-with-structured-prefixes.md`
Last updated: 2026-06-10

Logs are production support evidence for the offline Android POS. Keep this document focused on the prefixes to grep.

Format:

```txt
[ORIGIN] [DOMAIN:ACTION] message key=value
```

Rules:

- `ORIGIN` is `JS` or `RUST`.
- `DOMAIN` is one of `ASSET`, `AUTH`, `DB`, `PHOTO`, `POS`, `PRINTER`, `SETTINGS`, `SYNC`, `UI`.
- Put variable data at the end as `snake_case=value`.
- JS actions come from `apps/pos-app/src/lib/logger.ts`; `load_printers:failed` becomes `LOAD_PRINTERS_FAILED`.

Useful grep:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST|ANDROID)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|\[baresync\]|IMAGE-PIPELINE|ImagePipelinePlugin|stage_content_uri|pending_asset_preview|enqueue_asset_processing|product_image_link|resolve_cached_image|snapshot_export_requested|snapshot_export_finished|snapshot_export_failed|snapshot_export_done'
```

Crash and native-failure follow-up:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST|ANDROID)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|\[baresync\]|IMAGE-PIPELINE|ImagePipelinePlugin|stage_content_uri|AndroidRuntime|libc|fatal|exception|crash|pending_asset_preview|enqueue_asset_processing|product_image_link|resolve_cached_image|snapshot_export_requested|snapshot_export_finished|snapshot_export_failed|snapshot_export_done'
```

## JS Prefixes

| Prefix | Source |
| --- | --- |
| `[JS] [ASSET:ASSET_ATTACHMENT_READY_RECEIVED]` | `lib/product-images/asset-events.ts` |
| `[JS] [ASSET:ASSET_CACHE_READY_RECEIVED]` | `lib/product-images/asset-events.ts` |
| `[JS] [ASSET:ASSET_CACHE_VERSION_INCREMENT]` | `store/asset-cache.ts` |
| `[JS] [ASSET:DOMAIN_CATALOG_VERSION_INCREMENT]` | `store/domain-catalog.ts` |
| `[JS] [ASSET:ENQUEUE_ASSET_PROCESSING_FAILED]` | `lib/assets.ts` |
| `[JS] [ASSET:ENQUEUE_ASSET_PROCESSING_INVOKE]` | `lib/assets.ts` |
| `[JS] [ASSET:ENQUEUE_ASSET_PROCESSING_RESULT]` | `lib/assets.ts` |
| `[JS] [ASSET:LISTENERS_ALREADY_STARTED]` | `lib/product-images/asset-events.ts` |
| `[JS] [ASSET:LISTENERS_STARTED]` | `lib/product-images/asset-events.ts` |
| `[JS] [ASSET:LISTENERS_STARTING]` | `lib/product-images/asset-events.ts` |
| `[JS] [ASSET:PROCESS_PENDING_ASSET_JOBS_FAILED]` | `lib/assets.ts` |
| `[JS] [ASSET:PROCESS_PENDING_ASSET_JOBS_INVOKE]` | `lib/assets.ts` |
| `[JS] [ASSET:PROCESS_PENDING_ASSET_JOBS_RESULT]` | `lib/assets.ts` |
| `[JS] [AUTH:CURRENT_CLOUD_STAFF_FAILED]` | `pages/login/use-cloud-auth-flow.ts` |
| `[JS] [AUTH:CURRENT_CLOUD_STAFF_REQUEST]` | `pages/login/use-cloud-auth-flow.ts` |
| `[JS] [AUTH:CURRENT_CLOUD_STAFF_RESULT]` | `pages/login/use-cloud-auth-flow.ts` |
| `[JS] [AUTH:LOCAL_CLOUD_STAFF_LOGIN_FAILED]` | `pages/login/use-cloud-auth-flow.ts` |
| `[JS] [AUTH:LOGIN_WITH_CLOUD_STAFF_LOCAL_SAMPLE]` | `store/auth.ts` |
| `[JS] [AUTH:LOGIN_WITH_CLOUD_STAFF_REQUEST]` | `store/auth.ts` |
| `[JS] [AUTH:LOGIN_WITH_CLOUD_STAFF_RESULT]` | `store/auth.ts` |
| `[JS] [AUTH:NETWORK_ERROR]` | `lib/auth/cloud.ts` |
| `[JS] [AUTH:OUTLET_SELECTED]` | `pages/login/use-cloud-auth-flow.ts` |
| `[JS] [AUTH:REQUEST]` | `lib/auth/cloud.ts` |
| `[JS] [AUTH:RESPONSE]` | `lib/auth/cloud.ts` |
| `[JS] [AUTH:CREATE_MERCHANT_FAILED]` | `pages/onboarding.tsx` |
| `[JS] [AUTH:CREATE_OUTLET_FAILED]` | `pages/onboarding.tsx` |
| `[JS] [AUTH:CREATE_PIN_FAILED]` | `pages/onboarding.tsx` |
| `[JS] [AUTH:STRONGHOLD_PERSIST_FAILED]` | `lib/auth/storage.ts` |
| `[JS] [AUTH:SYNC_FAILED]` | `pages/login/use-cloud-auth-flow.ts` |
| `[JS] [AUTH:SYNC_REQUEST]` | `pages/login/use-cloud-auth-flow.ts` |
| `[JS] [AUTH:SYNC_RESULT]` | `pages/login/use-cloud-auth-flow.ts` |
| `[JS] [DB:QUERY_FAILED]` | `db/index.ts` |
| `[JS] [DB:SNAPSHOT_EXPORT_FINISHED]` | `pages/settings/use-settings.ts` |
| `[JS] [DB:SNAPSHOT_EXPORT_REQUESTED]` | `pages/settings/use-settings.ts` |
| `[JS] [DB:SNAPSHOT_EXPORT_FAILED]` | `pages/settings/use-settings.ts` |
| `[JS] [PHOTO:ASSET_SYNC_FAILED]` | product form |
| `[JS] [PHOTO:ASSET_SYNC_FINISHED]` | product form |
| `[JS] [PHOTO:BACKGROUND_SYNC_TRIGGERED]` | product form |
| `[JS] [PHOTO:CLEAR_REQUESTED]` | product form — user cleared the photo selection |
| `[JS] [PHOTO:COMPRESS_ASSET_FAILED]` | product form — `compress_asset` command failed |
| `[JS] [PHOTO:DRAWER_OPENED]` | product form |
| `[JS] [PHOTO:DRAWER_STATE_CHANGED]` | product form |
| `[JS] [PHOTO:JOB_COMPLETED_APPLIED]` | ~~removed~~ — event listener lifecycle removed in deferred-compression |
| `[JS] [PHOTO:JOB_COMPLETED_BUFFERED]` | ~~removed~~ — event listener lifecycle removed in deferred-compression |
| `[JS] [PHOTO:JOB_FAILED_APPLIED]` | ~~removed~~ — event listener lifecycle removed in deferred-compression |
| `[JS] [PHOTO:JOB_FAILED_BUFFERED]` | ~~removed~~ — event listener lifecycle removed in deferred-compression |
| `[JS] [PHOTO:LISTENERS_STARTED]` | ~~removed~~ — event listener lifecycle removed in deferred-compression |
| `[JS] [PHOTO:LISTENERS_STARTING]` | ~~removed~~ — event listener lifecycle removed in deferred-compression |
| `[JS] [PHOTO:NATIVE_PICKER_FINISHED]` | product form |
| `[JS] [PHOTO:NATIVE_PICKER_REQUESTED]` | product form |
| `[JS] [PHOTO:NAVIGATE_TO_PRODUCT_LIST]` | product form |
| `[JS] [PHOTO:LISTENERS_STARTED]` | `lib/assets/image-upload.ts` — plugin job listeners attached |
| `[JS] [PHOTO:LISTENERS_STARTING]` | `lib/assets/image-upload.ts` — plugin job listeners about to attach |
| `[JS] [PHOTO:PATH_PROCESSING_STARTED]` | product form |
| `[JS] [PHOTO:PICK_IMAGE_COMMAND_INVOKED]` | `lib/assets/plugin-bridge.ts` — plugin `pick_image` command invoked |
| `[JS] [PHOTO:PICK_IMAGE_COMMAND_RETURNED]` | `lib/assets/plugin-bridge.ts` — plugin `pick_image` command returned |
| `[JS] [PHOTO:PICK_IMAGE_COMPLETED]` | `lib/assets/image-upload.ts` — plugin `pick_image` command completed successfully |
| `[JS] [PHOTO:PICK_IMAGE_FAILED]` | `lib/assets/image-upload.ts` — plugin `pick_image` command failed |
| `[JS] [PHOTO:PICK_IMAGE_REQUESTED]` | `lib/assets/image-upload.ts` — user tapped photo picker button |
| `[JS] [PHOTO:COMPRESS_ASSET_COMMAND_INVOKED]` | `lib/assets/plugin-bridge.ts` — plugin `compress_asset` command invoked |
| `[JS] [PHOTO:COMPRESS_ASSET_COMMAND_RETURNED]` | `lib/assets/plugin-bridge.ts` — plugin `compress_asset` command returned |
| `[JS] [PHOTO:DELETE_ASSET_COMMAND_INVOKED]` | `lib/assets/plugin-bridge.ts` — plugin `delete_asset` command invoked |
| `[JS] [PHOTO:DELETE_ASSET_COMMAND_RETURNED]` | `lib/assets/plugin-bridge.ts` — plugin `delete_asset` command returned |
| `[JS] [PHOTO:PENDING_PHOTO_JOB_ENQUEUED]` | product form |
| `[JS] [PHOTO:PHOTO_JOB_ENQUEUE_FAILED]` | product form |
| `[JS] [PHOTO:PREVIEW_IMAGE_FAILED_TO_LOAD]` | `components/image-upload.tsx` — `<img>` preview failed to load |
| `[JS] [PHOTO:PREVIEW_IMAGE_LOADED]` | `components/image-upload.tsx` — `<img>` preview loaded successfully |
| `[JS] [PHOTO:PREVIEW_PATH_RECEIVED]` | `lib/assets/image-upload.ts` — plugin returned a staged preview path |
| `[JS] [PHOTO:PREVIEW_URL_RESOLVED]` | `lib/assets/image-upload.ts` — staged preview path converted with `convertFileSrc` |
| `[JS] [PHOTO:PROCESSING_FAILED]` | product form |
| `[JS] [PHOTO:PRODUCT_CREATED]` | product form |
| `[JS] [PHOTO:PRODUCT_UPDATED]` | product form |
| `[JS] [PHOTO:RESOLVE_CACHED_IMAGE_FOUND]` | `lib/product-images/cache.ts` |
| `[JS] [PHOTO:RESOLVE_CACHED_IMAGE_MISSING]` | `lib/product-images/cache.ts` |
| `[JS] [PHOTO:RESOLVE_CACHED_IMAGE_SKIPPED_NO_ASSET]` | `lib/product-images/cache.ts` |
| `[JS] [PHOTO:RESOLVE_CACHED_IMAGE_STARTED]` | `lib/product-images/cache.ts` |
| `[JS] [PHOTO:SUBMIT_FAILED]` | product form |
| `[JS] [PHOTO:SUBMIT_STARTED]` | product form |
| `[JS] [PHOTO:TEMP_PHOTO_CLEANUP_FAILED]` | product form |
| `[JS] [PHOTO:ASSET_READY_RECEIVED]` | product form — plugin `job_completed` event received |
| `[JS] [PHOTO:JOB_COMPLETED_RECEIVED]` | image-upload — plugin `job_completed` event received for active job |
| `[JS] [POS:CHECKOUT_AUTO_PRINT_FAILED]` | `pages/pos/use-pos.ts` |
| `[JS] [POS:CHECKOUT_REPRINT_FAILED]` | `pages/pos/use-pos.ts` |
| `[JS] [PRINTER:LIST_PAIRED_PRINTERS_FAILED]` | `lib/printer/client.ts` |
| `[JS] [PRINTER:LOAD_PRINTERS_FAILED]` | printer settings |
| `[JS] [PRINTER:LOAD_PRINTERS_TIMEOUT]` | printer settings |
| `[JS] [PRINTER:PRINT_RECEIPT_FAILED]` | `lib/printer/client.ts` |
| `[JS] [PRINTER:RECEIPT_HEADER_FAILED]` | printer settings |
| `[JS] [PRINTER:REQUEST_BLUETOOTH_PERMISSION_FAILED]` | `lib/printer/client.ts` |
| `[JS] [PRINTER:REQUEST_PERMISSION_FAILED]` | printer settings |
| `[JS] [PRINTER:REQUEST_PERMISSION_RELOAD_FALLBACK]` | printer settings |
| `[JS] [PRINTER:TEST_PRINT_FAILED]` | printer client and settings |
| `[JS] [PRINTER:TEST_PRINT_SKIPPED_NO_PRINTER]` | printer settings |
| `[JS] [SYNC:ASSET_HYDRATION_FAILED]` | `store/sync.ts` |
| `[JS] [SYNC:ASSET_HYDRATION_FINISHED]` | `store/sync.ts` |
| `[JS] [SYNC:ASSET_HYDRATION_STARTED]` | `store/sync.ts` |
| `[JS] [SYNC:ASSET_PROCESSING_JOBS_FAILED]` | `store/sync.ts` |
| `[JS] [SYNC:ASSET_PROCESSING_JOBS_FINISHED]` | `store/sync.ts` |
| `[JS] [SYNC:ASSET_PROCESSING_JOBS_STARTED]` | `store/sync.ts` |
| `[JS] [SYNC:ASSET_UPLOAD_QUEUE_FAILED]` | `store/sync.ts` |
| `[JS] [SYNC:ASSET_UPLOAD_QUEUE_FINISHED]` | `store/sync.ts` |
| `[JS] [SYNC:ASSET_UPLOAD_QUEUE_STARTED]` | `store/sync.ts` |
| `[JS] [SYNC:DECISION]` | `store/sync.ts` |
| `[JS] [SYNC:FAILED]` | `store/sync.ts` — includes `errorType` (`auth`, `payload_too_large`, `network`, `server`, `unknown`) |
| `[JS] [SYNC:MANUAL_SYNC_FAILED]` | `components/sync-status.tsx` — header cloud icon manual sync failed |
| `[JS] [SYNC:MANUAL_SYNC_REQUESTED]` | `components/sync-status.tsx` — header cloud icon tapped |
| `[JS] [SYNC:MANUAL_SYNC_SUCCEEDED]` | `components/sync-status.tsx` — header cloud icon manual sync completed |
| `[JS] [SYNC:RESULT]` | `store/sync.ts` |
| `[JS] [SYNC:HEADERS_SET]` | `providers/sync-client-provider.tsx` — auth headers applied to sync client |
| `[JS] [SYNC:HEADERS_SET_FAILED]` | `providers/sync-client-provider.tsx` — auth header setup failed |
| `[JS] [SYNC:POLLING_STARTING]` | `providers/sync-client-provider.tsx` — about to call `startPolling` |
| `[JS] [SYNC:POLLING_STARTED]` | `providers/sync-client-provider.tsx` — polling loop confirmed running |
| `[JS] [SYNC:POLLING_START_FAILED]` | `providers/sync-client-provider.tsx` — `startPolling` rejected |
| `[JS] [SYNC:STATUS_CHANGED]` | `providers/sync-client-provider.tsx` — polling cycle emitted state, includes `needsBaselineSync`, `localDirtyCount` |
| `[JS] [SYNC:STATUS_GET_STATE_FAILED]` | `providers/sync-client-provider.tsx` — `getState()` threw inside status listener |
| `[JS] [UI:ASSET_EVENT_LISTENERS_START_FAILED]` | `lib/app/listeners.ts` |
| `[JS] [UI:LAYOUT_GUARD]` | `components/layout.tsx` |
| `[JS] [UI:REQUIRE_AUTH_GUARD]` | `App.tsx` |

## Rust Prefixes

| Prefix | Current Message Families |
| --- | --- |
| `[RUST] [ASSET:JOB:RESET:FAIL]` | startup reset of incomplete asset jobs |
| `[RUST] [ASSET:RECOVERY:PENDING:FAIL]` | startup recovery of pending assets failed |
| `[RUST] [ASSET:RECOVERY:COMPRESSED:FAIL]` | startup recovery of compressed assets failed |
| `[RUST] [ASSET:TEMP_CLEANUP:FAIL]` | startup temp file cleanup failed |
| `[RUST] [DB:INIT:FAIL]` | database initialization failure |
| `[RUST] [DB:SNAPSHOT_EXPORT_DONE]` | exported a dev DB snapshot |
| `[RUST] [DB:SNAPSHOT_EXPORT_REQUESTED]` | started a dev DB snapshot export |
| `[RUST] [DB:SNAPSHOT_EXPORT_FAILED]` | failed to export a dev DB snapshot |
| `[RUST] [DB:MIGRATION:SKIP]` | idempotent migration statements skipped because they already exist |
| `[RUST] [IMAGE-PIPELINE:COMPRESS_DONE]` | image pipeline background compression succeeded |
| `[RUST] [IMAGE-PIPELINE:COMPRESS_JOIN_FAILED]` | image pipeline background compression task failed to join |
| `[RUST] [IMAGE-PIPELINE:COMPRESS_START]` | `compress_asset` command started (was `COMPRESS_REQUEST`) |
| `[RUST] [IMAGE-PIPELINE:COMPRESS_ASSET_REQUEST]` | `compress_asset` command started (deferred compression) |
| `[RUST] [IMAGE-PIPELINE:DELETE_ASSET]` | `delete_asset` command executed |
| `[RUST] [IMAGE-PIPELINE:GC]` | TTL-based GC for staging and preview files |
| `[RUST] [IMAGE-PIPELINE:PICK_IMAGE_CONTENT_URI_STAGED]` | Android content:// URI staged via Kotlin ContentResolver |
| `[RUST] [IMAGE-PIPELINE:PICK_IMAGE_PICKER_OPENING]` | image pipeline native picker is about to open |
| `[RUST] [IMAGE-PIPELINE:PICK_IMAGE_PICKER_SELECTED]` | image pipeline native picker returned a file |
| `[RUST] [IMAGE-PIPELINE:PICK_IMAGE_RESPONSE_READY]` | image pipeline immediate picker response is ready |
| `[RUST] [IMAGE-PIPELINE:PICK_IMAGE_SOURCE_SELECTED]` | image pipeline selected a source file |
| `[RUST] [IMAGE-PIPELINE:PICK_IMAGE_START]` | image pipeline `pick_image` handler started |
| `[RUST] [IMAGE-PIPELINE:PREVIEW_GENERATE_DONE]` | image pipeline preview generation completed |
| `[RUST] [IMAGE-PIPELINE:PREVIEW_GENERATE_REQUEST]` | image pipeline preview generation started |
| `[RUST] [IMAGE-PIPELINE:PICKER_STAGE_REQUEST]` | image pipeline picker source staging started |
| `[RUST] [IMAGE-PIPELINE:PICKER_STAGE_DONE]` | image pipeline picker source staging completed |
| `[RUST] [PHOTO:TRACE]` | `asset_attachment_ready`, `asset_cache_ready`, `cache_asset_webp`, `prepare_local_image_asset`, `process_image_path`, `process_image_to_webp`, `product_image_link`, `get_cached_asset_path` |
| `[RUST] [PHOTO:RECOVERY]` | startup recovery: `pending_asset_recovered`, `pending_asset_recovery_failed`, `pending_asset_marked_failed`, `asset_compressed`, `compressed_assets_pending_upload` |
| `[RUST] [PHOTO:JOB_COMPLETED]` | live `image_pipeline://job_completed` handler: `no_pending_asset`, `asset_transitioned`, `parse_failed`, `handle_failed` |
| `[RUST] [PHOTO:UPLOAD]` | upload queue: `asset_uploaded`, `asset_upload_failed`, `mark_failed` |
| `[RUST] [PRINTER:TRACE]` | Android printer bridge failures, including list, test print, print receipt, and permission calls |
| `[RUST] [SYNC:TRACE]` | local state, row upsert, push (including byte-aware `push_batch` chunking, `payload_too_large` split retries, `sync_push` rejection follow-up, `marked_rejected_outbox_synced`), pull (including `pull_batch`, `deleted_ids`, `soft_delete_row`), sync outbox push, row-state pull, `sync_now` diagnostics (including `rejected push rows detected`), garbage collection, and `server_newer` reconciliation |
| `[RUST] [IMAGE-PIPELINE:EVENT_EMIT]` | Plugin event emission for `image_pipeline://job_completed` and `image_pipeline://job_failed` |
| `[RUST] [IMAGE-PIPELINE:COMPRESS]` | Background image compression failure |
| `[RUST] [IMAGE-PIPELINE:ASSET_WRITE]` | Compressed asset write failure |
| `[ANDROID] [IMAGE-PIPELINE:COMPRESS_DONE]` | Android image compression succeeded |
| `[ANDROID] [IMAGE-PIPELINE:COMPRESS_REQUEST]` | Android image compression was requested |
| `[ANDROID] [IMAGE-PIPELINE:PICKER_PREVIEW_STAGE_DONE]` | Android picker preview staging completed |
| `[ANDROID] [IMAGE-PIPELINE:PICKER_PREVIEW_STAGE_REQUEST]` | Android picker preview staging started |
| `[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_DONE]` | Android picker source staging completed |
| `[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_REQUEST]` | Android picker source staging started |
| `[ANDROID] [IMAGE-PIPELINE:PREVIEW_FILE_WRITTEN]` | Android preview file was written |
| `[ANDROID] [IMAGE-PIPELINE:PREVIEW_GENERATE_DONE]` | Android preview generation completed |
| `[ANDROID] [IMAGE-PIPELINE:PREVIEW_GENERATE_REQUEST]` | Android preview generation started |
| `[ANDROID] [IMAGE-PIPELINE:STAGE_CONTENT_URI]` | Android content:// URI staging started (via `stageContentUri` Kotlin command) |
| `[ANDROID] [IMAGE-PIPELINE:STAGE_CONTENT_URI_DONE]` | Android content:// URI staging completed |
| `[ANDROID] [IMAGE-PIPELINE:STAGE_CONTENT_URI_FAILED]` | Android content:// URI staging failed |
| `[ANDROID] [IMAGE-PIPELINE:URI_STAGE_START]` | Vendored URI staging helper started copying content:// URI to cache |
| `[ANDROID] [IMAGE-PIPELINE:URI_STAGE_DONE]` | Vendored URI staging helper completed copying content:// URI to cache |
| `[ANDROID] [IMAGE-PIPELINE:LOCAL_STAGE_START]` | Vendored local file staging helper started copying to cache |
| `[ANDROID] [IMAGE-PIPELINE:LOCAL_STAGE_DONE]` | Vendored local file staging helper completed copying to cache |
| `[baresync]` | Plugin setup and runtime messages emitted by the Baresync Rust dependency, including setup, contract table load, HTTP requests, and sync failure traces |

## Key Names

Use `product_id`, `asset_id`, `job_id`, `merchant_id`, `outlet_id`, `order_id`, `address`, `table`, `retry_count`, `rows`, `path`, `source_path`, `local_path`, `status`, `reason`, and `error` for common context values.
