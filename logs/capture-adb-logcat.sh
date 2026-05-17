#!/usr/bin/env bash
set -euo pipefail

# Android package name for the running app process.
APP_ID="${APP_ID:-com.sakti_dev.sakti_pos}"
# Output file for the filtered capture.
LOGFILE="${LOGFILE:-logs/app.log}"
# Workflow: before asking for log review, update LOG_FILTER for the feature being changed.
# Treat LOG_EXCLUDE as fixed baseline noise unless you explicitly tell the agent to extend it.
if [[ -z "${LOG_FILTER:-}" ]]; then
  LOG_FILTER='\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB):|asset\.localhost|convertFileSrc|preview_state_changed|pick_image_requested|pick_image_completed|preview_image_failed_to_load|get_cached_asset_path|get_pending_preview_path|asset_cache_ready|asset_attachment_ready|asset protocol not configured to allow the path|temp_photo_cleanup|push_batch|pull_batch|upsert_row|sync_proto' # Keep only app-level preview, asset, sync, and database lines.
fi
if [[ -z "${LOG_EXCLUDE:-}" ]]; then
  LOG_EXCLUDE='^(D/nativeloader|D/ziparchive|D/hw-ProcessState|D/BufferQueueConsumer|D/BLASTBufferQueue|D/ViewRootImpl|D/MAGT_SYNC_FRAME|D/AppCompatDelegate|D/GrallocExtra|D/VivoJsonResourceManager|D/vulkan|D/sqlx_core::logger|I/GraphicsEnvironment|I/M-ProMotion|I/PowerHalWrapper|I/BLASTBufferQueue|I/GrallocExtra|I/WebViewFactory|I/WebViewChromium|I/ApplicationLoaders|I/cr_CombinedPProvider|I/cr_AppResProvider|I/RustStdoutStderr|I/i_dev\.sakti_pos|W/libc|W/HWUI|W/AssetManager|W/WindowOnBackDispatcher|W/AudioCapabilities|W/VideoCapabilities|W/RemoteInputConnectionImpl|W/cr_media|E/ion|E/DMABUFHEAPS|E/GPUAUX|E/ANDR-VIVO-PERF|E/VivoJsonResourceManager|E/i_dev\.sakti_pos)' # Drop vendor/system noise that is not useful for photo debugging.
fi

mkdir -p "$(dirname "$LOGFILE")"

adb logcat -c

PID="$(adb shell pidof -s "$APP_ID" | tr -d '\r')"
if [[ -z "$PID" ]]; then
  echo "Could not find a running process for $APP_ID" >&2
  exit 1
fi

adb logcat -v brief --pid="$PID" | \
grep --line-buffered -iE "$LOG_FILTER" | \
grep --line-buffered -vE "$LOG_EXCLUDE" | \
tee "$LOGFILE"
