use tauri::{AppHandle, State};
use tokio::fs;

use crate::app::state::AppState;

async fn mark_local_asset_cache_failed(
    pool: &sqlx::SqlitePool,
    asset_id: &str,
    error_message: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE local_asset_cache SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(error_message)
    .bind(crate::time_utils::current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|db_error| format!("Failed to mark cache failed: {}", db_error))?;
    Ok(())
}

pub async fn hydrate_missing_assets(
    app: AppHandle,
    api_url: String,
    session_token: String,
    merchant_id: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let pool = &state.db_pool;
    let api_client = super::build_api_client(&session_token)?;
    let signed_url_client = super::build_signed_url_client()?;
    let limit = limit.unwrap_or(20).max(1);
    log::info!(
        "[RUST] [PHOTO:TRACE] hydrate_missing_assets:start merchant_id={} limit={} api_url={}",
        merchant_id,
        limit,
        api_url
    );
    let ready_assets = super::load_ready_assets(pool, &merchant_id, limit).await?;
    log::info!(
        "[RUST] [PHOTO:TRACE] hydrate_missing_assets:ready count={}",
        ready_assets.len()
    );
    let mut hydrated = 0usize;

    for asset in ready_assets {
        log::info!(
            "[RUST] [PHOTO:TRACE] hydrate_asset:start asset_id={} object_key={}",
            asset.asset_id,
            asset.object_key
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
                log::info!(
                    "[RUST] [PHOTO:TRACE] hydrate_asset:skip_cached asset_id={} local_path={}",
                    asset.asset_id,
                    local_path
                );
                continue;
            }
        }

        sqlx::query(
            "UPDATE local_asset_cache SET status = 'pending_download', download_attempts = download_attempts + 1, last_error = NULL, updated_at = ?2 WHERE asset_id = ?1",
        )
        .bind(&asset.asset_id)
        .bind(crate::time_utils::current_time_iso_string())
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to mark asset pending download: {}", error))?;

        let request = super::asset_proto::AssetPresignDownloadRequest {
            asset_id: asset.asset_id.clone(),
        };
        let download_url = format!("{}/api/assets/presign-download", api_url);
        log::info!(
            "[RUST] [PHOTO:TRACE] hydrate_asset:presign_request asset_id={} endpoint={}",
            asset.asset_id,
            download_url
        );
        let response: super::asset_proto::AssetPresignDownloadResponse = match super::post_protobuf(
            &api_client,
            &download_url,
            &request,
        )
        .await
        {
            Ok(response) => response,
            Err(error) => {
                log::info!(
                    "[RUST] [PHOTO:TRACE] hydrate_asset:failed asset_id={} stage=presign error={}",
                    asset.asset_id,
                    error
                );
                sqlx::query(
                    "UPDATE local_asset_cache SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE asset_id = ?1",
                )
                .bind(&asset.asset_id)
                .bind(&error)
                .bind(crate::time_utils::current_time_iso_string())
                .execute(pool)
                .await
                .map_err(|db_error| format!("Failed to mark cache failed: {}", db_error))?;
                continue;
            }
        };

        log::info!(
            "[RUST] [PHOTO:TRACE] hydrate_asset:download_request asset_id={}",
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
            log::info!(
                "[RUST] [PHOTO:TRACE] hydrate_asset:failed asset_id={} stage=download error={}",
                asset.asset_id,
                message
            );
            sqlx::query(
                "UPDATE local_asset_cache SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE asset_id = ?1",
            )
            .bind(&asset.asset_id)
            .bind(&message)
            .bind(crate::time_utils::current_time_iso_string())
            .execute(pool)
            .await
            .map_err(|db_error| format!("Failed to mark cache failed: {}", db_error))?;
            continue;
        }

        let bytes = download
            .bytes()
            .await
            .map_err(|error| format!("Failed to read asset bytes {}: {}", asset.asset_id, error))?;
        if super::sha256_hex(bytes.as_ref()) != asset.content_hash {
            let message = format!("Downloaded asset hash mismatch for {}", asset.asset_id);
            log::info!(
                "[RUST] [PHOTO:TRACE] hydrate_asset:failed asset_id={} stage=hash error={}",
                asset.asset_id,
                message
            );
            mark_local_asset_cache_failed(pool, &asset.asset_id, &message).await?;
            continue;
        }

        let path = match super::write_cached_asset(&app, &asset.object_key, bytes.as_ref()).await {
            Ok(path) => path,
            Err(error) => {
                mark_local_asset_cache_failed(pool, &asset.asset_id, &error).await?;
                continue;
            }
        };

        let result = sqlx::query(
            "INSERT INTO local_asset_cache (asset_id, merchant_id, object_key, local_path, content_hash, status, upload_attempts, download_attempts, last_error, cached_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'ready', 0, 0, NULL, ?6, ?6, ?6) ON CONFLICT(asset_id) DO UPDATE SET merchant_id = excluded.merchant_id, object_key = excluded.object_key, local_path = excluded.local_path, content_hash = excluded.content_hash, status = 'ready', last_error = NULL, cached_at = excluded.cached_at, updated_at = excluded.updated_at"
        )
        .bind(&asset.asset_id)
        .bind(&asset.merchant_id)
        .bind(&asset.object_key)
        .bind(&path)
        .bind(&asset.content_hash)
        .bind(crate::time_utils::current_time_iso_string())
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to save hydrated asset: {}", error));

        if let Err(error) = result {
            let _ = fs::remove_file(&path).await;
            mark_local_asset_cache_failed(pool, &asset.asset_id, &error).await?;
            continue;
        }

        log::info!(
            "[RUST] [PHOTO:TRACE] hydrate_asset:download_done asset_id={} local_path={}",
            asset.asset_id,
            path
        );
        hydrated += 1;
    }

    log::info!(
        "[RUST] [PHOTO:TRACE] hydrate_missing_assets:done hydrated={}",
        hydrated
    );
    Ok(hydrated)
}
