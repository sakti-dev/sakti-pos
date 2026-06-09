# POS Logging Prefixes

Purpose: canonical prefix inventory and logcat filters for current app behavior.
Scope: app log prefixes only, not feature walkthroughs or design rationale.
Related: `README.md`, `../adr/0001-use-tauri-plugin-log-with-structured-prefixes.md`
Last updated: 2026-05-18

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
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|\[baresync\]|pending_asset_preview|enqueue_asset_processing|product_image_link|resolve_cached_image|snapshot_export_requested|snapshot_export_finished|snapshot_export_failed|snapshot_export_done'
```

Crash and native-failure follow-up:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|\[baresync\]|AndroidRuntime|libc|fatal|exception|crash|pending_asset_preview|enqueue_asset_processing|product_image_link|resolve_cached_image|snapshot_export_requested|snapshot_export_finished|snapshot_export_failed|snapshot_export_done'
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
| `[JS] [PHOTO:DRAWER_OPENED]` | product form |
| `[JS] [PHOTO:DRAWER_STATE_CHANGED]` | product form |
| `[JS] [PHOTO:NATIVE_PICKER_FINISHED]` | product form |
| `[JS] [PHOTO:NATIVE_PICKER_REQUESTED]` | product form |
| `[JS] [PHOTO:NAVIGATE_TO_PRODUCT_LIST]` | product form |
| `[JS] [PHOTO:PATH_PROCESSING_STARTED]` | product form |
| `[JS] [PHOTO:PENDING_PHOTO_JOB_ENQUEUED]` | product form |
| `[JS] [PHOTO:PHOTO_JOB_ENQUEUE_FAILED]` | product form |
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
| `[RUST] [DB:INIT:FAIL]` | database initialization failure |
| `[RUST] [DB:SNAPSHOT_EXPORT_DONE]` | exported a dev DB snapshot |
| `[RUST] [DB:SNAPSHOT_EXPORT_REQUESTED]` | started a dev DB snapshot export |
| `[RUST] [DB:SNAPSHOT_EXPORT_FAILED]` | failed to export a dev DB snapshot |
| `[RUST] [DB:MIGRATION:SKIP]` | idempotent migration statements skipped because they already exist |
| `[RUST] [PHOTO:TRACE]` | `asset_attachment_ready`, `asset_cache_ready`, `asset_processing_job`, `asset_processing_jobs`, `cache_asset_webp`, `delete_temp_product_photo`, `enqueue_asset_processing`, `hydrate_asset`, `hydrate_product_images`, `pending_asset_preview`, `pick_product_photo`, `prepare_local_image_asset`, `process_image_path`, `process_image_to_webp`, `product_image_link`, `read_cached_asset_data`, `upload_asset`, `upload_pending_product_images` |
| `[RUST] [PRINTER:TRACE]` | Android printer bridge failures, including list, test print, print receipt, and permission calls |
| `[RUST] [SYNC:TRACE]` | local state, row upsert, push (including byte-aware `push_batch` chunking, `payload_too_large` split retries, `sync_push` rejection follow-up, `marked_rejected_outbox_synced`), pull (including `pull_batch`, `deleted_ids`, `soft_delete_row`), sync outbox push, row-state pull, `sync_now` diagnostics (including `rejected push rows detected`), garbage collection, and `server_newer` reconciliation |
| `[RUST] [IMAGE-PIPELINE:EVENT_EMIT]` | Plugin event emission for `image_pipeline://job_completed` and `image_pipeline://job_failed` |
| `[RUST] [IMAGE-PIPELINE:COMPRESS]` | Background image compression failure |
| `[RUST] [IMAGE-PIPELINE:ASSET_WRITE]` | Compressed asset write failure |
| `[baresync]` | Plugin setup and runtime messages emitted by the Baresync Rust dependency, including setup, contract table load, HTTP requests, and sync failure traces |

## Key Names

Use `product_id`, `asset_id`, `job_id`, `merchant_id`, `outlet_id`, `order_id`, `address`, `table`, `retry_count`, `rows`, `path`, `source_path`, `local_path`, `status`, `reason`, and `error` for common context values.
