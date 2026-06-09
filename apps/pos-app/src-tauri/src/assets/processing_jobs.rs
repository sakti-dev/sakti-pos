use base64::engine::general_purpose;
use base64::Engine;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_image_pipeline::dto::{
    AttachmentLookup, CompletedJob, EnqueueJobRequest, EnqueueJobResponse,
};
use tauri_plugin_image_pipeline::ImagePipelineExt;

use super::dto::{AssetAttachmentTarget, EnqueueAssetProcessingRequest, EnqueueAssetProcessingResponse};

pub(super) fn validate_asset_processing_kind(processing_kind: &str) -> Result<(), String> {
    match processing_kind {
        "image:webp-thumbnail" => Ok(()),
        _ => Err(format!(
            "Unsupported asset processing kind {}",
            processing_kind
        )),
    }
}

pub async fn get_pending_preview_path(
    app: AppHandle,
    product_id: String,
) -> Result<Option<super::dto::PendingPreviewPathResponse>, String> {
    let target = AttachmentLookup {
        entity_type: "product".into(),
        entity_id: product_id,
        attachment_field: "image_asset_id".into(),
    };
    app.image_pipeline()
        .get_pending_preview(target)
        .await
        .map_err(|error| error.to_string())
        .map(|result| {
            result.map(|preview| super::dto::PendingPreviewPathResponse {
                preview_path: preview.preview_path.to_string_lossy().to_string(),
                preview_mime_type: preview.preview_mime_type,
            })
        })
}

pub async fn process_pending_asset_jobs(
    app: AppHandle,
    state: State<'_, crate::app::state::AppState>,
    limit: Option<i64>,
) -> Result<i64, String> {
    let limit = limit.unwrap_or(20);
    if limit <= 0 {
        return Err("Asset processing limit must be greater than zero".to_string());
    }

    let pipeline = app.image_pipeline();
    let processed = pipeline
        .process_pending_jobs(limit as u32)
        .await
        .map_err(|error| error.to_string())?;

    let completed_jobs = pipeline
        .get_completed_jobs()
        .await
        .map_err(|error| error.to_string())?;

    let mut reconciled = 0i64;
    for job in completed_jobs {
        match persist_completed_asset_job(&app, &state.db_pool, &job).await {
            Ok(()) => {
                if let Err(error) = pipeline.consume_completed_job(&job.id).await {
                    log::info!(
                        "[RUST] [PHOTO:TRACE] asset_processing_job:consume_failed job_id={} error={}",
                        job.id,
                        error
                    );
                } else {
                    reconciled += 1;
                }
            }
            Err(error) => {
                log::info!(
                    "[RUST] [PHOTO:TRACE] asset_processing_job:reconcile_failed job_id={} error={}",
                    job.id,
                    error
                );
            }
        }
    }

    Ok(std::cmp::max(processed.completed as i64, reconciled))
}

pub async fn enqueue_asset_processing(
    app: AppHandle,
    state: State<'_, crate::app::state::AppState>,
    request: EnqueueAssetProcessingRequest,
) -> Result<EnqueueAssetProcessingResponse, String> {
    enqueue_asset_processing_inner(app, state, request).await
}

pub(crate) async fn enqueue_asset_processing_inner(
    app: AppHandle,
    state: State<'_, crate::app::state::AppState>,
    request: EnqueueAssetProcessingRequest,
) -> Result<EnqueueAssetProcessingResponse, String> {
    let target = AssetAttachmentTarget {
        entity_type: request.target.entity_type,
        entity_id: request.target.entity_id,
        field: request.target.field,
    };

    super::targets::validate_asset_attachment_target(&target)?;

    let merchant_id = super::targets::resolve_asset_target_merchant_id(&state.db_pool, &target)
        .await
        .map_err(|error| format!("Failed to resolve asset target merchant: {}", error))?;

    let pipeline_request = EnqueueJobRequest {
        merchant_id,
        source_path: PathBuf::from(request.source_path),
        original_filename: request.original_filename,
        source_mime_type: request.source_mime_type,
        processing_kind: request.processing_kind,
        entity_type: target.entity_type,
        entity_id: target.entity_id,
        attachment_field: target.field,
        max_long_edge: 400,
        preview_max_long_edge: 320,
        max_attempts: Some(3),
    };

    let EnqueueJobResponse { job_id, .. } = app
        .image_pipeline()
        .enqueue_job(pipeline_request)
        .await
        .map_err(|error| error.to_string())?;

    Ok(EnqueueAssetProcessingResponse { job_id })
}

async fn persist_completed_asset_job(
    app: &AppHandle,
    pool: &sqlx::SqlitePool,
    job: &CompletedJob,
) -> Result<(), String> {
    let bytes = tokio::fs::read(&job.result.cache_path)
        .await
        .map_err(|error| format!("Failed to read completed asset cache file: {}", error))?;
    let encoded = general_purpose::STANDARD.encode(&bytes);

    let attachment_target = AssetAttachmentTarget {
        entity_type: job.entity_type.clone(),
        entity_id: job.entity_id.clone(),
        field: job.attachment_field.clone(),
    };
    let asset_kind = super::targets::asset_kind_for_processing_job(&super::PendingAssetProcessingJobRecord {
        id: job.id.clone(),
        merchant_id: job.merchant_id.clone(),
        source_path: job.result.cache_path.to_string_lossy().to_string(),
        original_filename: job.result.original_filename.clone(),
        source_mime_type: Some(job.result.content_type.clone()),
        processing_kind: job.processing_kind.clone(),
        entity_type: job.entity_type.clone(),
        entity_id: job.entity_id.clone(),
        attachment_field: job.attachment_field.clone(),
        preview_path: job.result.preview_path.as_ref().map(|path| path.to_string_lossy().to_string()),
        preview_mime_type: Some("image/jpeg".into()),
        status: "completed".into(),
        attempts: job.attempts as i64,
    })?;

    let prepared = super::local::prepare_local_image_asset_inner(
        app,
        pool,
        super::PreparedImageInput {
            byte_size: job.result.byte_size as i64,
            content_hash: job.result.content_hash.clone(),
            content_type: job.result.content_type.clone(),
            data_base64: encoded,
            height: job.result.height as i32,
            kind: asset_kind.to_string(),
            merchant_id: job.merchant_id.clone(),
            original_filename: job.result.original_filename.clone(),
            width: job.result.width as i32,
        },
    )
    .await?;

    super::targets::link_asset_to_attachment_target(
        pool,
        &attachment_target,
        &job.merchant_id,
        &prepared.asset.id,
    )
    .await?;

    Ok(())
}
