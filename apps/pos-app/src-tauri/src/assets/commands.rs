use tauri::{command, AppHandle, State};

use crate::app::state::AppState;

use super::cache::{
    cache_asset_webp as cache_asset_webp_impl,
    read_cached_asset_data as read_cached_asset_data_impl,
};
use super::dto::{
    EnqueueAssetProcessingRequest, EnqueueAssetProcessingResponse,
    PendingProductPhotoPreviewResponse, PreparedLocalAssetResponse, ProcessedImageResponse,
};

#[command]
pub async fn cache_asset_webp(
    app: AppHandle,
    object_key: String,
    data_base64: String,
) -> Result<crate::assets::CachedAssetResponse, String> {
    cache_asset_webp_impl(app, object_key, data_base64).await
}

#[command]
pub async fn read_cached_asset_data(
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<Option<crate::assets::CachedAssetDataResponse>, String> {
    read_cached_asset_data_impl(asset_id, state).await
}

#[command]
pub async fn process_image_to_webp(
    data_base64: String,
    mime_type: String,
    original_filename: String,
) -> Result<ProcessedImageResponse, String> {
    super::process_image_to_webp(data_base64, mime_type, original_filename).await
}

#[command]
pub async fn prepare_local_image_asset(
    app: AppHandle,
    state: State<'_, AppState>,
    merchant_id: String,
    original_filename: String,
    content_hash: String,
    content_type: String,
    byte_size: i64,
    width: i32,
    height: i32,
    kind: String,
    data_base64: String,
) -> Result<PreparedLocalAssetResponse, String> {
    super::prepare_local_image_asset(
        app,
        state,
        merchant_id,
        original_filename,
        content_hash,
        content_type,
        byte_size,
        width,
        height,
        kind,
        data_base64,
    )
    .await
}

#[command]
pub async fn prepare_local_image_asset_from_path(
    app: AppHandle,
    state: State<'_, AppState>,
    merchant_id: String,
    original_filename: String,
    kind: String,
    path: String,
) -> Result<PreparedLocalAssetResponse, String> {
    super::prepare_local_image_asset_from_path(
        app,
        state,
        merchant_id,
        original_filename,
        kind,
        path,
    )
    .await
}

#[command]
pub async fn get_pending_asset_preview(
    product_id: String,
    state: State<'_, AppState>,
) -> Result<Option<PendingProductPhotoPreviewResponse>, String> {
    super::processing_jobs::get_pending_asset_preview(product_id, state).await
}

#[command]
pub async fn process_pending_asset_jobs(
    limit: Option<i64>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<i64, String> {
    super::processing_jobs::process_pending_asset_jobs(limit, state, app).await
}

#[command]
pub async fn enqueue_asset_processing(
    state: State<'_, AppState>,
    request: EnqueueAssetProcessingRequest,
) -> Result<EnqueueAssetProcessingResponse, String> {
    super::processing_jobs::enqueue_asset_processing(state, request).await
}

#[command]
pub async fn upload_pending_assets(
    api_url: String,
    session_token: String,
    merchant_id: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    super::upload_queue::upload_pending_assets(api_url, session_token, merchant_id, limit, state)
        .await
}

#[command]
pub async fn hydrate_missing_assets(
    app: AppHandle,
    api_url: String,
    session_token: String,
    merchant_id: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    super::hydration::hydrate_missing_assets(app, api_url, session_token, merchant_id, limit, state)
        .await
}
