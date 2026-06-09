use base64::engine::general_purpose;
use base64::Engine;
use sqlx::SqlitePool;
use tauri::{AppHandle, State};

pub(crate) mod cache;
pub(crate) mod commands;
mod dto;
pub(crate) mod http;
pub(crate) mod hydration;
pub(crate) mod image;
pub(crate) mod local;
pub(crate) mod processing_jobs;
pub(crate) mod targets;
pub(crate) mod temp_cleanup;
pub(crate) mod upload_queue;

use self::cache::{
    asset_object_key, is_deletable_photo_input_path, normalize_original_filename, sha256_hex,
    write_cached_asset,
};
use self::dto::*;
use self::image::process_image_bytes;
use crate::app::state::AppState;
use crate::time_utils::current_time_iso_string;

const PHOTO_PIPELINE_LOG_PREFIX: &str = "RUST] [PHOTO:TRACE";

// DTOs live in `assets/dto.rs`.

#[derive(Debug, PartialEq, Eq)]
struct LocalAssetPersistState {
    asset_status: &'static str,
    cache_status: &'static str,
    is_synced: i64,
    should_insert_sync_outbox: bool,
}

fn resolve_local_asset_persist_state(existing_status: Option<&str>) -> LocalAssetPersistState {
    if existing_status == Some("ready") {
        return LocalAssetPersistState {
            asset_status: "ready",
            cache_status: "ready",
            is_synced: 1,
            should_insert_sync_outbox: false,
        };
    }

    LocalAssetPersistState {
        asset_status: "pending_upload",
        cache_status: "pending_upload",
        is_synced: 0,
        should_insert_sync_outbox: true,
    }
}

#[allow(dead_code)]
fn resolve_reused_asset_ready_state(existing_status: Option<&str>) -> LocalAssetPersistState {
    let _ = existing_status;
    LocalAssetPersistState {
        asset_status: "ready",
        cache_status: "ready",
        is_synced: 1,
        should_insert_sync_outbox: false,
    }
}

#[derive(Debug)]
#[allow(dead_code)]
struct PendingUploadAsset {
    asset_id: String,
    merchant_id: String,
    object_key: String,
    original_filename: Option<String>,
    content_type: String,
    byte_size: i64,
    content_hash: String,
    kind: String,
    width: Option<i64>,
    height: Option<i64>,
    local_path: String,
}

#[allow(dead_code)]
async fn load_pending_upload_assets(
    pool: &SqlitePool,
    merchant_id: &str,
    limit: i64,
) -> Result<Vec<PendingUploadAsset>, String> {
    self::local::load_pending_upload_assets(pool, merchant_id, limit).await
}

#[allow(dead_code)]
async fn load_ready_assets(
    pool: &SqlitePool,
    merchant_id: &str,
    limit: i64,
) -> Result<Vec<PendingUploadAsset>, String> {
    self::local::load_ready_assets(pool, merchant_id, limit).await
}

#[allow(dead_code)]
async fn mark_asset_uploading(pool: &SqlitePool, asset_id: &str) -> Result<(), String> {
    self::local::mark_asset_uploading(pool, asset_id).await
}

#[allow(dead_code)]
async fn mark_asset_upload_failed(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
    error_message: &str,
) -> Result<(), String> {
    self::local::mark_asset_upload_failed(pool, asset_id, merchant_id, error_message).await
}

#[allow(dead_code)]
async fn mark_asset_ready(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    self::local::mark_asset_ready(pool, asset_id, merchant_id).await
}

#[allow(dead_code)]
async fn mark_reused_asset_ready(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    self::local::mark_reused_asset_ready(pool, asset_id, merchant_id).await
}

async fn insert_sync_outbox(
    pool: &SqlitePool,
    row_id: &str,
    scope_type: &str,
    scope_id: &str,
    table_name: &str,
    operation: &str,
) -> Result<(), String> {
    let changed_at = current_time_iso_string();
    let id = format!("{row_id}-{changed_at}");
    let updated = sqlx::query(
        "UPDATE sync_outbox
         SET operation = ?1, scope_type = ?2, scope_id = ?3, changed_at = ?4
         WHERE table_name = ?5 AND row_id = ?6 AND synced_at IS NULL",
    )
    .bind(operation)
    .bind(scope_type)
    .bind(scope_id)
    .bind(&changed_at)
    .bind(table_name)
    .bind(row_id)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to update sync outbox row: {}", error))?;
    if updated.rows_affected() > 0 {
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_type, scope_id, changed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(id)
    .bind(table_name)
    .bind(row_id)
    .bind(operation)
    .bind(scope_type)
    .bind(scope_id)
    .bind(changed_at)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to record sync outbox row: {}", error))?;
    Ok(())
}

pub(crate) async fn process_image_to_webp_inner(
    data_base64: String,
    mime_type: String,
    original_filename: String,
) -> Result<ProcessedImageResponse, String> {
    let _ = mime_type;
    log::info!(
        "[RUST] [PHOTO:TRACE] process_image_to_webp:start filename={}",
        original_filename
    );
    tauri::async_runtime::spawn_blocking(move || {
        let data = general_purpose::STANDARD
            .decode(data_base64)
            .map_err(|error| {
                format!(
                    "Failed to decode base64 payload for {}: {}",
                    original_filename, error
                )
            })?;
        let result = process_image_bytes(&data, &original_filename)?;
        log::info!(
            "[RUST] [PHOTO:TRACE] process_image_to_webp:done filename={} width={} height={} byte_size={} content_hash={}",
            original_filename,
            result.width,
            result.height,
            result.byte_size,
            result.content_hash
        );
        Ok(result)
    })
    .await
    .map_err(|error| format!("Failed to process image on blocking thread: {}", error))?
}

async fn prepare_local_image_asset_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    input: PreparedImageInput,
) -> Result<PreparedLocalAssetResponse, String> {
    self::local::prepare_local_image_asset_inner(app, pool, input).await
}

pub(crate) async fn prepare_local_image_asset_inner_command(
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
    log::info!(
        "[RUST] [PHOTO:TRACE] prepare_local_image_asset:start merchant_id={} filename={} kind={} byte_size={}",
        merchant_id, original_filename, kind, byte_size
    );

    prepare_local_image_asset_inner(
        &app,
        &state.db_pool,
        PreparedImageInput {
            byte_size,
            content_hash,
            content_type,
            data_base64,
            height,
            kind,
            merchant_id,
            original_filename,
            width,
        },
    )
    .await
}

async fn prepare_local_image_asset_from_path_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    merchant_id: String,
    original_filename: String,
    kind: String,
    path: String,
    delete_original: bool,
) -> Result<PreparedLocalAssetResponse, String> {
    self::local::prepare_local_image_asset_from_path_inner(
        app,
        pool,
        merchant_id,
        original_filename,
        kind,
        path,
        delete_original,
    )
    .await
}

pub(crate) async fn prepare_local_image_asset_from_path_inner_command(
    app: AppHandle,
    state: State<'_, AppState>,
    merchant_id: String,
    original_filename: String,
    kind: String,
    path: String,
) -> Result<PreparedLocalAssetResponse, String> {
    prepare_local_image_asset_from_path_inner(
        &app,
        &state.db_pool,
        merchant_id,
        original_filename,
        kind,
        path,
        true,
    )
    .await
}

#[cfg(test)]
mod tests;
