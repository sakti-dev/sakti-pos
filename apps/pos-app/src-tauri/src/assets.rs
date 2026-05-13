use base64::engine::general_purpose;
use base64::Engine;
use exif::{In, Reader as ExifReader, Tag};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageReader};
use prost::Message;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{command, AppHandle, Manager, State};
use tokio::fs;
use zenwebp::{EncodeRequest, LossyConfig, PixelLayout};

use crate::drizzle_proxy::AppState;
use crate::time_utils::{current_job_id_string, current_time_iso_string};

#[allow(dead_code)]
mod asset_proto {
    include!(concat!(env!("OUT_DIR"), "/sakti.assets.v1.rs"));
}

const MAX_LONG_EDGE: u32 = 400;
const PREVIEW_MAX_LONG_EDGE: u32 = 320;
pub(crate) const PRODUCT_PHOTO_PREVIEW_MIME_TYPE: &str = "image/jpeg";
const WEBP_QUALITY: f32 = 75.0;
const WEBP_METHOD: u8 = 6;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessedImageResponse {
    pub byte_size: usize,
    pub content_hash: String,
    pub content_type: String,
    pub data_base64: String,
    pub height: u32,
    pub width: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedAssetResponse {
    pub local_path: String,
    pub object_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedAssetDataResponse {
    pub content_type: String,
    pub data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedAssetRecord {
    pub id: String,
    pub merchant_id: String,
    pub object_key: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub content_hash: String,
    pub kind: String,
    pub width: i32,
    pub height: i32,
    pub status: String,
    pub created_by_user_id: String,
    pub deleted_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedLocalAssetResponse {
    pub asset: PreparedAssetRecord,
    pub data_base64: String,
    pub local_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueProductPhotoProcessingResponse {
    pub job_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingProductPhotoPreviewResponse {
    pub preview_base64: String,
    pub preview_mime_type: String,
}

#[derive(Debug)]
pub(crate) struct ProductPhotoPreview {
    pub preview_base64: String,
    pub preview_mime_type: String,
}

struct PreparedImageInput {
    byte_size: i64,
    content_hash: String,
    content_type: String,
    data_base64: String,
    height: i32,
    kind: String,
    merchant_id: String,
    original_filename: String,
    width: i32,
}

#[derive(Debug)]
struct PendingProductPhotoJobRecord {
    id: String,
    product_id: String,
    merchant_id: String,
    temp_path: String,
    original_filename: String,
    kind: String,
    status: String,
    attempts: i64,
}

fn fit_within_max_edge(width: u32, height: u32, max_edge: u32) -> (u32, u32) {
    if width <= max_edge && height <= max_edge {
        return (width, height);
    }

    let longest_side = width.max(height) as f64;
    let scale = max_edge as f64 / longest_side;
    let scaled_width = (width as f64 * scale).round().max(1.0) as u32;
    let scaled_height = (height as f64 * scale).round().max(1.0) as u32;
    (scaled_width, scaled_height)
}

fn decode_image_bytes(data: &[u8], original_filename: &str) -> Result<DynamicImage, String> {
    ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|error| {
            format!(
                "Failed to detect image format for {}: {}",
                original_filename, error
            )
        })?
        .decode()
        .map_err(|error| format!("Failed to decode image {}: {}", original_filename, error))
}

fn read_exif_orientation(data: &[u8]) -> Option<u16> {
    let mut cursor = Cursor::new(data);
    ExifReader::new()
        .read_from_container(&mut cursor)
        .ok()
        .and_then(|exif| {
            exif.get_field(Tag::Orientation, In::PRIMARY)
                .and_then(|field| field.value.get_uint(0))
                .and_then(|value| u16::try_from(value).ok())
        })
}

fn apply_exif_orientation(image: DynamicImage, orientation: Option<u16>) -> DynamicImage {
    let Some(orientation) = orientation else {
        return image;
    };

    let rgba = image.to_rgba8();
    let transformed = match orientation {
        2 => image::imageops::flip_horizontal(&rgba),
        3 => image::imageops::rotate180(&rgba),
        4 => image::imageops::flip_vertical(&rgba),
        5 => image::imageops::rotate90(&image::imageops::flip_horizontal(&rgba)),
        6 => image::imageops::rotate90(&rgba),
        7 => image::imageops::rotate270(&image::imageops::flip_horizontal(&rgba)),
        8 => image::imageops::rotate270(&rgba),
        _ => rgba,
    };

    DynamicImage::ImageRgba8(transformed)
}

fn decode_oriented_image_bytes(
    data: &[u8],
    original_filename: &str,
) -> Result<DynamicImage, String> {
    let decoded = decode_image_bytes(data, original_filename)?;
    Ok(apply_exif_orientation(decoded, read_exif_orientation(data)))
}

fn process_image_bytes(
    data: &[u8],
    original_filename: &str,
) -> Result<ProcessedImageResponse, String> {
    let decoded = decode_oriented_image_bytes(data, original_filename)?;
    let rgba = decoded.to_rgba8();
    let (source_width, source_height) = rgba.dimensions();
    let (target_width, target_height) =
        fit_within_max_edge(source_width, source_height, MAX_LONG_EDGE);

    let processed = if target_width == source_width && target_height == source_height {
        rgba
    } else {
        image::imageops::resize(&rgba, target_width, target_height, FilterType::Triangle)
    };

    let encoder_config = LossyConfig::new()
        .with_quality(WEBP_QUALITY)
        .with_method(WEBP_METHOD);
    let webp_bytes = EncodeRequest::lossy(
        &encoder_config,
        processed.as_raw(),
        PixelLayout::Rgba8,
        target_width,
        target_height,
    )
    .encode()
    .map_err(|error| format!("Failed to encode {} to WebP: {}", original_filename, error))?;

    let content_hash = {
        let mut hasher = Sha256::new();
        hasher.update(&webp_bytes);
        format!("{:x}", hasher.finalize())
    };

    Ok(ProcessedImageResponse {
        byte_size: webp_bytes.len(),
        content_hash,
        content_type: "image/webp".to_string(),
        data_base64: general_purpose::STANDARD.encode(webp_bytes),
        height: target_height,
        width: target_width,
    })
}

pub(crate) fn product_photo_preview_from_bytes(
    data: &[u8],
    original_filename: &str,
) -> Result<ProductPhotoPreview, String> {
    let decoded = decode_oriented_image_bytes(data, original_filename)?;
    let rgba = decoded.to_rgba8();
    let (source_width, source_height) = rgba.dimensions();
    let (target_width, target_height) =
        fit_within_max_edge(source_width, source_height, PREVIEW_MAX_LONG_EDGE);

    let processed = if target_width == source_width && target_height == source_height {
        rgba
    } else {
        image::imageops::resize(&rgba, target_width, target_height, FilterType::Triangle)
    };

    let preview_rgb = DynamicImage::ImageRgba8(processed).to_rgb8();
    let mut preview_bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut preview_bytes, 75)
        .encode(
            preview_rgb.as_raw(),
            target_width,
            target_height,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|error| {
            format!(
                "Failed to encode preview for {}: {}",
                original_filename, error
            )
        })?;

    Ok(ProductPhotoPreview {
        preview_base64: general_purpose::STANDARD.encode(preview_bytes),
        preview_mime_type: PRODUCT_PHOTO_PREVIEW_MIME_TYPE.to_string(),
    })
}

fn validate_object_key(object_key: &str) -> Result<(), String> {
    if object_key.is_empty() || object_key.starts_with('/') {
        return Err("Invalid asset object key".to_string());
    }

    for component in Path::new(object_key).components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Invalid asset object key".to_string());
        }
    }

    Ok(())
}

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

#[cfg(test)]
fn asset_relative_path(merchant_id: &str, content_hash: &str) -> PathBuf {
    PathBuf::from(format!("{merchant_id}/assets/{content_hash}"))
}

fn asset_object_key(merchant_id: &str, content_hash: &str) -> String {
    format!("{merchant_id}/assets/{content_hash}")
}

fn is_deletable_photo_input_path(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "product_photo_inputs")
}

fn normalize_original_filename(original_filename: &str, path: &Path) -> String {
    let trimmed = original_filename.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }

    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("product-photo")
        .to_string()
}

fn asset_cache_file_path_from_root(root: &Path, object_key: &str) -> Result<PathBuf, String> {
    validate_object_key(object_key)?;
    Ok(root.join(format!("{object_key}.webp")))
}

fn asset_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("asset-cache"))
        .map_err(|_| "Could not resolve app config directory".to_string())
}

fn build_api_client(session_token: &str) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Bearer {session_token}"))
            .map_err(|error| format!("Invalid token: {}", error))?,
    );
    reqwest::Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {}", error))
}

fn build_signed_url_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to build signed URL client: {}", error))
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
    let request_body = request.encode_to_vec();
    let response = client
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|error| format!("Request to {} failed: {}", url, error))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Request to {} failed ({}): {}", url, status, text));
    }

    let body = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read response from {}: {}", url, error))?;
    Res::decode(body.as_ref()).map_err(|error| format!("Failed to decode response: {}", error))
}

fn presign_response_means_already_ready(
    response: &asset_proto::AssetPresignUploadResponse,
) -> bool {
    response.upload_url.trim().is_empty()
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

fn asset_headers_to_map(
    headers: &[asset_proto::AssetHeader],
) -> Result<reqwest::header::HeaderMap, String> {
    let mut header_map = reqwest::header::HeaderMap::new();
    for header in headers {
        let name = reqwest::header::HeaderName::from_bytes(header.name.as_bytes())
            .map_err(|error| format!("Invalid header name {}: {}", header.name, error))?;
        let value = reqwest::header::HeaderValue::from_str(&header.value)
            .map_err(|error| format!("Invalid header value for {}: {}", header.name, error))?;
        header_map.insert(name, value);
    }
    Ok(header_map)
}

async fn put_bytes_to_signed_url(
    client: &reqwest::Client,
    url: &str,
    headers: &[asset_proto::AssetHeader],
    bytes: &[u8],
) -> Result<(), String> {
    let header_map = asset_headers_to_map(headers)?;
    let response = client
        .put(url)
        .headers(header_map)
        .body(bytes.to_vec())
        .send()
        .await
        .map_err(|error| format!("Signed upload request failed: {}", error))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Signed upload request failed ({}): {}",
            status, text
        ));
    }

    Ok(())
}

async fn write_cached_asset(
    app: &AppHandle,
    object_key: &str,
    bytes: &[u8],
) -> Result<String, String> {
    let root = asset_cache_root(app)?;
    let path = asset_cache_file_path_from_root(&root, object_key)?;
    let path_for_write = path.clone();
    fs::create_dir_all(
        path_for_write
            .parent()
            .ok_or_else(|| "Invalid asset cache path".to_string())?,
    )
    .await
    .map_err(|error| format!("Failed to create asset cache directory: {}", error))?;
    fs::write(&path_for_write, bytes)
        .await
        .map_err(|error| format!("Failed to write asset cache file: {}", error))?;
    Ok(path.to_string_lossy().to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
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
    let rows = sqlx::query(
        r#"
        SELECT
          a.id AS asset_id,
          a.merchant_id,
          a.object_key,
          a.original_filename,
          a.content_type,
          a.byte_size,
          a.content_hash,
          a.kind,
          a.width,
          a.height,
          c.local_path
        FROM assets a
        INNER JOIN local_asset_cache c ON c.asset_id = a.id
        WHERE a.merchant_id = ?1
          AND a.status = 'pending_upload'
          AND c.status = 'pending_upload'
        ORDER BY a.created_at ASC
        LIMIT ?2
        "#,
    )
    .bind(merchant_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to load pending uploads: {}", error))?;

    let mut assets = Vec::with_capacity(rows.len());
    for row in rows {
        assets.push(PendingUploadAsset {
            asset_id: row
                .try_get("asset_id")
                .map_err(|error| format!("Failed to read asset_id: {}", error))?,
            merchant_id: row
                .try_get("merchant_id")
                .map_err(|error| format!("Failed to read merchant_id: {}", error))?,
            object_key: row
                .try_get("object_key")
                .map_err(|error| format!("Failed to read object_key: {}", error))?,
            original_filename: row
                .try_get::<Option<String>, _>("original_filename")
                .map_err(|error| format!("Failed to read original_filename: {}", error))?,
            content_type: row
                .try_get("content_type")
                .map_err(|error| format!("Failed to read content_type: {}", error))?,
            byte_size: row
                .try_get("byte_size")
                .map_err(|error| format!("Failed to read byte_size: {}", error))?,
            content_hash: row
                .try_get("content_hash")
                .map_err(|error| format!("Failed to read content_hash: {}", error))?,
            kind: row
                .try_get("kind")
                .map_err(|error| format!("Failed to read kind: {}", error))?,
            width: row
                .try_get::<Option<i64>, _>("width")
                .map_err(|error| format!("Failed to read width: {}", error))?,
            height: row
                .try_get::<Option<i64>, _>("height")
                .map_err(|error| format!("Failed to read height: {}", error))?,
            local_path: row
                .try_get("local_path")
                .map_err(|error| format!("Failed to read local_path: {}", error))?,
        });
    }

    Ok(assets)
}

async fn load_ready_assets(
    pool: &SqlitePool,
    merchant_id: &str,
    limit: i64,
) -> Result<Vec<PendingUploadAsset>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
          a.id AS asset_id,
          a.merchant_id,
          a.object_key,
          a.original_filename,
          a.content_type,
          a.byte_size,
          a.content_hash,
          a.kind,
          a.width,
          a.height,
          c.local_path
        FROM assets a
        LEFT JOIN local_asset_cache c ON c.asset_id = a.id
        WHERE a.merchant_id = ?1
          AND a.status = 'ready'
        ORDER BY a.created_at ASC
        LIMIT ?2
        "#,
    )
    .bind(merchant_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to load ready assets: {}", error))?;

    let mut assets = Vec::with_capacity(rows.len());
    for row in rows {
        let local_path = row
            .try_get::<Option<String>, _>("local_path")
            .map_err(|error| format!("Failed to read local_path: {}", error))?
            .unwrap_or_default();
        assets.push(PendingUploadAsset {
            asset_id: row
                .try_get("asset_id")
                .map_err(|error| format!("Failed to read asset_id: {}", error))?,
            merchant_id: row
                .try_get("merchant_id")
                .map_err(|error| format!("Failed to read merchant_id: {}", error))?,
            object_key: row
                .try_get("object_key")
                .map_err(|error| format!("Failed to read object_key: {}", error))?,
            original_filename: row
                .try_get::<Option<String>, _>("original_filename")
                .map_err(|error| format!("Failed to read original_filename: {}", error))?,
            content_type: row
                .try_get("content_type")
                .map_err(|error| format!("Failed to read content_type: {}", error))?,
            byte_size: row
                .try_get("byte_size")
                .map_err(|error| format!("Failed to read byte_size: {}", error))?,
            content_hash: row
                .try_get("content_hash")
                .map_err(|error| format!("Failed to read content_hash: {}", error))?,
            kind: row
                .try_get("kind")
                .map_err(|error| format!("Failed to read kind: {}", error))?,
            width: row
                .try_get::<Option<i64>, _>("width")
                .map_err(|error| format!("Failed to read width: {}", error))?,
            height: row
                .try_get::<Option<i64>, _>("height")
                .map_err(|error| format!("Failed to read height: {}", error))?,
            local_path,
        });
    }

    Ok(assets)
}

pub(crate) async fn reset_incomplete_pending_product_photo_jobs(
    pool: &SqlitePool,
) -> Result<(), String> {
    let now = current_time_iso_string();
    sqlx::query(
        "UPDATE pending_product_photo_jobs SET status = 'pending', last_error = NULL, updated_at = ?2 WHERE status = 'processing'",
    )
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to reset pending product photo jobs: {}", error))?;
    Ok(())
}

async fn load_pending_product_photo_jobs(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<PendingProductPhotoJobRecord>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
          id,
          product_id,
          merchant_id,
          temp_path,
          original_filename,
          kind,
          status,
          attempts
        FROM pending_product_photo_jobs
        WHERE status IN ('pending', 'failed')
        ORDER BY created_at ASC, updated_at ASC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to load pending product photo jobs: {}", error))?;

    let mut jobs = Vec::with_capacity(rows.len());
    for row in rows {
        jobs.push(PendingProductPhotoJobRecord {
            id: row
                .try_get("id")
                .map_err(|error| format!("Failed to read job id: {}", error))?,
            product_id: row
                .try_get("product_id")
                .map_err(|error| format!("Failed to read job product_id: {}", error))?,
            merchant_id: row
                .try_get("merchant_id")
                .map_err(|error| format!("Failed to read job merchant_id: {}", error))?,
            temp_path: row
                .try_get("temp_path")
                .map_err(|error| format!("Failed to read job temp_path: {}", error))?,
            original_filename: row
                .try_get("original_filename")
                .map_err(|error| format!("Failed to read job original_filename: {}", error))?,
            kind: row
                .try_get("kind")
                .map_err(|error| format!("Failed to read job kind: {}", error))?,
            status: row
                .try_get("status")
                .map_err(|error| format!("Failed to read job status: {}", error))?,
            attempts: row
                .try_get("attempts")
                .map_err(|error| format!("Failed to read job attempts: {}", error))?,
        });
    }

    Ok(jobs)
}

async fn claim_pending_product_photo_job(
    pool: &SqlitePool,
    job_id: &str,
) -> Result<Option<PendingProductPhotoJobRecord>, String> {
    let now = current_time_iso_string();
    let row = sqlx::query(
        r#"
        UPDATE pending_product_photo_jobs
        SET status = 'processing',
            attempts = attempts + 1,
            last_error = NULL,
            updated_at = ?2
        WHERE id = ?1
          AND status IN ('pending', 'failed')
        RETURNING
          id,
          product_id,
          merchant_id,
          temp_path,
          original_filename,
          kind,
          status,
          attempts
        "#,
    )
    .bind(job_id)
    .bind(now)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to claim pending product photo job: {}", error))?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(PendingProductPhotoJobRecord {
        id: row
            .try_get("id")
            .map_err(|error| format!("Failed to read job id: {}", error))?,
        product_id: row
            .try_get("product_id")
            .map_err(|error| format!("Failed to read job product_id: {}", error))?,
        merchant_id: row
            .try_get("merchant_id")
            .map_err(|error| format!("Failed to read job merchant_id: {}", error))?,
        temp_path: row
            .try_get("temp_path")
            .map_err(|error| format!("Failed to read job temp_path: {}", error))?,
        original_filename: row
            .try_get("original_filename")
            .map_err(|error| format!("Failed to read job original_filename: {}", error))?,
        kind: row
            .try_get("kind")
            .map_err(|error| format!("Failed to read job kind: {}", error))?,
        status: row
            .try_get("status")
            .map_err(|error| format!("Failed to read job status: {}", error))?,
        attempts: row
            .try_get("attempts")
            .map_err(|error| format!("Failed to read job attempts: {}", error))?,
    }))
}

async fn clear_pending_product_photo_job_preview(
    pool: &SqlitePool,
    job_id: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE pending_product_photo_jobs SET preview_base64 = NULL, preview_mime_type = NULL, updated_at = ?2 WHERE id = ?1",
    )
    .bind(job_id)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to clear pending product photo job preview: {}", error))?;
    Ok(())
}

async fn mark_pending_product_photo_job_failed(
    pool: &SqlitePool,
    job_id: &str,
    error_message: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE pending_product_photo_jobs SET status = 'failed', preview_base64 = NULL, preview_mime_type = NULL, last_error = ?2, updated_at = ?3 WHERE id = ?1",
    )
    .bind(job_id)
    .bind(error_message)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark pending product photo job failed: {}", error))?;
    Ok(())
}

async fn delete_pending_product_photo_job(pool: &SqlitePool, job_id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM pending_product_photo_jobs WHERE id = ?1")
        .bind(job_id)
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to delete pending product photo job: {}", error))?;
    Ok(())
}

async fn update_product_image_asset_id(
    pool: &SqlitePool,
    product_id: &str,
    merchant_id: &str,
    asset_id: &str,
) -> Result<(), String> {
    let now = current_time_iso_string();
    let result = sqlx::query(
        "UPDATE products SET image_asset_id = ?2, is_synced = 0, updated_at = ?3 WHERE id = ?1 AND merchant_id = ?4 AND deleted_at IS NULL",
    )
    .bind(product_id)
    .bind(asset_id)
    .bind(&now)
    .bind(merchant_id)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to update product image asset: {}", error))?;

    if result.rows_affected() == 0 {
        return Err(format!(
            "Product {} was not found while linking photo asset",
            product_id
        ));
    }

    insert_sync_outbox(
        pool,
        product_id,
        "merchant",
        merchant_id,
        "products",
        "update",
    )
    .await
}

async fn mark_asset_uploading(pool: &SqlitePool, asset_id: &str) -> Result<(), String> {
    sqlx::query(
        "UPDATE local_asset_cache SET status = 'uploading', upload_attempts = upload_attempts + 1, last_error = NULL, updated_at = ?2 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark asset uploading: {}", error))?;
    Ok(())
}

async fn mark_asset_upload_failed(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
    error_message: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE local_asset_cache SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(error_message)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark asset failed: {}", error))?;
    sqlx::query(
        "UPDATE assets SET status = 'failed', is_synced = 0, updated_at = ?2 WHERE id = ?1",
    )
    .bind(asset_id)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark asset failed: {}", error))?;
    insert_sync_outbox(pool, asset_id, "merchant", merchant_id, "assets", "update").await?;
    Ok(())
}

async fn mark_asset_ready(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    let now = current_time_iso_string();
    sqlx::query(
        "UPDATE local_asset_cache SET status = 'ready', last_error = NULL, cached_at = ?2, updated_at = ?2 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark local cache ready: {}", error))?;
    sqlx::query("UPDATE assets SET status = 'ready', is_synced = 0, updated_at = ?2 WHERE id = ?1")
        .bind(asset_id)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to mark asset ready: {}", error))?;
    insert_sync_outbox(pool, asset_id, "merchant", merchant_id, "assets", "update").await?;
    Ok(())
}

async fn mark_reused_asset_ready(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    let state = resolve_reused_asset_ready_state(None);
    let now = current_time_iso_string();
    sqlx::query(
        "UPDATE local_asset_cache SET status = ?2, last_error = NULL, cached_at = ?3, updated_at = ?3 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(state.cache_status)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark local cache ready: {}", error))?;
    sqlx::query("UPDATE assets SET status = ?2, is_synced = ?3, updated_at = ?4 WHERE id = ?1")
        .bind(asset_id)
        .bind(state.asset_status)
        .bind(state.is_synced)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to mark reused asset ready: {}", error))?;
    if state.should_insert_sync_outbox {
        insert_sync_outbox(pool, asset_id, "merchant", merchant_id, "assets", "update").await?;
    }
    Ok(())
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

#[command]
pub async fn process_image_to_webp(
    data_base64: String,
    mime_type: String,
    original_filename: String,
) -> Result<ProcessedImageResponse, String> {
    let _ = mime_type;
    eprintln!(
        "[PHOTO-DEBUG] process_image_to_webp:start filename={}",
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
        eprintln!(
            "[PHOTO-DEBUG] process_image_to_webp:done filename={} width={} height={} byte_size={} content_hash={}",
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

async fn prepare_local_product_image_asset_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    input: PreparedImageInput,
) -> Result<PreparedLocalAssetResponse, String> {
    let data_base64 = input.data_base64;
    let bytes = general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|error| format!("Failed to decode asset payload: {}", error))?;

    if sha256_hex(&bytes) != input.content_hash {
        return Err("Compressed asset hash mismatch".to_string());
    }

    let object_key = asset_object_key(&input.merchant_id, &input.content_hash);
    let local_path = write_cached_asset(&app, &object_key, &bytes).await?;
    let now = current_time_iso_string();
    let asset_id = input.content_hash.clone();
    let normalized_original_filename = if input.original_filename.trim().is_empty() {
        None
    } else {
        Some(input.original_filename.clone())
    };
    let existing_status = sqlx::query(
        r#"
        SELECT status
        FROM assets
        WHERE id = ?1
        LIMIT 1
        "#,
    )
    .bind(&asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to inspect existing local asset: {}", error))?
    .map(|row| row.try_get::<String, _>(0))
    .transpose()
    .map_err(|error| format!("Failed to inspect existing local asset: {}", error))?;
    let persist_state = resolve_local_asset_persist_state(existing_status.as_deref());

    sqlx::query(
        r#"
        INSERT INTO assets (
          id,
          merchant_id,
          object_key,
          original_filename,
          content_type,
          byte_size,
          content_hash,
          kind,
          width,
          height,
          status,
          created_by_user_id,
          deleted_at,
          is_synced,
          created_at,
          updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL, ?12, ?13, ?13
        )
        ON CONFLICT(id) DO UPDATE SET
          merchant_id = excluded.merchant_id,
          object_key = excluded.object_key,
          original_filename = excluded.original_filename,
          content_type = excluded.content_type,
          byte_size = excluded.byte_size,
          content_hash = excluded.content_hash,
          kind = excluded.kind,
          width = excluded.width,
          height = excluded.height,
          status = excluded.status,
          deleted_at = NULL,
          is_synced = excluded.is_synced,
          updated_at = excluded.updated_at
        "#,
    )
    .bind(&asset_id)
    .bind(&input.merchant_id)
    .bind(&object_key)
    .bind(normalized_original_filename.as_deref())
    .bind(&input.content_type)
    .bind(input.byte_size)
    .bind(&input.content_hash)
    .bind(&input.kind)
    .bind(input.width)
    .bind(input.height)
    .bind(persist_state.asset_status)
    .bind(persist_state.is_synced)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to save local asset: {}", error))?;

    let cache_cached_at = if persist_state.cache_status == "ready" {
        Some(now.clone())
    } else {
        None
    };

    sqlx::query(
        r#"
        INSERT INTO local_asset_cache (
          asset_id,
          merchant_id,
          object_key,
          local_path,
          content_hash,
          status,
          upload_attempts,
          download_attempts,
          last_error,
          cached_at,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, NULL, ?7, ?8, ?8)
        ON CONFLICT(asset_id) DO UPDATE SET
          merchant_id = excluded.merchant_id,
          object_key = excluded.object_key,
          local_path = excluded.local_path,
          content_hash = excluded.content_hash,
          status = excluded.status,
          last_error = NULL,
          cached_at = excluded.cached_at,
          updated_at = excluded.updated_at
        "#,
    )
    .bind(&asset_id)
    .bind(&input.merchant_id)
    .bind(&object_key)
    .bind(&local_path)
    .bind(&input.content_hash)
    .bind(persist_state.cache_status)
    .bind(cache_cached_at)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to save local asset cache: {}", error))?;

    if persist_state.should_insert_sync_outbox {
        insert_sync_outbox(
            pool,
            &asset_id,
            "merchant",
            &input.merchant_id,
            "assets",
            "insert",
        )
        .await?;
    }
    eprintln!(
        "[PHOTO-DEBUG] prepare_local_product_image_asset:done asset_id={} object_key={} local_path={}",
        asset_id,
        object_key,
        local_path
    );

    let asset = PreparedAssetRecord {
        id: asset_id,
        merchant_id: input.merchant_id,
        object_key,
        original_filename: input.original_filename,
        content_type: input.content_type,
        byte_size: input.byte_size,
        content_hash: input.content_hash,
        kind: input.kind,
        width: input.width,
        height: input.height,
        status: persist_state.asset_status.to_string(),
        created_by_user_id: String::new(),
        deleted_at: String::new(),
        created_at: now.clone(),
        updated_at: now,
    };

    Ok(PreparedLocalAssetResponse {
        asset,
        data_base64,
        local_path,
    })
}

#[command]
pub async fn prepare_local_product_image_asset(
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
    eprintln!(
        "[PHOTO-DEBUG] prepare_local_product_image_asset:start merchant_id={} filename={} kind={} byte_size={}",
        merchant_id, original_filename, kind, byte_size
    );

    prepare_local_product_image_asset_inner(
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

async fn prepare_local_product_image_asset_from_path_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    merchant_id: String,
    original_filename: String,
    kind: String,
    path: String,
    delete_original: bool,
) -> Result<PreparedLocalAssetResponse, String> {
    let path_buf = PathBuf::from(&path);
    eprintln!(
        "[PHOTO-DEBUG] process_image_path:start path={} filename={} kind={}",
        path, original_filename, kind
    );

    let normalized_filename = normalize_original_filename(&original_filename, &path_buf);
    let data = fs::read(&path_buf)
        .await
        .map_err(|error| format!("Failed to read selected image path: {}", error))?;

    let processed = tauri::async_runtime::spawn_blocking({
        let normalized_filename = normalized_filename.clone();
        move || process_image_bytes(&data, &normalized_filename)
    })
    .await
    .map_err(|error| format!("Failed to process image path on blocking thread: {}", error))??;

    let result = prepare_local_product_image_asset_inner(
        app,
        pool,
        PreparedImageInput {
            byte_size: processed.byte_size as i64,
            content_hash: processed.content_hash,
            content_type: processed.content_type,
            data_base64: processed.data_base64,
            height: processed.height as i32,
            kind,
            merchant_id,
            original_filename: normalized_filename,
            width: processed.width as i32,
        },
    )
    .await;

    if result.is_ok() && delete_original && is_deletable_photo_input_path(&path_buf) {
        match fs::remove_file(&path_buf).await {
            Ok(()) => eprintln!("[PHOTO-DEBUG] process_image_path:delete_original path={path}"),
            Err(error) => eprintln!(
                "[PHOTO-DEBUG] process_image_path:delete_original_failed path={} error={}",
                path, error
            ),
        }
    }

    if let Ok(response) = &result {
        eprintln!(
            "[PHOTO-DEBUG] process_image_path:done asset_id={} local_path={}",
            response.asset.id, response.local_path
        );
    }

    result
}

#[command]
pub async fn prepare_local_product_image_asset_from_path(
    app: AppHandle,
    state: State<'_, AppState>,
    merchant_id: String,
    original_filename: String,
    kind: String,
    path: String,
) -> Result<PreparedLocalAssetResponse, String> {
    prepare_local_product_image_asset_from_path_inner(
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

#[command]
pub async fn cache_asset_webp(
    app: AppHandle,
    object_key: String,
    data_base64: String,
) -> Result<CachedAssetResponse, String> {
    eprintln!(
        "[PHOTO-DEBUG] cache_asset_webp:start object_key={}",
        object_key
    );
    let root = asset_cache_root(&app)?;
    let path = asset_cache_file_path_from_root(&root, &object_key)?;
    let bytes = general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| format!("Failed to decode asset payload: {}", error))?;

    let path_for_write = path.clone();
    fs::create_dir_all(
        path_for_write
            .parent()
            .ok_or_else(|| "Invalid asset cache path".to_string())?,
    )
    .await
    .map_err(|error| format!("Failed to create asset cache directory: {}", error))?;
    fs::write(&path_for_write, bytes)
        .await
        .map_err(|error| format!("Failed to write asset cache file: {}", error))?;
    eprintln!(
        "[PHOTO-DEBUG] cache_asset_webp:done object_key={} local_path={}",
        object_key,
        path.to_string_lossy()
    );

    Ok(CachedAssetResponse {
        local_path: path.to_string_lossy().to_string(),
        object_key,
    })
}

#[command]
pub async fn read_cached_asset_data(
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<Option<CachedAssetDataResponse>, String> {
    let row = sqlx::query(
        r#"
        SELECT c.local_path, COALESCE(a.content_type, 'image/webp') AS content_type
        FROM local_asset_cache c
        LEFT JOIN assets a ON a.id = c.asset_id
        WHERE c.asset_id = ?1
        LIMIT 1
        "#,
    )
    .bind(&asset_id)
    .fetch_optional(&state.db_pool)
    .await
    .map_err(|error| format!("Failed to inspect cached asset: {}", error))?;

    let Some(row) = row else {
        return Ok(None);
    };
    let local_path: String = row
        .try_get("local_path")
        .map_err(|error| format!("Failed to read cached asset path: {}", error))?;
    let content_type: String = row
        .try_get("content_type")
        .map_err(|error| format!("Failed to read cached asset content type: {}", error))?;

    match fs::read(&local_path).await {
        Ok(bytes) => Ok(Some(CachedAssetDataResponse {
            content_type,
            data_base64: general_purpose::STANDARD.encode(bytes),
        })),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            eprintln!(
                "[PHOTO-DEBUG] read_cached_asset_data:missing asset_id={} local_path={}",
                asset_id, local_path
            );
            Ok(None)
        }
        Err(error) => Err(format!("Failed to read cached asset data: {}", error)),
    }
}

async fn get_pending_product_photo_preview_inner(
    pool: &SqlitePool,
    product_id: &str,
) -> Result<Option<PendingProductPhotoPreviewResponse>, String> {
    let row = sqlx::query(
        r#"
        SELECT preview_base64, preview_mime_type
        FROM pending_product_photo_jobs
        WHERE product_id = ?1
          AND status IN ('pending', 'processing')
          AND preview_base64 IS NOT NULL
          AND preview_mime_type IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(product_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to inspect pending product photo preview: {}", error))?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(PendingProductPhotoPreviewResponse {
        preview_base64: row
            .try_get("preview_base64")
            .map_err(|error| format!("Failed to read preview_base64: {}", error))?,
        preview_mime_type: row
            .try_get("preview_mime_type")
            .map_err(|error| format!("Failed to read preview_mime_type: {}", error))?,
    }))
}

#[command]
pub async fn get_pending_product_photo_preview(
    product_id: String,
    state: State<'_, AppState>,
) -> Result<Option<PendingProductPhotoPreviewResponse>, String> {
    get_pending_product_photo_preview_inner(&state.db_pool, &product_id).await
}

pub(crate) async fn process_pending_product_photo_jobs_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    limit: i64,
) -> Result<i64, String> {
    let limit = limit.max(1);
    eprintln!("[PHOTO-DEBUG] product_photo_jobs:start limit={}", limit);
    let pending_jobs = load_pending_product_photo_jobs(pool, limit).await?;
    eprintln!(
        "[PHOTO-DEBUG] product_photo_jobs:pending count={}",
        pending_jobs.len()
    );

    let mut processed = 0i64;
    for job in pending_jobs {
        eprintln!(
            "[PHOTO-DEBUG] product_photo_job:start job_id={} product_id={} attempts={} status={}",
            job.id, job.product_id, job.attempts, job.status
        );
        let Some(claimed_job) = claim_pending_product_photo_job(pool, &job.id).await? else {
            eprintln!(
                "[PHOTO-DEBUG] product_photo_job:skip job_id={} reason=already_claimed",
                job.id
            );
            continue;
        };

        let result = prepare_local_product_image_asset_from_path_inner(
            app,
            pool,
            claimed_job.merchant_id.clone(),
            claimed_job.original_filename.clone(),
            claimed_job.kind.clone(),
            claimed_job.temp_path.clone(),
            false,
        )
        .await;

        let prepared = match result {
            Ok(response) => response,
            Err(error) => {
                eprintln!(
                    "[PHOTO-DEBUG] product_photo_job:failed job_id={} stage=process error={}",
                    claimed_job.id, error
                );
                mark_pending_product_photo_job_failed(pool, &claimed_job.id, &error).await?;
                continue;
            }
        };

        let asset_id = prepared.asset.id.clone();
        if let Err(error) = update_product_image_asset_id(
            pool,
            &claimed_job.product_id,
            &claimed_job.merchant_id,
            &asset_id,
        )
        .await
        {
            eprintln!(
                "[PHOTO-DEBUG] product_photo_job:failed job_id={} stage=link error={}",
                claimed_job.id, error
            );
            mark_pending_product_photo_job_failed(pool, &claimed_job.id, &error).await?;
            continue;
        }

        if let Err(error) = clear_pending_product_photo_job_preview(pool, &claimed_job.id).await {
            eprintln!(
                "[PHOTO-DEBUG] product_photo_job:preview_clear_failed job_id={} error={}",
                claimed_job.id, error
            );
        }

        if let Err(error) = sqlx::query(
            "UPDATE pending_product_photo_jobs SET status = 'done', last_error = NULL, updated_at = ?2 WHERE id = ?1",
        )
        .bind(&claimed_job.id)
        .bind(current_time_iso_string())
        .execute(pool)
        .await
        {
            let message = format!("Failed to mark pending product photo job done: {}", error);
            eprintln!(
                "[PHOTO-DEBUG] product_photo_job:failed job_id={} stage=done error={}",
                claimed_job.id, message
            );
            mark_pending_product_photo_job_failed(pool, &claimed_job.id, &message).await?;
            continue;
        }

        if is_deletable_photo_input_path(Path::new(&claimed_job.temp_path)) {
            if let Err(error) = fs::remove_file(&claimed_job.temp_path).await {
                eprintln!(
                    "[PHOTO-DEBUG] product_photo_job:cleanup_failed job_id={} path={} error={}",
                    claimed_job.id, claimed_job.temp_path, error
                );
            }
        }

        if let Err(error) = delete_pending_product_photo_job(pool, &claimed_job.id).await {
            eprintln!(
                "[PHOTO-DEBUG] product_photo_job:cleanup_row_failed job_id={} error={}",
                claimed_job.id, error
            );
        }

        eprintln!(
            "[PHOTO-DEBUG] product_photo_job:done job_id={} product_id={} asset_id={}",
            claimed_job.id, claimed_job.product_id, asset_id
        );
        processed += 1;
    }

    eprintln!(
        "[PHOTO-DEBUG] product_photo_jobs:done processed={}",
        processed
    );
    Ok(processed)
}

#[command]
pub async fn process_pending_product_photo_jobs(
    limit: Option<i64>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<i64, String> {
    process_pending_product_photo_jobs_inner(&app, &state.db_pool, limit.unwrap_or(20)).await
}

#[command]
pub async fn enqueue_product_photo_processing(
    state: State<'_, AppState>,
    product_id: String,
    merchant_id: String,
    path: String,
    original_filename: String,
    kind: String,
    preview_base64: Option<String>,
    preview_mime_type: Option<String>,
) -> Result<EnqueueProductPhotoProcessingResponse, String> {
    let path_buf = PathBuf::from(&path);
    if !is_deletable_photo_input_path(&path_buf) {
        return Err("Refusing to enqueue non product photo temp path".to_string());
    }

    let preview_mime_type = preview_mime_type.unwrap_or_else(|| "image/jpeg".to_string());
    let now = current_time_iso_string();
    let job_id = current_job_id_string();
    let returned_job_id = sqlx::query_scalar::<_, String>(
        r#"
        INSERT INTO pending_product_photo_jobs (
          id,
          product_id,
          merchant_id,
          temp_path,
          original_filename,
          kind,
          preview_mime_type,
          preview_base64,
          status,
          attempts,
          last_error,
          created_at,
          updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', 0, NULL, ?9, ?9
        )
        ON CONFLICT(product_id) DO UPDATE SET
          id = excluded.id,
          merchant_id = excluded.merchant_id,
          temp_path = excluded.temp_path,
          original_filename = excluded.original_filename,
          kind = excluded.kind,
          preview_mime_type = excluded.preview_mime_type,
          preview_base64 = excluded.preview_base64,
          status = 'pending',
          attempts = 0,
          last_error = NULL,
          updated_at = excluded.updated_at
        RETURNING id
        "#,
    )
    .bind(&job_id)
    .bind(&product_id)
    .bind(&merchant_id)
    .bind(&path)
    .bind(&original_filename)
    .bind(&kind)
    .bind(&preview_mime_type)
    .bind(preview_base64.as_deref())
    .bind(&now)
    .fetch_one(&state.db_pool)
    .await
    .map_err(|error| format!("Failed to enqueue pending product photo job: {}", error))?;

    eprintln!(
        "[PHOTO-DEBUG] product_photo_job:enqueued job_id={} product_id={} path={}",
        returned_job_id, product_id, path
    );

    Ok(EnqueueProductPhotoProcessingResponse {
        job_id: returned_job_id,
    })
}

#[command]
pub async fn upload_pending_product_images(
    api_url: String,
    session_token: String,
    merchant_id: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let pool = &state.db_pool;
    let api_client = build_api_client(&session_token)?;
    let signed_url_client = build_signed_url_client()?;
    let limit = limit.unwrap_or(20).max(1);
    eprintln!(
        "[PHOTO-DEBUG] upload_pending_product_images:start merchant_id={} limit={} api_url={}",
        merchant_id, limit, api_url
    );
    let pending_assets = load_pending_upload_assets(pool, &merchant_id, limit).await?;
    eprintln!(
        "[PHOTO-DEBUG] upload_pending_product_images:pending count={}",
        pending_assets.len()
    );
    let mut processed = 0usize;

    for asset in pending_assets {
        eprintln!(
            "[PHOTO-DEBUG] upload_asset:start asset_id={} object_key={} local_path={} byte_size={}",
            asset.asset_id, asset.object_key, asset.local_path, asset.byte_size
        );
        mark_asset_uploading(pool, &asset.asset_id).await?;

        let file_bytes = match fs::read(&asset.local_path).await {
            Ok(bytes) => bytes,
            Err(error) => {
                let message = format!("Failed to read cached asset {}: {}", asset.asset_id, error);
                eprintln!(
                    "[PHOTO-DEBUG] upload_asset:failed asset_id={} error={}",
                    asset.asset_id, message
                );
                mark_asset_upload_failed(pool, &asset.asset_id, &asset.merchant_id, &message)
                    .await?;
                continue;
            }
        };

        if sha256_hex(&file_bytes) != asset.content_hash {
            let message = format!("Content hash mismatch for asset {}", asset.asset_id);
            eprintln!(
                "[PHOTO-DEBUG] upload_asset:failed asset_id={} error={}",
                asset.asset_id, message
            );
            mark_asset_upload_failed(pool, &asset.asset_id, &asset.merchant_id, &message).await?;
            continue;
        }

        let request = asset_proto::AssetPresignUploadRequest {
            asset_id: asset.asset_id.clone(),
            object_key: asset.object_key.clone(),
            merchant_id: asset.merchant_id.clone(),
            content_hash: asset.content_hash.clone(),
            byte_size: asset.byte_size,
            content_type: asset.content_type.clone(),
            kind: asset.kind.clone(),
            original_filename: asset.original_filename.clone().unwrap_or_default(),
            width: asset.width.unwrap_or_default() as i32,
            height: asset.height.unwrap_or_default() as i32,
        };
        let presign_url = format!("{}/api/assets/presign-upload", api_url);
        eprintln!(
            "[PHOTO-DEBUG] upload_asset:presign_request asset_id={} endpoint={}",
            asset.asset_id, presign_url
        );
        let presign_response: asset_proto::AssetPresignUploadResponse =
            match post_protobuf(&api_client, &presign_url, &request).await {
                Ok(response) => response,
                Err(error) => {
                    eprintln!(
                        "[PHOTO-DEBUG] upload_asset:failed asset_id={} stage=presign error={}",
                        asset.asset_id, error
                    );
                    mark_asset_upload_failed(pool, &asset.asset_id, &asset.merchant_id, &error)
                        .await?;
                    continue;
                }
            };

        if presign_response_means_already_ready(&presign_response) {
            mark_reused_asset_ready(pool, &asset.asset_id, &asset.merchant_id).await?;
            eprintln!(
                "[PHOTO-DEBUG] upload_asset:already_ready asset_id={}",
                asset.asset_id
            );
            processed += 1;
            continue;
        }

        eprintln!(
            "[PHOTO-DEBUG] upload_asset:put_request asset_id={} required_headers={}",
            asset.asset_id,
            presign_response.required_headers.len()
        );
        if let Err(error) = put_bytes_to_signed_url(
            &signed_url_client,
            &presign_response.upload_url,
            &presign_response.required_headers,
            &file_bytes,
        )
        .await
        {
            eprintln!(
                "[PHOTO-DEBUG] upload_asset:failed asset_id={} stage=put error={}",
                asset.asset_id, error
            );
            mark_asset_upload_failed(pool, &asset.asset_id, &asset.merchant_id, &error).await?;
            continue;
        }
        eprintln!(
            "[PHOTO-DEBUG] upload_asset:put_done asset_id={}",
            asset.asset_id
        );

        let complete_request = asset_proto::AssetCompleteUploadRequest {
            asset_id: asset.asset_id.clone(),
            object_key: asset.object_key.clone(),
            content_hash: asset.content_hash.clone(),
            byte_size: asset.byte_size,
        };
        let complete_url = format!("{}/api/assets/complete-upload", api_url);
        eprintln!(
            "[PHOTO-DEBUG] upload_asset:complete_request asset_id={} endpoint={}",
            asset.asset_id, complete_url
        );
        let _: asset_proto::AssetCompleteUploadResponse =
            match post_protobuf(&api_client, &complete_url, &complete_request).await {
                Ok(response) => response,
                Err(error) => {
                    eprintln!(
                        "[PHOTO-DEBUG] upload_asset:failed asset_id={} stage=complete error={}",
                        asset.asset_id, error
                    );
                    mark_asset_upload_failed(pool, &asset.asset_id, &asset.merchant_id, &error)
                        .await?;
                    continue;
                }
            };

        mark_asset_ready(pool, &asset.asset_id, &asset.merchant_id).await?;
        eprintln!(
            "[PHOTO-DEBUG] upload_asset:complete_done asset_id={}",
            asset.asset_id
        );
        processed += 1;
    }

    eprintln!(
        "[PHOTO-DEBUG] upload_pending_product_images:done uploaded={}",
        processed
    );
    Ok(processed)
}

#[command]
pub async fn hydrate_product_images(
    app: AppHandle,
    api_url: String,
    session_token: String,
    merchant_id: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let pool = &state.db_pool;
    let api_client = build_api_client(&session_token)?;
    let signed_url_client = build_signed_url_client()?;
    let limit = limit.unwrap_or(20).max(1);
    eprintln!(
        "[PHOTO-DEBUG] hydrate_product_images:start merchant_id={} limit={} api_url={}",
        merchant_id, limit, api_url
    );
    let ready_assets = load_ready_assets(pool, &merchant_id, limit).await?;
    eprintln!(
        "[PHOTO-DEBUG] hydrate_product_images:ready count={}",
        ready_assets.len()
    );
    let mut hydrated = 0usize;

    for asset in ready_assets {
        eprintln!(
            "[PHOTO-DEBUG] hydrate_asset:start asset_id={} object_key={}",
            asset.asset_id, asset.object_key
        );
        let cached_exists = sqlx::query_scalar::<_, String>(
            "SELECT local_path FROM local_asset_cache WHERE asset_id = ?1 AND status = 'ready'",
        )
        .bind(&asset.asset_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| format!("Failed to inspect local cache: {}", error))?;
        if let Some(local_path) = cached_exists {
            if fs::metadata(&local_path).await.is_ok() {
                eprintln!(
                    "[PHOTO-DEBUG] hydrate_asset:skip_cached asset_id={} local_path={}",
                    asset.asset_id, local_path
                );
                continue;
            }
        }

        sqlx::query(
            "UPDATE local_asset_cache SET status = 'pending_download', download_attempts = download_attempts + 1, last_error = NULL, updated_at = ?2 WHERE asset_id = ?1",
        )
        .bind(&asset.asset_id)
        .bind(current_time_iso_string())
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to mark asset pending download: {}", error))?;

        let request = asset_proto::AssetPresignDownloadRequest {
            asset_id: asset.asset_id.clone(),
        };
        let download_url = format!("{}/api/assets/presign-download", api_url);
        eprintln!(
            "[PHOTO-DEBUG] hydrate_asset:presign_request asset_id={} endpoint={}",
            asset.asset_id, download_url
        );
        let response: asset_proto::AssetPresignDownloadResponse = match post_protobuf(
            &api_client,
            &download_url,
            &request,
        )
        .await
        {
            Ok(response) => response,
            Err(error) => {
                eprintln!(
                    "[PHOTO-DEBUG] hydrate_asset:failed asset_id={} stage=presign error={}",
                    asset.asset_id, error
                );
                sqlx::query(
                        "UPDATE local_asset_cache SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE asset_id = ?1",
                    )
                    .bind(&asset.asset_id)
                    .bind(&error)
                    .bind(current_time_iso_string())
                    .execute(pool)
                    .await
                    .map_err(|db_error| format!("Failed to mark cache failed: {}", db_error))?;
                continue;
            }
        };

        eprintln!(
            "[PHOTO-DEBUG] hydrate_asset:download_request asset_id={}",
            asset.asset_id
        );
        let download = signed_url_client
            .get(&response.download_url)
            .send()
            .await
            .map_err(|error| format!("Failed to download asset {}: {}", asset.asset_id, error))?;
        let download_status = download.status();
        if !download_status.is_success() {
            let text = download.text().await.unwrap_or_default();
            let message = format!(
                "Failed to download asset {} ({}): {}",
                asset.asset_id, download_status, text
            );
            eprintln!(
                "[PHOTO-DEBUG] hydrate_asset:failed asset_id={} stage=download error={}",
                asset.asset_id, message
            );
            sqlx::query(
                "UPDATE local_asset_cache SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE asset_id = ?1",
            )
            .bind(&asset.asset_id)
            .bind(&message)
            .bind(current_time_iso_string())
            .execute(pool)
            .await
            .map_err(|db_error| format!("Failed to mark cache failed: {}", db_error))?;
            continue;
        }

        let bytes = download
            .bytes()
            .await
            .map_err(|error| format!("Failed to read asset bytes {}: {}", asset.asset_id, error))?;
        if sha256_hex(bytes.as_ref()) != asset.content_hash {
            let message = format!("Downloaded asset hash mismatch for {}", asset.asset_id);
            eprintln!(
                "[PHOTO-DEBUG] hydrate_asset:failed asset_id={} stage=hash error={}",
                asset.asset_id, message
            );
            sqlx::query(
                "UPDATE local_asset_cache SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE asset_id = ?1",
            )
            .bind(&asset.asset_id)
            .bind(&message)
            .bind(current_time_iso_string())
            .execute(pool)
            .await
            .map_err(|db_error| format!("Failed to mark cache failed: {}", db_error))?;
            continue;
        }

        let path = write_cached_asset(&app, &asset.object_key, bytes.as_ref()).await?;
        eprintln!(
            "[PHOTO-DEBUG] hydrate_asset:download_done asset_id={} local_path={}",
            asset.asset_id, path
        );
        sqlx::query(
            "INSERT INTO local_asset_cache (asset_id, merchant_id, object_key, local_path, content_hash, status, upload_attempts, download_attempts, last_error, cached_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'ready', 0, 0, NULL, ?6, ?6, ?6) ON CONFLICT(asset_id) DO UPDATE SET merchant_id = excluded.merchant_id, object_key = excluded.object_key, local_path = excluded.local_path, content_hash = excluded.content_hash, status = 'ready', last_error = NULL, cached_at = excluded.cached_at, updated_at = excluded.updated_at"
        )
        .bind(&asset.asset_id)
        .bind(&asset.merchant_id)
        .bind(&asset.object_key)
        .bind(&path)
        .bind(&asset.content_hash)
        .bind(current_time_iso_string())
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to save hydrated asset: {}", error))?;
        hydrated += 1;
    }

    eprintln!(
        "[PHOTO-DEBUG] hydrate_product_images:done hydrated={}",
        hydrated
    );
    Ok(hydrated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, ImageFormat};
    use zenwebp::DecodeRequest;

    fn create_png_bytes(width: u32, height: u32) -> Vec<u8> {
        let mut image = ImageBuffer::new(width, height);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            *pixel = image::Rgba([(x % 256) as u8, (y % 256) as u8, 200, 255]);
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
                image::Rgb([255, 0, 0])
            } else {
                image::Rgb([0, 255, 0])
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

        let result = product_photo_preview_from_bytes(&png_bytes, "coffee.png")
            .expect("preview generation should succeed");

        assert_eq!(result.preview_mime_type, PRODUCT_PHOTO_PREVIEW_MIME_TYPE);
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
