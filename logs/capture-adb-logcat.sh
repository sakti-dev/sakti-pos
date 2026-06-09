#!/usr/bin/env bash
set -euo pipefail

# Android package name used only for capture labels. The log stream is not
# PID-scoped so it can survive app restarts and reinstall testing.
APP_ID="${APP_ID:-com.sakti_dev.sakti_pos}"
# Output file for the filtered capture.
LOGFILE="${LOGFILE:-logs/app.log}"
# Capture mode: "normal" keeps the feature/Baresync filters tight; "crash"
# widens the stream to include panics and native abort traces.
APP_LOG_MODE="${APP_LOG_MODE:-normal}"

# Workflow: before asking for log review, update LOG_FILTER for the feature
# being changed. Treat LOG_EXCLUDE as fixed baseline noise unless you
# explicitly tell the agent to extend it.
if [[ -z "${LOG_FILTER:-}" ]]; then
  BASE_LOG_FILTER='\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|\[DIALOG\]|image_pipeline://|IMAGE-PIPELINE|asset\.localhost|convertFileSrc|preview_state_changed|pick_image_requested|pick_image_completed|pick_image_failed|pick_image_command_invoked|pick_image_command_returned|listeners_starting|listeners_started|preview_path_received|preview_url_resolved|job_completed_buffered|job_failed_buffered|job_completed_applied|job_failed_applied|preview_image_failed_to_load|preview_image_loaded|get_cached_asset_path|get_pending_asset_preview|get_pending_asset_preview_path|asset_cache_ready|asset_attachment_ready|asset protocol not configured to allow the path|upload_pending_assets|upload_pending_assets:start|upload_pending_assets:pending|upload_pending_assets:done|upload_asset:finalize_failed|process_pending_asset_jobs|asset_processing_job:failed|asset_processing_jobs|hydrate_missing_assets|pending_asset|manual_sync_requested|manual_sync_succeeded|manual_sync_failed|polling|PICKER_STAGE_REQUEST|PICKER_STAGE_DONE|stage_picker_source_requested|stage_picker_source_done'
  LOG_FILTER="$BASE_LOG_FILTER"
fi

if [[ -z "${LOG_EXCLUDE:-}" ]]; then
  BASE_LOG_EXCLUDE='^(D/nativeloader|D/ziparchive|D/hw-ProcessState|D/BufferQueueConsumer|D/BLASTBufferQueue|D/ViewRootImpl|D/MAGT_SYNC_FRAME|D/AppCompatDelegate|D/GrallocExtra|D/VivoJsonResourceManager|D/vulkan|D/sqlx_core::logger|I/GraphicsEnvironment|I/M-ProMotion|I/PowerHalWrapper|I/BLASTBufferQueue|I/GrallocExtra|I/WebViewFactory|I/WebViewChromium|I/ApplicationLoaders|I/cr_CombinedPProvider|I/cr_AppResProvider|I/RustStdoutStderr|I/i_dev\.sakti_pos|W/libc|W/HWUI|W/AssetManager|W/WindowOnBackDispatcher|W/AudioCapabilities|W/VideoCapabilities|W/RemoteInputConnectionImpl|W/cr_media|E/ion|E/DMABUFHEAPS|E/GPUAUX|E/ANDR-VIVO-PERF|E/VivoJsonResourceManager|E/i_dev\.sakti_pos)'
  LOG_EXCLUDE="$BASE_LOG_EXCLUDE"
fi

if [[ "$APP_LOG_MODE" == "crash" ]]; then
  LOG_FILTER="${BASE_LOG_FILTER}|RustStdoutStderr|panicked|PluginInitialization|abort|signal 6|AndroidRuntime|fatal|exception|crash"
  LOG_EXCLUDE='^(D/nativeloader|D/ziparchive|D/hw-ProcessState|D/BufferQueueConsumer|D/BLASTBufferQueue|D/ViewRootImpl|D/MAGT_SYNC_FRAME|D/AppCompatDelegate|D/GrallocExtra|D/VivoJsonResourceManager|D/vulkan|D/sqlx_core::logger|I/GraphicsEnvironment|I/M-ProMotion|I/PowerHalWrapper|I/BLASTBufferQueue|I/GrallocExtra|I/WebViewFactory|I/WebViewChromium|I/ApplicationLoaders|I/cr_CombinedPProvider|I/cr_AppResProvider|I/i_dev\.sakti_pos|W/libc|W/HWUI|W/AssetManager|W/WindowOnBackDispatcher|W/AudioCapabilities|W/VideoCapabilities|W/RemoteInputConnectionImpl|W/cr_media|E/ion|E/DMABUFHEAPS|E/GPUAUX|E/ANDR-VIVO-PERF|E/VivoJsonResourceManager|E/i_dev\.sakti_pos)'
fi

mkdir -p "$(dirname "$LOGFILE")"

adb logcat -c
echo "Capturing filtered app logs for $APP_ID across restarts -> $LOGFILE" >&2

adb logcat -v brief | \
grep --line-buffered -iE "$LOG_FILTER" | \
grep --line-buffered -vE "$LOG_EXCLUDE" | \
tee "$LOGFILE"
