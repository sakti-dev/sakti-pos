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
| `[JS] [AUTH:REDIRECT_UNPAIRED]` | `lib/auth/provider.tsx` — no stored cloud token, routed to email login |
| `[JS] [AUTH:REDIRECT_PIN_GATE]` | `lib/auth/provider.tsx` — paired device without a staff session, routed to PIN gate |
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
| `[JS] [POS:GROUP_CREATED]` | `db/modifier-groups.ts` — varian group + options + links enqueued |
| `[JS] [POS:GROUP_UPDATED]` | `db/modifier-groups.ts` — group edit with option/link diff |
| `[JS] [POS:GROUP_DELETED]` | `db/modifier-groups.ts` — cascade soft-delete of group/options/links |
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
| `[JS] [SETTINGS:CHARGE_CONFIG_HYDRATED]` | `db/outlets.ts` |
| `[JS] [SETTINGS:CHARGE_CONFIG_HYDRATE_FAILED]` | `db/outlets.ts` |
| `[JS] [SETTINGS:CHARGE_CONFIG_SAVE_FAILED]` | `pages/setting/components/section-tax.tsx` |
| `[JS] [SETTINGS:CHARGE_CONFIG_SAVED]` | `db/outlets.ts` and `pages/setting/components/section-tax.tsx` |

### QRIS detection (domain `QRIS`)

| Prefix | Origin |
| --- | --- |
| `[JS] [QRIS:MONITORED_PACKAGES_SAVED]` | `lib/qris/detection.ts` |
| `[JS] [QRIS:MONITORED_PACKAGES_STORE_WRITE_FAILED]` | `lib/qris/detection.ts` |
| `[JS] [QRIS:MONITORED_PACKAGES_SYNC_TO_NATIVE_FAILED]` | `lib/qris/detection.ts` |
| `[JS] [QRIS:MONITORED_APPS_LOAD_FAILED]` / `MONITORED_APPS_SAVE_FAILED` / `MONITORED_APPS_AUTOSAVED` | `pages/setting/components/section-payment-monitor.tsx` |
| `[JS] [QRIS:OPEN_NOTIFICATION_SETTINGS_FAILED]` | `pages/setting/components/section-payment-monitor.tsx` |
| `[JS] [QRIS:EVENT_RECEIVED]` | `lib/qris/detection.ts` — live event from notification service |
| `[JS] [QRIS:EVENT_DRAIN_FAILED]` / `EVENT_LISTENER_REGISTER_FAILED` | `lib/qris/detection.ts` |
| `[JS] [QRIS:SESSION_BEGUN]` | `lib/qris/detection.ts` — payment session anchor set |
| `[JS] [QRIS:APP_LIST_LOADED]` | `lib/qris/detection.ts` — installed-apps query done (count, durationMs) |
| `[JS] [QRIS:ICONS_HYDRATED]` | `lib/qris/detection.ts` — icon hydration summary (requested/fetched/failed, total/avg/max ms) |
| `[JS] [QRIS:APP_ICON_SLOW]` / `APP_ICON_FETCH_FAILED` | `lib/qris/detection.ts` — per-icon slow (>100ms) / failure |
| `[JS] [QRIS:MONITORED_PACKAGES_SYNCED_TO_NATIVE]` | `lib/qris/detection.ts` — allowlist pushed to native (count, durationMs) |
| `[JS] [QRIS:EVENT_DRAINED]` | `lib/qris/detection.ts` — buffer drained (count, durationMs) |
| `[JS] [QRIS:APP_LIST_CACHE_HIT]` / `APP_LIST_CACHE_WARMED` / `APP_LIST_CACHE_WARM_FAILED` / `APP_LIST_CACHE_WRITE_FAILED` | `lib/qris/detection.ts` — cached list render + background warm |
| `[JS] [QRIS:DEFERRED_LOAD_STARTED]` | `pages/setting/components/section-payment-monitor.tsx` — section load started after the fixed post-navigation deferral |
| `[JS] [QRIS:ACCESS_STATE_CHANGED]` / `SECTION_LOADED` | `pages/setting/components/section-payment-monitor.tsx` — grant flip + section load timing |
| `[JS] [SETTINGS:PAYMENT_METHOD_TOGGLED]` | `pages/setting/components/section-payment-methods.tsx` |
| `[JS] [SETTINGS:PAYMENT_METHOD_TOGGLE_FAILED]` | `pages/setting/components/section-payment-methods.tsx` |
| `[JS] [SETTINGS:QRIS_SCAN_CLEANUP_FAILED]` | `lib/qris/scan.ts` |
| `[JS] [SETTINGS:QRIS_SCAN_DECODED]` | `lib/qris/scan.ts` |
| `[JS] [SETTINGS:QRIS_SCAN_IMAGE_LOAD_FAILED]` | `lib/qris/scan.ts` |
| `[JS] [SETTINGS:QRIS_SCAN_NO_QR_FOUND]` | `lib/qris/scan.ts` |
| `[JS] [SETTINGS:QRIS_SCAN_PICK_FAILED]` | `lib/qris/scan.ts` |
| `[JS] [SETTINGS:QRIS_WALKTHROUGH_GRANT_CHECKED]` | `pages/setting/components/qris-walkthrough.tsx` |
| `[JS] [SETTINGS:QRIS_WALKTHROUGH_GRANT_CHECK_FAILED]` | `pages/setting/components/qris-walkthrough.tsx` |
| `[JS] [SETTINGS:QRIS_WALKTHROUGH_MONITOR_OPENED]` | `pages/setting/components/qris-walkthrough.tsx` |
| `[JS] [SETTINGS:QRIS_WALKTHROUGH_SAVE_FAILED]` | `pages/setting/components/qris-walkthrough.tsx` |
| `[JS] [SETTINGS:QRIS_WALKTHROUGH_SAVED]` | `pages/setting/components/qris-walkthrough.tsx` |
| `[JS] [SETTINGS:QRIS_WALKTHROUGH_SCAN_INVALID]` | `pages/setting/components/qris-walkthrough.tsx` |
| `[JS] [SETTINGS:QRIS_WALKTHROUGH_SCAN_START]` | `pages/setting/components/qris-walkthrough.tsx` |
| `[JS] [SETTINGS:QRIS_WALKTHROUGH_SCAN_VALID]` | `pages/setting/components/qris-walkthrough.tsx` |
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
| `[JS] [SHIFT:OPENED]` | `db/cash-shifts.ts` — shift opened, includes `shiftId`, `staffId`, `floatMinorUnits` |
| `[JS] [SHIFT:CLOSED]` | `db/cash-shifts.ts` — setoran confirmed, includes `expectedMinorUnits`, `actualMinorUnits`, `differenceMinorUnits` |
| `[JS] [SHIFT:GATE_BLOCKED]` | `pages/transactions/cash-register/shift-open.tsx` — sale entry gated, no open shift |
| `[JS] [SHIFT:OPEN_FAILED]` | `shift-open.tsx` — openShift threw |
| `[JS] [SHIFT:CLOSE_FAILED]` | `shift-close.tsx` — closeShift threw |
| `[JS] [SHIFT:WINDOW_TOTALS]` | `db/cash-shifts.ts` — close-screen aggregate evidence: `outletId`, window bounds, row count, cash/qris totals, first-row sample |
| `[JS] [SHIFT:WINDOW_QUERY_FAILED]` | `db/cash-shifts.ts` — the window aggregate query threw |
| `[JS] [INVENTORY:TRACKING_STARTED]` | `db/inventory.ts` — "Mulai Lacak Stok" seeded a zero balance row, includes `targetId`, `targetType` |
| `[JS] [INVENTORY:TRACKING_STOPPED]` | `db/inventory.ts` — balance row soft-deleted (tracking off), includes `targetId`, `targetType` |
| `[JS] [INVENTORY:GOODS_RECEIPT_RECORDED]` | `db/inventory.ts` — penerimaan persisted (parent + lines + balance deltas), includes `ref`, `lines` |
| `[JS] [INVENTORY:STOCKTAKE_RECORDED]` | `db/inventory.ts` — opname persisted (variance lines + absolute balance sets), includes `ref`, `lines` |
| `[JS] [INVENTORY:ADJUSTMENT_CREATED]` | `db/inventory.ts` — penyesuaian persisted + delta applied, includes `targetId`, `qtyDelta`, `reason` |
| `[JS] [INVENTORY:CREATED]` | `db/ingredients.ts` — bahan baku created + zero balance seeded, includes `id`, `name` |
| `[JS] [INVENTORY:UPDATED]` | `db/ingredients.ts` — bahan baku fields updated |
| `[JS] [INVENTORY:SOFT_DELETED]` | `db/ingredients.ts` — bahan baku deactivated |
| `[JS] [POS:RECIPE_SAVED]` | `db/recipes.ts` — product recipe diff written (inserts/qty updates/soft-deletes), includes `productId`, `lines` |
| `[JS] [POS:RECIPE_DEDUCTION_FAILED]` | `db/orders.ts` — one ingredient's checkout deduction threw; logged and skipped so the sale still completes, includes `productId`, `ingredientId`, `error` |
| `[JS] [INVENTORY:CREATE_START]` | `db/ingredients.ts` — createIngredient entered (pre-transaction), includes `name`, `unit` |
| `[JS] [INVENTORY:INSERT_OK]` | `db/ingredients.ts` — ingredient row insert returned, mid-transaction |
| `[JS] [INVENTORY:RECEIPT_CREATE_TAPPED]` | `goods-receipt/use-goods-receipt.ts` — Tambah tapped in the drawer's create-bahan form, includes `name`, `unit` |
| `[JS] [INVENTORY:RECEIPT_CREATE_BLOCKED]` | `goods-receipt/use-goods-receipt.ts` — tapped with empty name (button-disable leak) |
| `[JS] [INVENTORY:RECEIPT_CREATE_FAILED]` | `goods-receipt/use-goods-receipt.ts` — createIngredientFromReceipt rejected, includes error |
| `[JS] [INVENTORY:RECEIPT_ITEM_ADDED]` | `goods-receipt/use-goods-receipt.ts` — created bahan added to the receipt item list |
| `[JS] [UI:ASSET_EVENT_LISTENERS_START_FAILED]` | `lib/app/listeners.ts` |
| `[JS] [UI:LAYOUT_GUARD]` | `components/layout.tsx` |
| `[JS] [UI:REQUIRE_AUTH_GUARD]` | `App.tsx` |

## API Server Logs

`apps/api` emits one single-line JSON object per request via `console.log`
(`apps/api/src/lib/request-log.ts`), which workerd forwards to the dev
process; `apps/api/scripts/dev` tees it into `logs/api.log`. The previous
pino-based logger's output never reached this file (workerd did not forward
its stream). Wrangler's own `[wrangler:info]` request lines are gone with
the Elysia 2 migration.

```json
{"lvl":"info","origin":"API","msg":"request","method":"POST","path":"/api/sync/v1/status","status":200,"ms":12}
```

- `lvl`: `info` for served requests, `error` when the error hook ran
- error lines carry `name` + `status` only — raw error messages are not
  logged (Elysia 2 problem+json posture)
- OPTIONS preflight requests are skipped

```bash
grep '"origin":"API"' logs/api.log        # all request lines
grep '"lvl":"error"' logs/api.log         # errors only
grep '"path":"/api/sync' logs/api.log     # sync endpoints
```

## Kotlin Prefixes

Log tag `QrisNotificationService` / `QrisBridgePlugin` (structured message prefix, appears under those tags in logcat).

| Prefix | Origin |
| --- | --- |
| `[QRIS_DETECT:EVENT_CAPTURED]` | `gen/android/.../qris/QrisNotificationService.kt` — allowlisted notification parsed and buffered |
| `[QRIS_DETECT:EVENT_DROPPED_NO_AMOUNT]` | `gen/android/.../qris/QrisNotificationService.kt` — allowlisted notification had no parsable Rp amount |
| `[QRIS_DETECT:ALLOWLIST_SAVED]` | `gen/android/.../qris/QrisBridgePlugin.kt` — monitored-package allowlist written to native prefs |
| `[QRIS_DETECT:GET_APPS_COMPLETED]` | `gen/android/.../qris/QrisBridgePlugin.kt` — launcher apps resolved + elapsed |
| `[QRIS_DETECT:APP_ICON_SLOW]` | `gen/android/.../qris/QrisBridgePlugin.kt` — single icon encode took > 50ms |

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
| `[RUST] [IMAGE-PIPELINE:PICK_IMAGE_ANDROID_DELEGATE]` | Android `pick_image` delegates to native Kotlin `pickAndStageImage` |
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
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_START]` | Android native picker launching `ACTION_OPEN_DOCUMENT` |
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_URI_RECEIVED]` | Android native picker received content:// URI |
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_STAGED]` | Android content:// URI staged to local file (with method used) |
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_FALLBACK]` | Android openInputStream failed, falling back to openFileDescriptor |
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_DONE]` | Android native pick + stage + preview complete |
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_CANCELLED]` | User cancelled the native picker |
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_PREVIEW_FAILED]` | Preview generation failed (staged path still returned) |
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_STAGING_FAILED]` | Content:// URI staging failed entirely |
| `[ANDROID] [IMAGE-PIPELINE:NATIVE_PICK_START_FAILED]` | Failed to launch ACTION_OPEN_DOCUMENT |
| `[ANDROID] [IMAGE-PIPELINE:URI_STAGE_START]` | Vendored URI staging helper started copying content:// URI to cache |
| `[ANDROID] [IMAGE-PIPELINE:URI_STAGE_DONE]` | Vendored URI staging helper completed copying content:// URI to cache |
| `[ANDROID] [IMAGE-PIPELINE:LOCAL_STAGE_START]` | Vendored local file staging helper started copying to cache |
| `[ANDROID] [IMAGE-PIPELINE:LOCAL_STAGE_DONE]` | Vendored local file staging helper completed copying to cache |
| `[baresync]` | Plugin setup and runtime messages emitted by the Baresync Rust dependency, including setup, contract table load, HTTP requests, and sync failure traces |

## Key Names

Use `product_id`, `asset_id`, `job_id`, `merchant_id`, `outlet_id`, `order_id`, `address`, `table`, `retry_count`, `rows`, `path`, `source_path`, `local_path`, `status`, `reason`, and `error` for common context values.
