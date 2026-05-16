use base64::engine::general_purpose;
use base64::Engine;
use sqlx::{Row, SqlitePool};
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tokio::fs;

use super::dto::PendingProductPhotoPreviewResponse;
use super::image::asset_image_preview_from_bytes;
use crate::time_utils::{current_job_id_string, current_time_iso_string};

pub(super) fn validate_asset_processing_kind(processing_kind: &str) -> Result<(), String> {
    match processing_kind {
        "image:webp-thumbnail" => Ok(()),
        _ => Err(format!(
            "Unsupported asset processing kind {}",
            processing_kind
        )),
    }
}

pub(super) async fn write_pending_asset_processing_preview(
    source_path: &str,
    original_filename: &str,
    job_id: &str,
) -> Result<(String, String), String> {
    let source_path_buf = PathBuf::from(source_path);
    let preview_path = super::image::pending_asset_preview_file_path(&source_path_buf, job_id)?;
    let source_bytes = fs::read(&source_path_buf)
        .await
        .map_err(|error| format!("Failed to read product photo source for preview: {}", error))?;
    let original_filename = original_filename.to_string();
    let preview = tauri::async_runtime::spawn_blocking(move || {
        asset_image_preview_from_bytes(&source_bytes, &original_filename)
    })
    .await
    .map_err(|error| format!("Failed to join pending asset preview worker: {}", error))??;
    let preview_bytes = general_purpose::STANDARD
        .decode(&preview.preview_base64)
        .map_err(|error| format!("Failed to decode pending asset preview bytes: {}", error))?;

    fs::write(&preview_path, preview_bytes)
        .await
        .map_err(|error| format!("Failed to write pending asset preview: {}", error))?;

    Ok((
        preview_path.to_string_lossy().to_string(),
        preview.preview_mime_type,
    ))
}

pub(super) async fn get_pending_asset_preview_inner(
    pool: &SqlitePool,
    product_id: &str,
) -> Result<Option<PendingProductPhotoPreviewResponse>, String> {
    let legacy_row = sqlx::query(
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

    if let Some(row) = legacy_row {
        return Ok(Some(PendingProductPhotoPreviewResponse {
            preview_base64: row
                .try_get("preview_base64")
                .map_err(|error| format!("Failed to read preview_base64: {}", error))?,
            preview_mime_type: row
                .try_get("preview_mime_type")
                .map_err(|error| format!("Failed to read preview_mime_type: {}", error))?,
        }));
    }

    let generic_row = sqlx::query(
        r#"
        SELECT preview_path, preview_mime_type
        FROM pending_asset_processing_jobs
        WHERE entity_type = 'product'
          AND entity_id = ?1
          AND attachment_field = 'image_asset_id'
          AND status IN ('pending', 'processing')
          AND preview_path IS NOT NULL
          AND preview_mime_type IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(product_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        format!(
            "Failed to inspect pending asset processing preview: {}",
            error
        )
    })?;

    let Some(row) = generic_row else {
        return Ok(None);
    };

    let preview_path: String = row
        .try_get("preview_path")
        .map_err(|error| format!("Failed to read pending asset preview_path: {}", error))?;
    let preview_mime_type: String = row
        .try_get("preview_mime_type")
        .map_err(|error| format!("Failed to read pending asset preview_mime_type: {}", error))?;

    match fs::read(&preview_path).await {
        Ok(preview_bytes) => Ok(Some(PendingProductPhotoPreviewResponse {
            preview_base64: general_purpose::STANDARD.encode(preview_bytes),
            preview_mime_type,
        })),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            log::info!(
                "[RUST] [PHOTO:TRACE] pending_asset_preview:missing product_id={} path={}",
                product_id,
                preview_path
            );
            Ok(None)
        }
        Err(error) => Err(format!("Failed to read pending asset preview: {}", error)),
    }
}

pub async fn get_pending_asset_preview(
    product_id: String,
    state: State<'_, crate::app::state::AppState>,
) -> Result<Option<super::PendingProductPhotoPreviewResponse>, String> {
    get_pending_asset_preview_inner(&state.db_pool, &product_id).await
}

pub async fn process_pending_asset_jobs(
    limit: Option<i64>,
    state: State<'_, crate::app::state::AppState>,
    app: AppHandle,
) -> Result<i64, String> {
    process_pending_asset_jobs_inner(&app, &state.db_pool, limit.unwrap_or(20)).await
}

pub async fn enqueue_asset_processing(
    state: State<'_, crate::app::state::AppState>,
    request: super::EnqueueAssetProcessingRequest,
) -> Result<super::EnqueueAssetProcessingResponse, String> {
    enqueue_asset_processing_inner(state, request).await
}

pub(crate) async fn process_pending_asset_jobs_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    limit: i64,
) -> Result<i64, String> {
    let limit = limit.max(1);
    log::info!(
        "[{}] asset_processing_jobs:start limit={}",
        super::PHOTO_PIPELINE_LOG_PREFIX,
        limit
    );
    let pending_jobs = super::load_pending_asset_processing_jobs(pool, limit).await?;
    log::info!(
        "[{}] asset_processing_jobs:pending count={}",
        super::PHOTO_PIPELINE_LOG_PREFIX,
        pending_jobs.len()
    );

    let mut processed = 0i64;
    for job in pending_jobs {
        log::info!(
            "[{}] asset_processing_job:loaded job_id={} entity_type={} entity_id={} field={} attempts={} status={} mime_type={} source_path={}",
            super::PHOTO_PIPELINE_LOG_PREFIX,
            job.id,
            job.entity_type,
            job.entity_id,
            job.attachment_field,
            job.attempts,
            job.status,
            job.source_mime_type.as_deref().unwrap_or(""),
            job.source_path
        );

        let Some(claimed_job) = super::claim_pending_asset_processing_job(pool, &job.id).await?
        else {
            log::info!(
                "[{}] asset_processing_job:skip job_id={} reason=already_claimed",
                super::PHOTO_PIPELINE_LOG_PREFIX,
                job.id
            );
            continue;
        };

        let target = super::AssetAttachmentTarget {
            entity_type: claimed_job.entity_type.clone(),
            entity_id: claimed_job.entity_id.clone(),
            field: claimed_job.attachment_field.clone(),
        };

        let asset_kind = match super::targets::asset_kind_for_processing_job(&claimed_job) {
            Ok(kind) => kind,
            Err(error) => {
                log::info!(
                    "[{}] asset_processing_job:failed job_id={} stage=validate error={}",
                    super::PHOTO_PIPELINE_LOG_PREFIX,
                    claimed_job.id,
                    error
                );
                super::mark_pending_asset_processing_job_failed(pool, &claimed_job.id, &error)
                    .await?;
                continue;
            }
        };

        let result = super::local::prepare_local_image_asset_from_path_inner(
            app,
            pool,
            claimed_job.merchant_id.clone(),
            claimed_job.original_filename.clone(),
            asset_kind.to_string(),
            claimed_job.source_path.clone(),
            false,
        )
        .await;

        let prepared = match result {
            Ok(response) => response,
            Err(error) => {
                log::info!(
                    "[{}] asset_processing_job:failed job_id={} stage=process error={}",
                    super::PHOTO_PIPELINE_LOG_PREFIX,
                    claimed_job.id,
                    error
                );
                super::mark_pending_asset_processing_job_failed(pool, &claimed_job.id, &error)
                    .await?;
                continue;
            }
        };

        let asset_id = prepared.asset.id.clone();
        log::info!(
            "[{}] asset_processing_job:processed job_id={} asset_id={} local_path={}",
            super::PHOTO_PIPELINE_LOG_PREFIX,
            claimed_job.id,
            asset_id,
            prepared.local_path
        );
        if let Err(error) = super::targets::link_asset_to_attachment_target(
            pool,
            &target,
            &claimed_job.merchant_id,
            &asset_id,
        )
        .await
        {
            log::info!(
                "[{}] asset_processing_job:failed job_id={} stage=link asset_id={} error={}",
                super::PHOTO_PIPELINE_LOG_PREFIX,
                claimed_job.id,
                asset_id,
                error
            );
            super::mark_pending_asset_processing_job_failed(pool, &claimed_job.id, &error).await?;
            continue;
        }

        if super::is_deletable_photo_input_path(std::path::Path::new(&claimed_job.source_path)) {
            if let Err(error) = fs::remove_file(&claimed_job.source_path).await {
                log::info!(
                    "[RUST] [PHOTO:TRACE] asset_processing_job:cleanup_failed job_id={} path={} error={}",
                    claimed_job.id, claimed_job.source_path, error
                );
            }
        }

        if let Some(preview_path) = &claimed_job.preview_path {
            if super::is_deletable_photo_input_path(std::path::Path::new(preview_path)) {
                if let Err(error) = fs::remove_file(preview_path).await {
                    log::info!(
                        "[RUST] [PHOTO:TRACE] asset_processing_job:preview_cleanup_failed job_id={} path={} mime_type={} error={}",
                        claimed_job.id,
                        preview_path,
                        claimed_job.preview_mime_type.as_deref().unwrap_or(""),
                        error
                    );
                }
            }
        }

        if let Err(error) = super::delete_pending_asset_processing_job(pool, &claimed_job.id).await
        {
            log::info!(
                "[RUST] [PHOTO:TRACE] asset_processing_job:cleanup_row_failed job_id={} error={}",
                claimed_job.id,
                error
            );
        }

        super::emit_asset_cache_ready(app, &asset_id);
        super::emit_asset_attachment_ready(
            app,
            super::AssetAttachmentReadyPayload {
                asset_id: asset_id.clone(),
                entity_id: target.entity_id,
                entity_type: target.entity_type,
                field: target.field,
            },
        );

        log::info!(
            "[{}] asset_processing_job:done job_id={} entity_id={} asset_id={}",
            super::PHOTO_PIPELINE_LOG_PREFIX,
            claimed_job.id,
            claimed_job.entity_id,
            asset_id
        );
        processed += 1;
    }

    log::info!(
        "[{}] asset_processing_jobs:done processed={}",
        super::PHOTO_PIPELINE_LOG_PREFIX,
        processed
    );
    Ok(processed)
}

pub(crate) async fn enqueue_asset_processing_inner(
    state: State<'_, crate::app::state::AppState>,
    request: super::EnqueueAssetProcessingRequest,
) -> Result<super::EnqueueAssetProcessingResponse, String> {
    log::info!(
        "[{}] enqueue_asset_processing:start entity_type={} entity_id={} field={} processing_kind={} source_path={} mime_type={}",
        super::PHOTO_PIPELINE_LOG_PREFIX,
        request.target.entity_type,
        request.target.entity_id,
        request.target.field,
        request.processing_kind,
        request.source_path,
        request.source_mime_type.as_deref().unwrap_or("")
    );
    super::validate_asset_attachment_target(&request.target)?;
    validate_asset_processing_kind(&request.processing_kind)?;

    let path_buf = PathBuf::from(&request.source_path);
    if !super::is_deletable_photo_input_path(&path_buf) {
        log::info!(
            "[{}] enqueue_asset_processing:rejected source_path={} reason=non_photo_input_path",
            super::PHOTO_PIPELINE_LOG_PREFIX,
            request.source_path
        );
        return Err("Refusing to enqueue non product photo temp path".to_string());
    }

    let merchant_id =
        super::resolve_asset_target_merchant_id(&state.db_pool, &request.target).await?;
    log::info!(
        "[{}] enqueue_asset_processing:merchant_resolved entity_id={} merchant_id={}",
        super::PHOTO_PIPELINE_LOG_PREFIX,
        request.target.entity_id,
        merchant_id
    );
    let now = current_time_iso_string();
    let job_id = current_job_id_string();
    let (preview_path, preview_mime_type) = match write_pending_asset_processing_preview(
        &request.source_path,
        &request.original_filename,
        &job_id,
    )
    .await
    {
        Ok((path, mime_type)) => {
            log::info!(
                    "[RUST] [PHOTO:TRACE] enqueue_asset_processing:preview_ready job_id={} path={} mime_type={}",
                    job_id,
                    path,
                    mime_type
                );
            (Some(path), Some(mime_type))
        }
        Err(error) => {
            log::info!(
                    "[RUST] [PHOTO:TRACE] enqueue_asset_processing:preview_failed job_id={} source_path={} error={}",
                    job_id,
                    request.source_path,
                    error
                );
            (None, None)
        }
    };
    let returned_job_id = sqlx::query_scalar::<_, String>(
        r#"
        INSERT INTO pending_asset_processing_jobs (
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
          attempts,
          last_error,
          created_at,
          updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending', 0, NULL, ?12, ?12
        )
        RETURNING id
        "#,
    )
    .bind(&job_id)
    .bind(&merchant_id)
    .bind(&request.source_path)
    .bind(&request.original_filename)
    .bind(request.source_mime_type.as_deref())
    .bind(&request.processing_kind)
    .bind(&request.target.entity_type)
    .bind(&request.target.entity_id)
    .bind(&request.target.field)
    .bind(preview_path.as_deref())
    .bind(preview_mime_type.as_deref())
    .bind(&now)
    .fetch_one(&state.db_pool)
    .await
    .map_err(|error| format!("Failed to enqueue pending asset processing job: {}", error))?;

    log::info!(
        "[{}] enqueue_asset_processing:enqueued job_id={} merchant_id={} entity_type={} entity_id={} field={} source_path={}",
        super::PHOTO_PIPELINE_LOG_PREFIX,
        returned_job_id,
        merchant_id,
        request.target.entity_type,
        request.target.entity_id,
        request.target.field,
        request.source_path
    );

    Ok(super::EnqueueAssetProcessingResponse {
        job_id: returned_job_id,
    })
}
