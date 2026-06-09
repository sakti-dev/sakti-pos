use tauri::{command, AppHandle, Runtime, State};

use crate::dto::*;
use crate::ImagePipeline;

fn plugin_error_to_string(error: crate::error::PluginError) -> String {
    error.to_string()
}

#[command]
pub(crate) async fn enqueue_job<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
    request: EnqueueJobRequest,
) -> Result<EnqueueJobResponse, String> {
    pipeline
        .enqueue_job(request)
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn process_pending_jobs<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
    limit: u32,
) -> Result<ProcessJobsResponse, String> {
    pipeline
        .process_pending_jobs(limit)
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn get_completed_jobs<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
) -> Result<Vec<CompletedJob>, String> {
    pipeline
        .get_completed_jobs()
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn consume_completed_job<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
    job_id: String,
) -> Result<JobResult, String> {
    pipeline
        .consume_completed_job(&job_id)
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn reset_stuck_jobs<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
) -> Result<u32, String> {
    pipeline
        .reset_stuck_jobs()
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn retry_failed_job<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
    job_id: String,
) -> Result<(), String> {
    pipeline
        .retry_failed_job(&job_id)
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn get_failed_jobs<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
) -> Result<Vec<FailedJob>, String> {
    pipeline
        .get_failed_jobs()
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn get_pending_preview<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
    target: AttachmentLookup,
) -> Result<Option<PreviewPathResponse>, String> {
    pipeline
        .get_pending_preview(target)
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn get_cached_asset_path<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
    merchant_id: String,
    asset_id: String,
    content_type: String,
) -> Result<Option<CachedPathResponse>, String> {
    pipeline
        .get_cached_asset_path(&merchant_id, &asset_id, &content_type)
        .await
        .map_err(plugin_error_to_string)
}

#[command]
pub(crate) async fn cleanup_orphaned_temp_files<R: Runtime>(
    _app: AppHandle<R>,
    pipeline: State<'_, ImagePipeline<R>>,
) -> Result<u32, String> {
    pipeline
        .cleanup_orphaned_temp_files()
        .await
        .map_err(plugin_error_to_string)
}
