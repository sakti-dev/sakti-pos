#!/usr/bin/env bash
set -euo pipefail

# Android package name for the running app process.
APP_ID="${APP_ID:-com.sakti_dev.sakti_pos}"
# How long to wait for the app process to appear before failing.
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-60}"
# Output file for the filtered capture.
LOGFILE="${LOGFILE:-logs/app.log}"
# Workflow: before asking for log review, update LOG_FILTER for the feature being changed.
# Treat LOG_EXCLUDE as fixed baseline noise unless you explicitly tell the agent to extend it.
if [[ -z "${LOG_FILTER:-}" ]]; then
  LOG_FILTER='\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|asset\.localhost|convertFileSrc|preview_state_changed|pick_image_requested|pick_image_completed|pick_image_failed|pick_gallery_to_product_photo_input|preview_image_failed_to_load|get_cached_asset_path|get_pending_preview_path|asset_cache_ready|asset_attachment_ready|asset protocol not configured to allow the path|temp_photo_cleanup|upload_pending_assets|upload_pending_assets:start|upload_pending_assets:pending|upload_pending_assets:done|process_pending_asset_jobs|asset_processing_jobs|hydrate_missing_assets|pending_asset|sync_batch_requests|sync_cursors|sync_outbox|sync_updated_at|sync_proto|recordLocalChange|create_category|create_product|insert_category|insert_product|snapshot_export_requested|snapshot_export_finished|snapshot_export_failed|snapshot_export_done' # Keep sync plus the full image preview/upload pipeline and the UI/DB path that produces outbox rows.
fi
if [[ -z "${LOG_EXCLUDE:-}" ]]; then
  LOG_EXCLUDE='^(D/nativeloader|D/ziparchive|D/hw-ProcessState|D/BufferQueueConsumer|D/BLASTBufferQueue|D/ViewRootImpl|D/MAGT_SYNC_FRAME|D/AppCompatDelegate|D/GrallocExtra|D/VivoJsonResourceManager|D/vulkan|D/sqlx_core::logger|I/GraphicsEnvironment|I/M-ProMotion|I/PowerHalWrapper|I/BLASTBufferQueue|I/GrallocExtra|I/WebViewFactory|I/WebViewChromium|I/ApplicationLoaders|I/cr_CombinedPProvider|I/cr_AppResProvider|I/RustStdoutStderr|I/i_dev\.sakti_pos|W/libc|W/HWUI|W/AssetManager|W/WindowOnBackDispatcher|W/AudioCapabilities|W/VideoCapabilities|W/RemoteInputConnectionImpl|W/cr_media|E/ion|E/DMABUFHEAPS|E/GPUAUX|E/ANDR-VIVO-PERF|E/VivoJsonResourceManager|E/i_dev\.sakti_pos)' # Drop vendor/system noise that is not useful for photo debugging.
fi

mkdir -p "$(dirname "$LOGFILE")"

PID=""
for _ in $(seq 1 "$WAIT_TIMEOUT_SECONDS"); do
  PID="$(adb shell pidof -s "$APP_ID" | tr -d '\r')"
  if [[ -n "$PID" ]]; then
    break
  fi
  echo "Waiting for $APP_ID to start..." >&2
  sleep 1
done

if [[ -z "$PID" ]]; then
  echo "Could not find a running process for $APP_ID after ${WAIT_TIMEOUT_SECONDS}s" >&2
  exit 1
fi

adb logcat -c
echo "Capturing sync logs for $APP_ID (pid $PID) -> $LOGFILE" >&2

adb logcat -v brief --pid="$PID" | \
grep --line-buffered -iE "$LOG_FILTER" | \
grep --line-buffered -vE "$LOG_EXCLUDE" | \
tee "$LOGFILE"
