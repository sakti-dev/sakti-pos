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

pub async fn process_image_to_webp(
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

pub async fn prepare_local_image_asset_from_path(
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
mod tests {
    use super::cache::{
        asset_cache_file_path_from_root, asset_relative_path, is_deletable_photo_input_path,
        normalize_original_filename,
    };
    use super::image::{asset_image_preview_from_bytes, fit_within_max_edge, process_image_bytes};
    use super::*;
    use crate::time_utils::{current_job_id_string, current_time_iso_string};
    use ::image::{DynamicImage, ImageBuffer, ImageFormat, ImageReader, Rgb, Rgba};
    use std::io::Cursor;
    use std::path::{Path, PathBuf};
    use zenwebp::DecodeRequest;

    fn create_png_bytes(width: u32, height: u32) -> Vec<u8> {
        let mut image = ImageBuffer::new(width, height);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            *pixel = Rgba([(x % 256) as u8, (y % 256) as u8, 200, 255]);
        }

        let dynamic = DynamicImage::ImageRgba8(image);
        let mut cursor = Cursor::new(Vec::new());
        dynamic
            .write_to(&mut cursor, ImageFormat::Png)
            .expect("png encoding should succeed");
        cursor.into_inner()
    }

    fn create_exif_oriented_jpeg_bytes(orientation: u16) -> Vec<u8> {
        let image = ImageBuffer::from_fn(2, 1, |x, _| {
            if x == 0 {
                Rgb([255, 0, 0])
            } else {
                Rgb([0, 255, 0])
            }
        });
        let dynamic = DynamicImage::ImageRgb8(image);
        let mut cursor = Cursor::new(Vec::new());
        dynamic
            .write_to(&mut cursor, ImageFormat::Jpeg)
            .expect("jpeg encoding should succeed");

        let jpeg_bytes = cursor.into_inner();
        let exif_segment = build_exif_orientation_segment(orientation);
        let mut oriented = Vec::with_capacity(jpeg_bytes.len() + exif_segment.len());
        oriented.extend_from_slice(&jpeg_bytes[..2]);
        oriented.extend_from_slice(&exif_segment);
        oriented.extend_from_slice(&jpeg_bytes[2..]);
        oriented
    }

    fn build_exif_orientation_segment(orientation: u16) -> Vec<u8> {
        let mut payload = Vec::with_capacity(32);
        payload.extend_from_slice(b"Exif\0\0");
        payload.extend_from_slice(b"II");
        payload.extend_from_slice(&42u16.to_le_bytes());
        payload.extend_from_slice(&8u32.to_le_bytes());
        payload.extend_from_slice(&1u16.to_le_bytes());
        payload.extend_from_slice(&0x0112u16.to_le_bytes());
        payload.extend_from_slice(&3u16.to_le_bytes());
        payload.extend_from_slice(&1u32.to_le_bytes());
        payload.extend_from_slice(&orientation.to_le_bytes());
        payload.extend_from_slice(&0u16.to_le_bytes());
        payload.extend_from_slice(&0u32.to_le_bytes());

        let mut segment = Vec::with_capacity(payload.len() + 4);
        segment.push(0xFF);
        segment.push(0xE1);
        let length = (payload.len() + 2) as u16;
        segment.extend_from_slice(&length.to_be_bytes());
        segment.extend_from_slice(&payload);
        segment
    }

    #[test]
    fn fit_within_max_edge_preserves_aspect_ratio() {
        assert_eq!(fit_within_max_edge(1600, 1000, 400), (400, 250));
        assert_eq!(fit_within_max_edge(300, 200, 400), (300, 200));
        assert_eq!(fit_within_max_edge(1200, 2400, 400), (200, 400));
    }

    #[test]
    fn process_image_bytes_resizes_and_encodes_webp() {
        let png_bytes = create_png_bytes(1600, 1000);

        let result =
            process_image_bytes(&png_bytes, "coffee.png").expect("image processing should succeed");

        assert_eq!(result.content_type, "image/webp");
        assert_eq!(result.width, 400);
        assert_eq!(result.height, 250);
        assert_eq!(result.content_hash.len(), 64);
        assert!(!result.data_base64.is_empty());

        let webp_bytes = general_purpose::STANDARD
            .decode(result.data_base64)
            .expect("webp bytes should decode");
        let config = zenwebp::DecodeConfig::default();
        let (decoded_pixels, decoded_width, decoded_height) =
            DecodeRequest::new(&config, &webp_bytes)
                .decode_rgba()
                .expect("webp bytes should decode");

        assert_eq!(decoded_width, 400);
        assert_eq!(decoded_height, 250);
        assert_eq!(
            decoded_pixels.len(),
            (decoded_width * decoded_height * 4) as usize
        );
    }

    #[test]
    fn process_image_bytes_respects_exif_orientation() {
        let jpeg_bytes = create_exif_oriented_jpeg_bytes(6);

        let result = process_image_bytes(&jpeg_bytes, "rotated-camera.jpg")
            .expect("image processing should succeed");

        assert_eq!(result.width, 1);
        assert_eq!(result.height, 2);
    }

    #[test]
    fn product_photo_preview_resizes_and_encodes_jpeg() {
        let png_bytes = create_png_bytes(1600, 1000);

        let result = asset_image_preview_from_bytes(&png_bytes, "coffee.png")
            .expect("preview generation should succeed");

        assert_eq!(
            result.preview_mime_type,
            super::image::ASSET_IMAGE_PREVIEW_MIME_TYPE
        );
        assert!(!result.preview_base64.is_empty());

        let preview_bytes = general_purpose::STANDARD
            .decode(result.preview_base64)
            .expect("preview bytes should decode");
        let decoded = ImageReader::new(Cursor::new(preview_bytes))
            .with_guessed_format()
            .expect("preview format should be detected")
            .decode()
            .expect("preview should decode");

        assert_eq!(decoded.width(), 320);
        assert_eq!(decoded.height(), 200);
    }

    #[test]
    fn pending_product_photo_preview_reads_generic_asset_job_preview() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("sqlite pool should connect");

            sqlx::query(
                r#"
                CREATE TABLE pending_product_photo_jobs (
                    product_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    preview_base64 TEXT,
                    preview_mime_type TEXT,
                    updated_at TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("legacy preview table should be created");

            sqlx::query(
                r#"
                CREATE TABLE pending_asset_processing_jobs (
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    attachment_field TEXT NOT NULL,
                    status TEXT NOT NULL,
                    preview_path TEXT,
                    preview_mime_type TEXT,
                    updated_at TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("generic asset jobs table should be created");

            let preview_bytes = b"preview-bytes";
            let preview_path = std::env::temp_dir().join(format!(
                "sakti-pos-preview-test-{}.jpg",
                current_job_id_string()
            ));
            std::fs::write(&preview_path, preview_bytes).expect("preview file should be written");

            sqlx::query(
                r#"
                INSERT INTO pending_asset_processing_jobs (
                    entity_type,
                    entity_id,
                    attachment_field,
                    status,
                    preview_path,
                    preview_mime_type,
                    updated_at
                ) VALUES ('product', 'product-1', 'image_asset_id', 'pending', ?1, ?2, ?3)
                "#,
            )
            .bind(preview_path.to_string_lossy().as_ref())
            .bind(super::image::ASSET_IMAGE_PREVIEW_MIME_TYPE)
            .bind(current_time_iso_string())
            .execute(&pool)
            .await
            .expect("generic preview job should be inserted");

            let result =
                crate::assets::processing_jobs::get_pending_asset_preview_inner(&pool, "product-1")
                    .await
                    .expect("preview lookup should succeed")
                    .expect("generic asset preview should be returned");

            assert_eq!(
                result.preview_mime_type,
                super::image::ASSET_IMAGE_PREVIEW_MIME_TYPE
            );
            assert_eq!(
                result.preview_base64,
                general_purpose::STANDARD.encode(preview_bytes)
            );

            std::fs::remove_file(preview_path).expect("preview file should be cleaned up");
        });
    }

    #[test]
    fn get_cached_asset_path_returns_path_for_existing_asset() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("sqlite pool should connect");

            sqlx::query(
                r#"
                CREATE TABLE assets (
                    id TEXT PRIMARY KEY,
                    content_type TEXT
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("assets table should be created");

            sqlx::query(
                r#"
                CREATE TABLE local_asset_cache (
                    asset_id TEXT PRIMARY KEY,
                    local_path TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("local_asset_cache table should be created");

            let local_path = std::env::temp_dir().join(format!(
                "sakti-pos-cache-path-test-{}.webp",
                current_job_id_string()
            ));
            std::fs::write(&local_path, b"webp-bytes").expect("cache file should be written");

            sqlx::query(
                "INSERT INTO assets (id, content_type) VALUES ('asset-1', 'image/webp')",
            )
            .execute(&pool)
            .await
            .expect("asset row should be inserted");

            sqlx::query("INSERT INTO local_asset_cache (asset_id, local_path) VALUES ('asset-1', ?1)")
                .bind(local_path.to_string_lossy().as_ref())
                .execute(&pool)
                .await
                .expect("cache row should be inserted");

            let result = cache::get_cached_asset_path("asset-1".to_string(), &pool)
                .await
                .expect("path lookup should succeed")
                .expect("cached asset path should be returned");

            assert_eq!(result.local_path, local_path.to_string_lossy().as_ref());
            assert_eq!(result.content_type, "image/webp");

            std::fs::remove_file(&local_path).expect("cache file should be cleaned up");
        });
    }

    #[test]
    fn get_cached_asset_path_returns_none_for_missing_file() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("sqlite pool should connect");

            sqlx::query(
                r#"
                CREATE TABLE assets (
                    id TEXT PRIMARY KEY,
                    content_type TEXT
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("assets table should be created");

            sqlx::query(
                r#"
                CREATE TABLE local_asset_cache (
                    asset_id TEXT PRIMARY KEY,
                    local_path TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("local_asset_cache table should be created");

            sqlx::query("INSERT INTO local_asset_cache (asset_id, local_path) VALUES ('asset-1', '/nonexistent/path.webp')")
                .execute(&pool)
                .await
                .expect("cache row should be inserted");

            let result = cache::get_cached_asset_path("asset-1".to_string(), &pool)
                .await
                .expect("path lookup should succeed");

            assert!(result.is_none());
        });
    }

    #[test]
    fn get_pending_preview_path_returns_path_for_existing_file() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("sqlite pool should connect");

            sqlx::query(
                r#"
                CREATE TABLE pending_asset_processing_jobs (
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    attachment_field TEXT NOT NULL,
                    status TEXT NOT NULL,
                    preview_path TEXT,
                    preview_mime_type TEXT,
                    updated_at TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("generic asset jobs table should be created");

            let preview_bytes = b"preview-bytes";
            let preview_path = std::env::temp_dir().join(format!(
                "sakti-pos-preview-path-test-{}.jpg",
                current_job_id_string()
            ));
            std::fs::write(&preview_path, preview_bytes).expect("preview file should be written");

            sqlx::query(
                r#"
                INSERT INTO pending_asset_processing_jobs (
                    entity_type,
                    entity_id,
                    attachment_field,
                    status,
                    preview_path,
                    preview_mime_type,
                    updated_at
                ) VALUES ('product', 'product-1', 'image_asset_id', 'pending', ?1, ?2, ?3)
                "#,
            )
            .bind(preview_path.to_string_lossy().as_ref())
            .bind("image/jpeg")
            .bind(current_time_iso_string())
            .execute(&pool)
            .await
            .expect("generic preview job should be inserted");

            let result = processing_jobs::get_pending_preview_path_inner(&pool, "product-1")
                .await
                .expect("preview path lookup should succeed")
                .expect("preview path should be returned");

            assert_eq!(result.preview_path, preview_path.to_string_lossy().as_ref());
            assert_eq!(result.preview_mime_type, "image/jpeg");

            std::fs::remove_file(preview_path).expect("preview file should be cleaned up");
        });
    }

    #[test]
    fn get_pending_preview_path_returns_none_for_missing_file() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("sqlite pool should connect");

            sqlx::query(
                r#"
                CREATE TABLE pending_asset_processing_jobs (
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    attachment_field TEXT NOT NULL,
                    status TEXT NOT NULL,
                    preview_path TEXT,
                    preview_mime_type TEXT,
                    updated_at TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("generic asset jobs table should be created");

            sqlx::query(
                r#"
                INSERT INTO pending_asset_processing_jobs (
                    entity_type,
                    entity_id,
                    attachment_field,
                    status,
                    preview_path,
                    preview_mime_type,
                    updated_at
                ) VALUES ('product', 'product-1', 'image_asset_id', 'pending', '/nonexistent/preview.jpg', 'image/jpeg', ?1)
                "#,
            )
            .bind(current_time_iso_string())
            .execute(&pool)
            .await
            .expect("generic preview job should be inserted");

            let result = processing_jobs::get_pending_preview_path_inner(&pool, "product-1")
                .await
                .expect("preview path lookup should succeed");

            assert!(result.is_none());
        });
    }

    #[test]
    fn asset_cache_path_appends_webp_extension() {
        let root = Path::new("/tmp/cache");
        let path = asset_cache_file_path_from_root(root, "merchant-1/assets/asset-1")
            .expect("path should resolve");
        assert_eq!(
            path,
            PathBuf::from("/tmp/cache/merchant-1/assets/asset-1.webp")
        );
    }

    #[test]
    fn asset_cache_path_rejects_traversal() {
        let root = Path::new("/tmp/cache");
        assert!(asset_cache_file_path_from_root(root, "../bad").is_err());
    }

    #[test]
    fn asset_status_validator_accepts_queue_statuses() {
        assert!(is_valid_asset_status("pending_upload"));
        assert!(is_valid_asset_status("uploading"));
        assert!(is_valid_asset_status("ready"));
        assert!(is_valid_asset_status("pending_download"));
        assert!(is_valid_asset_status("downloading"));
        assert!(!is_valid_asset_status("invalid"));
    }

    #[test]
    fn pending_product_photo_job_status_validator_accepts_known_states() {
        assert!(is_valid_pending_product_photo_job_status("pending"));
        assert!(is_valid_pending_product_photo_job_status("processing"));
        assert!(is_valid_pending_product_photo_job_status("done"));
        assert!(is_valid_pending_product_photo_job_status("failed"));
        assert!(!is_valid_pending_product_photo_job_status("invalid"));
    }

    #[test]
    fn supported_asset_attachment_target_accepts_product_image() {
        let target = AssetAttachmentTarget {
            entity_type: "product".to_string(),
            entity_id: "product-1".to_string(),
            field: "image_asset_id".to_string(),
        };

        assert!(validate_asset_attachment_target(&target).is_ok());
    }

    #[test]
    fn supported_asset_attachment_target_metadata_is_centralized() {
        let target = AssetAttachmentTarget {
            entity_type: "product".to_string(),
            entity_id: "product-1".to_string(),
            field: "image_asset_id".to_string(),
        };

        let supported_target = super::targets::supported_asset_attachment_target(&target)
            .expect("target is supported");

        assert_eq!(supported_target.asset_kind, "product_photo");
        assert_eq!(supported_target.entity_type, "product");
        assert_eq!(supported_target.field, "image_asset_id");
    }

    #[test]
    fn supported_asset_attachment_target_rejects_unknown_field() {
        let target = AssetAttachmentTarget {
            entity_type: "product".to_string(),
            entity_id: "product-1".to_string(),
            field: "avatar_asset_id".to_string(),
        };

        assert!(validate_asset_attachment_target(&target).is_err());
    }

    #[test]
    fn asset_attachment_ready_payload_uses_generic_fields() {
        let payload = AssetAttachmentReadyPayload {
            asset_id: "asset-1".to_string(),
            entity_id: "product-1".to_string(),
            entity_type: "product".to_string(),
            field: "image_asset_id".to_string(),
        };
        let json = serde_json::to_value(payload).expect("payload serializes");

        assert_eq!(json["asset_id"], "asset-1");
        assert_eq!(json["entity_id"], "product-1");
        assert_eq!(json["entity_type"], "product");
        assert_eq!(json["field"], "image_asset_id");
    }

    #[test]
    fn asset_relative_path_uses_merchant_prefix() {
        let path = asset_relative_path("merchant-1", "a".repeat(64).as_str());
        assert_eq!(
            path,
            PathBuf::from("merchant-1/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        );
    }

    #[test]
    fn temp_original_path_must_not_be_asset_cache_path() {
        let asset_cache = PathBuf::from("/tmp/app/asset-cache/merchant/assets/hash.webp");
        assert!(!is_deletable_photo_input_path(&asset_cache));

        let photo_input = PathBuf::from("/tmp/app/product_photo_inputs/photo_1.jpg");
        assert!(is_deletable_photo_input_path(&photo_input));
    }

    #[test]
    fn original_filename_falls_back_to_path_file_name() {
        let path = PathBuf::from("/tmp/app/product_photo_inputs/photo_1.jpg");
        assert_eq!(
            normalize_original_filename("", &path),
            "photo_1.jpg".to_string()
        );
        assert_eq!(
            normalize_original_filename("custom.jpg", &path),
            "custom.jpg".to_string()
        );
    }

    #[test]
    fn empty_upload_url_means_asset_is_already_ready() {
        let response = asset_proto::AssetPresignUploadResponse {
            asset: None,
            upload_url: String::new(),
            required_headers: vec![],
        };

        assert!(presign_response_means_already_ready(&response));
    }

    #[test]
    fn ready_assets_keep_ready_status_when_reused() {
        assert_eq!(
            resolve_local_asset_persist_state(Some("ready")),
            LocalAssetPersistState {
                asset_status: "ready",
                cache_status: "ready",
                is_synced: 1,
                should_insert_sync_outbox: false,
            }
        );
        assert_eq!(
            resolve_local_asset_persist_state(Some("failed")),
            LocalAssetPersistState {
                asset_status: "pending_upload",
                cache_status: "pending_upload",
                is_synced: 0,
                should_insert_sync_outbox: true,
            }
        );
    }

    #[test]
    fn reused_assets_are_reconciled_ready_when_remote_is_ready() {
        let expected = LocalAssetPersistState {
            asset_status: "ready",
            cache_status: "ready",
            is_synced: 1,
            should_insert_sync_outbox: false,
        };

        assert_eq!(
            resolve_reused_asset_ready_state(Some("pending_upload")),
            expected
        );
        assert_eq!(resolve_reused_asset_ready_state(Some("failed")), expected);
    }
}
