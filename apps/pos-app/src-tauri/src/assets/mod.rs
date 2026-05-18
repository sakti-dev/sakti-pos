use base64::engine::general_purpose;
use base64::Engine;
use prost::Message;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Emitter, State};

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
use self::targets::{resolve_asset_target_merchant_id, validate_asset_attachment_target};
use crate::app::state::AppState;
use crate::time_utils::current_time_iso_string;

#[allow(dead_code)]
mod asset_proto {
    include!(concat!(env!("OUT_DIR"), "/sakti.assets.v1.rs"));
}

const PHOTO_PIPELINE_LOG_PREFIX: &str = "RUST] [PHOTO:TRACE";

// DTOs live in `assets/dto.rs`.

#[cfg(test)]
fn is_valid_asset_status(status: &str) -> bool {
    matches!(
        status,
        "pending_upload" | "uploading" | "ready" | "pending_download" | "downloading" | "failed"
    )
}

#[cfg(test)]
fn is_valid_pending_product_photo_job_status(status: &str) -> bool {
    matches!(status, "pending" | "processing" | "done" | "failed")
}

fn presign_response_means_already_ready(
    response: &asset_proto::AssetPresignUploadResponse,
) -> bool {
    self::http::presign_response_means_already_ready(response)
}

fn build_api_client(session_token: &str) -> Result<reqwest::Client, String> {
    self::http::build_api_client(session_token)
}

fn build_signed_url_client() -> Result<reqwest::Client, String> {
    self::http::build_signed_url_client()
}

async fn post_protobuf<Req, Res>(
    client: &reqwest::Client,
    url: &str,
    request: &Req,
) -> Result<Res, String>
where
    Req: Message,
    Res: Message + Default,
{
    self::http::post_protobuf(client, url, request).await
}

async fn put_bytes_to_signed_url(
    client: &reqwest::Client,
    url: &str,
    headers: &[asset_proto::AssetHeader],
    bytes: &[u8],
) -> Result<(), String> {
    self::http::put_bytes_to_signed_url(client, url, headers, bytes).await
}

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

async fn load_pending_upload_assets(
    pool: &SqlitePool,
    merchant_id: &str,
    limit: i64,
) -> Result<Vec<PendingUploadAsset>, String> {
    self::local::load_pending_upload_assets(pool, merchant_id, limit).await
}

async fn load_ready_assets(
    pool: &SqlitePool,
    merchant_id: &str,
    limit: i64,
) -> Result<Vec<PendingUploadAsset>, String> {
    self::local::load_ready_assets(pool, merchant_id, limit).await
}

pub(crate) async fn reset_incomplete_pending_asset_processing_jobs(
    pool: &SqlitePool,
) -> Result<(), String> {
    let now = current_time_iso_string();
    sqlx::query(
        "UPDATE pending_asset_processing_jobs SET status = 'pending', last_error = NULL, updated_at = ?1 WHERE status = 'processing'",
    )
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to reset pending asset processing jobs: {}", error))?;
    Ok(())
}

async fn load_pending_asset_processing_jobs(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<PendingAssetProcessingJobRecord>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
          id,
          merchant_id,
          source_path,
          original_filename,
          source_mime_type,
          processing_kind,
          entity_type,
          entity_id,
          attachment_field,
          preview_path,
          preview_mime_type,
          status,
          attempts
        FROM pending_asset_processing_jobs
        WHERE status IN ('pending', 'failed')
        ORDER BY created_at ASC, updated_at ASC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to load pending asset processing jobs: {}", error))?;

    let mut jobs = Vec::with_capacity(rows.len());
    for row in rows {
        jobs.push(PendingAssetProcessingJobRecord {
            id: row
                .try_get("id")
                .map_err(|error| format!("Failed to read asset job id: {}", error))?,
            merchant_id: row
                .try_get("merchant_id")
                .map_err(|error| format!("Failed to read asset job merchant_id: {}", error))?,
            source_path: row
                .try_get("source_path")
                .map_err(|error| format!("Failed to read asset job source_path: {}", error))?,
            original_filename: row.try_get("original_filename").map_err(|error| {
                format!("Failed to read asset job original_filename: {}", error)
            })?,
            source_mime_type: row
                .try_get("source_mime_type")
                .map_err(|error| format!("Failed to read asset job source_mime_type: {}", error))?,
            processing_kind: row
                .try_get("processing_kind")
                .map_err(|error| format!("Failed to read asset job processing_kind: {}", error))?,
            entity_type: row
                .try_get("entity_type")
                .map_err(|error| format!("Failed to read asset job entity_type: {}", error))?,
            entity_id: row
                .try_get("entity_id")
                .map_err(|error| format!("Failed to read asset job entity_id: {}", error))?,
            attachment_field: row
                .try_get("attachment_field")
                .map_err(|error| format!("Failed to read asset job attachment_field: {}", error))?,
            preview_path: row
                .try_get("preview_path")
                .map_err(|error| format!("Failed to read asset job preview_path: {}", error))?,
            preview_mime_type: row.try_get("preview_mime_type").map_err(|error| {
                format!("Failed to read asset job preview_mime_type: {}", error)
            })?,
            status: row
                .try_get("status")
                .map_err(|error| format!("Failed to read asset job status: {}", error))?,
            attempts: row
                .try_get("attempts")
                .map_err(|error| format!("Failed to read asset job attempts: {}", error))?,
        });
    }

    Ok(jobs)
}

async fn claim_pending_asset_processing_job(
    pool: &SqlitePool,
    job_id: &str,
) -> Result<Option<PendingAssetProcessingJobRecord>, String> {
    let now = current_time_iso_string();
    let row = sqlx::query(
        r#"
        UPDATE pending_asset_processing_jobs
        SET status = 'processing',
            attempts = attempts + 1,
            last_error = NULL,
            updated_at = ?2
        WHERE id = ?1
          AND status IN ('pending', 'failed')
        RETURNING
          id,
          merchant_id,
          source_path,
          original_filename,
          source_mime_type,
          processing_kind,
          entity_type,
          entity_id,
          attachment_field,
          preview_path,
          preview_mime_type,
          status,
          attempts
        "#,
    )
    .bind(job_id)
    .bind(now)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to claim pending asset processing job: {}", error))?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(PendingAssetProcessingJobRecord {
        id: row
            .try_get("id")
            .map_err(|error| format!("Failed to read asset job id: {}", error))?,
        merchant_id: row
            .try_get("merchant_id")
            .map_err(|error| format!("Failed to read asset job merchant_id: {}", error))?,
        source_path: row
            .try_get("source_path")
            .map_err(|error| format!("Failed to read asset job source_path: {}", error))?,
        original_filename: row
            .try_get("original_filename")
            .map_err(|error| format!("Failed to read asset job original_filename: {}", error))?,
        source_mime_type: row
            .try_get("source_mime_type")
            .map_err(|error| format!("Failed to read asset job source_mime_type: {}", error))?,
        processing_kind: row
            .try_get("processing_kind")
            .map_err(|error| format!("Failed to read asset job processing_kind: {}", error))?,
        entity_type: row
            .try_get("entity_type")
            .map_err(|error| format!("Failed to read asset job entity_type: {}", error))?,
        entity_id: row
            .try_get("entity_id")
            .map_err(|error| format!("Failed to read asset job entity_id: {}", error))?,
        attachment_field: row
            .try_get("attachment_field")
            .map_err(|error| format!("Failed to read asset job attachment_field: {}", error))?,
        preview_path: row
            .try_get("preview_path")
            .map_err(|error| format!("Failed to read asset job preview_path: {}", error))?,
        preview_mime_type: row
            .try_get("preview_mime_type")
            .map_err(|error| format!("Failed to read asset job preview_mime_type: {}", error))?,
        status: row
            .try_get("status")
            .map_err(|error| format!("Failed to read asset job status: {}", error))?,
        attempts: row
            .try_get("attempts")
            .map_err(|error| format!("Failed to read asset job attempts: {}", error))?,
    }))
}

async fn mark_pending_asset_processing_job_failed(
    pool: &SqlitePool,
    job_id: &str,
    error_message: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE pending_asset_processing_jobs SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE id = ?1",
    )
    .bind(job_id)
    .bind(error_message)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark pending asset processing job failed: {}", error))?;
    Ok(())
}

async fn delete_pending_asset_processing_job(
    pool: &SqlitePool,
    job_id: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM pending_asset_processing_jobs WHERE id = ?1")
        .bind(job_id)
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to delete pending asset processing job: {}", error))?;
    Ok(())
}

fn emit_asset_cache_ready(app: &AppHandle, asset_id: &str) {
    log::info!(
        "[{}] asset_cache_ready:emit asset_id={}",
        PHOTO_PIPELINE_LOG_PREFIX,
        asset_id
    );
    if let Err(error) = app.emit(
        "asset-cache-ready",
        AssetCacheReadyPayload {
            asset_id: asset_id.to_string(),
        },
    ) {
        log::info!(
            "[RUST] [PHOTO:TRACE] asset_cache_ready:emit_failed asset_id={} error={}",
            asset_id,
            error
        );
    }
}

fn emit_asset_attachment_ready(app: &AppHandle, payload: AssetAttachmentReadyPayload) {
    log::info!(
        "[{}] asset_attachment_ready:emit asset_id={} entity_type={} entity_id={} field={}",
        PHOTO_PIPELINE_LOG_PREFIX,
        payload.asset_id,
        payload.entity_type,
        payload.entity_id,
        payload.field
    );
    if let Err(error) = app.emit("asset-attachment-ready", payload) {
        log::info!(
            "[RUST] [PHOTO:TRACE] asset_attachment_ready:emit_failed error={}",
            error
        );
    }
}

async fn mark_asset_uploading(pool: &SqlitePool, asset_id: &str) -> Result<(), String> {
    self::local::mark_asset_uploading(pool, asset_id).await
}

async fn mark_asset_upload_failed(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
    error_message: &str,
) -> Result<(), String> {
    self::local::mark_asset_upload_failed(pool, asset_id, merchant_id, error_message).await
}

async fn mark_asset_ready(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    self::local::mark_asset_ready(pool, asset_id, merchant_id).await
}

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
