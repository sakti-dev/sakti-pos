use std::time::Duration;
use tauri::State;
use tokio::fs;
use tokio::time::sleep;

use crate::app::state::AppState;

async fn mark_asset_upload_failed_best_effort(
    pool: &sqlx::SqlitePool,
    asset_id: &str,
    merchant_id: &str,
    error_message: &str,
) {
    let mut last_error = None;
    for attempt in 0..3 {
        match super::mark_asset_upload_failed(pool, asset_id, merchant_id, error_message).await {
            Ok(()) => return,
            Err(error) => {
                last_error = Some(error);
                if attempt < 2 {
                    sleep(Duration::from_millis(50 * (attempt + 1) as u64)).await;
                }
            }
        }
    }

    if let Some(error) = last_error {
        log::info!(
            "[RUST] [PHOTO:TRACE] upload_asset:finalize_failed asset_id={} error={}",
            asset_id,
            error
        );
    }
}

async fn mark_asset_ready_best_effort(
    pool: &sqlx::SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    let mut last_error = None;
    for attempt in 0..3 {
        match super::mark_asset_ready(pool, asset_id, merchant_id).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                if attempt < 2 {
                    sleep(Duration::from_millis(50 * (attempt + 1) as u64)).await;
                }
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Failed to mark asset ready".to_string()))
}

async fn mark_reused_asset_ready_best_effort(
    pool: &sqlx::SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    let mut last_error = None;
    for attempt in 0..3 {
        match super::mark_reused_asset_ready(pool, asset_id, merchant_id).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                if attempt < 2 {
                    sleep(Duration::from_millis(50 * (attempt + 1) as u64)).await;
                }
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Failed to mark reused asset ready".to_string()))
}

pub async fn upload_pending_assets(
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
        "[RUST] [PHOTO:TRACE] upload_pending_assets:start merchant_id={} limit={} api_url={}",
        merchant_id,
        limit,
        api_url
    );
    let pending_assets = super::load_pending_upload_assets(pool, &merchant_id, limit).await?;
    log::info!(
        "[RUST] [PHOTO:TRACE] upload_pending_assets:pending count={}",
        pending_assets.len()
    );
    let mut processed = 0usize;

    for asset in pending_assets {
        log::info!(
            "[RUST] [PHOTO:TRACE] upload_asset:start asset_id={} object_key={} local_path={} byte_size={}",
            asset.asset_id, asset.object_key, asset.local_path, asset.byte_size
        );
        super::mark_asset_uploading(pool, &asset.asset_id).await?;

        let file_bytes = match fs::read(&asset.local_path).await {
            Ok(bytes) => bytes,
            Err(error) => {
                let message = format!("Failed to read cached asset {}: {}", asset.asset_id, error);
                log::info!(
                    "[RUST] [PHOTO:TRACE] upload_asset:failed asset_id={} error={}",
                    asset.asset_id,
                    message
                );
                mark_asset_upload_failed_best_effort(
                    pool,
                    &asset.asset_id,
                    &asset.merchant_id,
                    &message,
                )
                .await;
                continue;
            }
        };

        if super::sha256_hex(&file_bytes) != asset.content_hash {
            let message = format!("Content hash mismatch for asset {}", asset.asset_id);
            log::info!(
                "[RUST] [PHOTO:TRACE] upload_asset:failed asset_id={} error={}",
                asset.asset_id,
                message
            );
            mark_asset_upload_failed_best_effort(
                pool,
                &asset.asset_id,
                &asset.merchant_id,
                &message,
            )
            .await;
            continue;
        }

        let request = super::asset_proto::AssetPresignUploadRequest {
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
        log::info!(
            "[RUST] [PHOTO:TRACE] upload_asset:presign_request asset_id={} endpoint={}",
            asset.asset_id,
            presign_url
        );
        let presign_response: super::asset_proto::AssetPresignUploadResponse =
            match super::post_protobuf(&api_client, &presign_url, &request).await {
                Ok(response) => response,
                Err(error) => {
                    log::info!(
                        "[RUST] [PHOTO:TRACE] upload_asset:failed asset_id={} stage=presign error={}",
                        asset.asset_id,
                        error
                    );
                    mark_asset_upload_failed_best_effort(
                        pool,
                        &asset.asset_id,
                        &asset.merchant_id,
                        &error,
                    )
                    .await;
                    continue;
                }
            };

        if super::presign_response_means_already_ready(&presign_response) {
            if let Err(error) =
                mark_reused_asset_ready_best_effort(pool, &asset.asset_id, &asset.merchant_id).await
            {
                log::info!(
                    "[RUST] [PHOTO:TRACE] upload_asset:finalize_failed asset_id={} stage=already_ready error={}",
                    asset.asset_id,
                    error
                );
                continue;
            }
            log::info!(
                "[RUST] [PHOTO:TRACE] upload_asset:already_ready asset_id={}",
                asset.asset_id
            );
            processed += 1;
            continue;
        }

        log::info!(
            "[RUST] [PHOTO:TRACE] upload_asset:put_request asset_id={} required_headers={}",
            asset.asset_id,
            presign_response.required_headers.len()
        );
        if let Err(error) = super::put_bytes_to_signed_url(
            &signed_url_client,
            &presign_response.upload_url,
            &presign_response.required_headers,
            &file_bytes,
        )
        .await
        {
            log::info!(
                "[RUST] [PHOTO:TRACE] upload_asset:failed asset_id={} stage=put error={}",
                asset.asset_id,
                error
            );
            mark_asset_upload_failed_best_effort(pool, &asset.asset_id, &asset.merchant_id, &error)
                .await;
            continue;
        }
        log::info!(
            "[RUST] [PHOTO:TRACE] upload_asset:put_done asset_id={}",
            asset.asset_id
        );

        let complete_request = super::asset_proto::AssetCompleteUploadRequest {
            asset_id: asset.asset_id.clone(),
            object_key: asset.object_key.clone(),
            content_hash: asset.content_hash.clone(),
            byte_size: asset.byte_size,
        };
        let complete_url = format!("{}/api/assets/complete-upload", api_url);
        log::info!(
            "[RUST] [PHOTO:TRACE] upload_asset:complete_request asset_id={} endpoint={}",
            asset.asset_id,
            complete_url
        );
        let _: super::asset_proto::AssetCompleteUploadResponse =
            match super::post_protobuf(&api_client, &complete_url, &complete_request).await {
                Ok(response) => response,
                Err(error) => {
                    log::info!(
                    "[RUST] [PHOTO:TRACE] upload_asset:failed asset_id={} stage=complete error={}",
                    asset.asset_id,
                    error
                );
                    mark_asset_upload_failed_best_effort(
                        pool,
                        &asset.asset_id,
                        &asset.merchant_id,
                        &error,
                    )
                    .await;
                    continue;
                }
            };

        if let Err(error) =
            mark_asset_ready_best_effort(pool, &asset.asset_id, &asset.merchant_id).await
        {
            log::info!(
                "[RUST] [PHOTO:TRACE] upload_asset:finalize_failed asset_id={} stage=mark_ready error={}",
                asset.asset_id,
                error
            );
            continue;
        }
        log::info!(
            "[RUST] [PHOTO:TRACE] upload_asset:complete_done asset_id={}",
            asset.asset_id
        );
        processed += 1;
    }

    log::info!(
        "[RUST] [PHOTO:TRACE] upload_pending_assets:done uploaded={}",
        processed
    );
    Ok(processed)
}
