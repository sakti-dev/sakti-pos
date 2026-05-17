use base64::engine::general_purpose;
use base64::Engine;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tokio::fs;

use super::{CachedAssetPathResponse, CachedAssetResponse};

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
pub(super) fn asset_relative_path(merchant_id: &str, content_hash: &str) -> PathBuf {
    PathBuf::from(format!("{merchant_id}/assets/{content_hash}"))
}

pub(super) fn asset_object_key(merchant_id: &str, content_hash: &str) -> String {
    format!("{merchant_id}/assets/{content_hash}")
}

pub(super) fn is_deletable_photo_input_path(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "product_photo_inputs")
}

pub(super) fn normalize_original_filename(original_filename: &str, path: &Path) -> String {
    let trimmed = original_filename.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }

    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("product-photo")
        .to_string()
}

pub(super) fn asset_cache_file_path_from_root(
    root: &Path,
    object_key: &str,
) -> Result<PathBuf, String> {
    validate_object_key(object_key)?;
    Ok(root.join(format!("{object_key}.webp")))
}

pub(super) fn asset_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("asset-cache"))
        .map_err(|_| "Could not resolve app config directory".to_string())
}

pub(super) async fn write_cached_asset(
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

pub(super) fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

pub async fn cache_asset_webp(
    app: AppHandle,
    object_key: String,
    data_base64: String,
) -> Result<CachedAssetResponse, String> {
    log::info!(
        "[RUST] [PHOTO:TRACE] cache_asset_webp:start object_key={}",
        object_key
    );
    let bytes = general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| format!("Failed to decode asset payload: {}", error))?;
    let local_path = write_cached_asset(&app, &object_key, &bytes).await?;
    log::info!(
        "[RUST] [PHOTO:TRACE] cache_asset_webp:done object_key={} local_path={}",
        object_key,
        local_path
    );
    Ok(CachedAssetResponse {
        local_path,
        object_key,
    })
}

pub async fn get_cached_asset_path(
    asset_id: String,
    pool: &sqlx::SqlitePool,
) -> Result<Option<CachedAssetPathResponse>, String> {
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
    .fetch_optional(pool)
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

    match fs::try_exists(&local_path).await {
        Ok(true) => Ok(Some(CachedAssetPathResponse {
            local_path,
            content_type,
        })),
        Ok(false) => {
            log::info!(
                "[RUST] [PHOTO:TRACE] get_cached_asset_path:missing asset_id={} local_path={}",
                asset_id,
                local_path
            );
            Ok(None)
        }
        Err(error) => Err(format!("Failed to check cached asset file: {}", error)),
    }
}
