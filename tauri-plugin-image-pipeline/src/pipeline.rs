//! Pipeline: orchestrates queue → process → cache for each job.
//!
//! The pipeline is the only module that knows about all three subsystems.
//! It claims jobs from the queue, processes them, writes to cache,
//! and transitions the job state accordingly.

use std::path::Path;

use crate::cache;
use crate::dto::*;
use crate::error::PluginError;
use crate::queue_state::JobQueue;

/// Process up to `limit` pending jobs. Returns a summary of what happened.
pub async fn process_pending_jobs(
    queue: &JobQueue,
    cache_root: &Path,
    limit: u32,
) -> Result<ProcessJobsResponse, PluginError> {
    if limit == 0 {
        return Err(PluginError::InvalidRequest {
            field: "limit",
            reason: "must be greater than zero".into(),
        });
    }

    let mut attempted = 0u32;
    let mut completed = 0u32;
    let mut retry_scheduled = 0u32;
    let mut terminal_failed = 0u32;

    for _ in 0..limit {
        let Some(job) = queue.claim_next().await? else {
            break;
        };

        attempted += 1;

        match process_single_job(queue, cache_root, &job).await {
            Ok(result) => {
                match queue.complete(&job.id, result).await {
                    Ok(_) => completed += 1,
                    Err(_) => terminal_failed += 1,
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                if job.attempts < job.max_attempts {
                    match queue.fail_retryable(&job.id, error_msg).await {
                        Ok(_) => retry_scheduled += 1,
                        Err(_) => terminal_failed += 1,
                    }
                } else {
                    match queue.fail_terminal(&job.id, error_msg).await {
                        Ok(_) => terminal_failed += 1,
                        Err(_) => terminal_failed += 1,
                    }
                }
            }
        }
    }

    Ok(ProcessJobsResponse {
        attempted,
        completed,
        retry_scheduled,
        terminal_failed,
    })
}

/// Process a single job: generate preview, process main image, write to cache.
async fn process_single_job(
    _queue: &JobQueue,
    cache_root: &Path,
    job: &JobRecord,
) -> Result<JobResult, PluginError> {
    // Generate preview if preview_max_long_edge > 0
    let preview_path = if job.preview_max_long_edge > 0 {
        let preview_data =
            crate::processor::generate_preview(&job.source_path, job.preview_max_long_edge)?;
        let preview_hash = crate::processor::hash_bytes(&preview_data);
        let path =
            cache::write_preview(cache_root, &job.merchant_id, &preview_hash, &preview_data)
                .await?;
        Some(path)
    } else {
        None
    };

    // Process main image
    let (webp_bytes, width, height, content_hash) =
        crate::processor::process_image(&job.source_path, job.max_long_edge)?;

    // Write to cache
    let cache_path = cache::asset_cache_path(
        cache_root,
        &job.merchant_id,
        &content_hash,
        "image/webp",
    )?;
    cache::write_cached_file(&cache_path, &webp_bytes).await?;

    Ok(JobResult {
        asset_id: content_hash.clone(),
        cache_path,
        preview_path,
        content_hash,
        content_type: "image/webp".into(),
        byte_size: webp_bytes.len() as u64,
        width,
        height,
        original_filename: job.original_filename.clone(),
    })
}

/// Enqueue a job with path validation and preview generation.
pub async fn enqueue_job(
    queue: &JobQueue,
    cache_root: &Path,
    request: EnqueueJobRequest,
) -> Result<EnqueueJobResponse, PluginError> {
    // Validate source path
    crate::path_safety::validate_source_path(&request.source_path, cache_root)?;

    // Generate preview synchronously during enqueue (best-effort).
    // If the image is corrupt or unreadable, enqueue without a preview.
    let preview_path = if request.preview_max_long_edge > 0 {
        match crate::processor::generate_preview(
            &request.source_path,
            request.preview_max_long_edge,
        ) {
            Ok(preview_data) => {
                let preview_hash = crate::processor::hash_bytes(&preview_data);
                cache::write_preview(
                    cache_root,
                    &request.merchant_id,
                    &preview_hash,
                    &preview_data,
                )
                .await
                .ok()
            }
            Err(_) => None,
        }
    } else {
        None
    };

    let (job_id, _) = queue.enqueue(request, preview_path.clone()).await?;

    Ok(EnqueueJobResponse {
        job_id,
        preview_path,
    })
}

/// Look up a cached asset path by content hash.
pub async fn get_cached_asset_path(
    cache_root: &Path,
    merchant_id: &str,
    asset_id: &str,
    content_type: &str,
) -> Result<Option<CachedPathResponse>, PluginError> {
    let path = cache::asset_cache_path(cache_root, merchant_id, asset_id, content_type)?;
    if tokio::fs::metadata(&path).await.is_ok() {
        Ok(Some(CachedPathResponse {
            local_path: path,
            content_type: content_type.into(),
        }))
    } else {
        Ok(None)
    }
}

/// Look up a pending preview path.
pub async fn get_pending_preview(
    queue: &JobQueue,
    target: &AttachmentLookup,
) -> Result<Option<PreviewPathResponse>, PluginError> {
    queue.get_pending_preview(target).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn create_test_image(dir: &Path, name: &str, w: u32, h: u32) -> PathBuf {
        let path = dir.join(name);
        image::DynamicImage::new_rgb8(w, h).save(&path).unwrap();
        path
    }

    fn sample_request_with_source(source: PathBuf) -> EnqueueJobRequest {
        EnqueueJobRequest {
            merchant_id: "merchant-1".into(),
            source_path: source,
            original_filename: "photo.jpg".into(),
            source_mime_type: Some("image/jpeg".into()),
            processing_kind: "image:webp-thumbnail".into(),
            entity_type: "product".into(),
            entity_id: "product-1".into(),
            attachment_field: "image_asset_id".into(),
            max_long_edge: 400,
            preview_max_long_edge: 320,
            max_attempts: Some(3),
        }
    }

    // ── Enqueue with preview ───────────────────────────────────

    #[tokio::test]
    async fn enqueue_generates_preview() {
        let dir = temp_dir();
        let source = create_test_image(dir.path(), "photo.jpg", 800, 600);
        let queue = JobQueue::production(dir.path().to_path_buf());
        let req = sample_request_with_source(source);

        let resp = enqueue_job(&queue, dir.path(), req).await.unwrap();
        assert!(!resp.job_id.is_empty());
        assert!(resp.preview_path.is_some());
        assert!(resp.preview_path.unwrap().exists());
    }

    // ── Process pending jobs ───────────────────────────────────

    #[tokio::test]
    async fn process_single_pending_job() {
        let dir = temp_dir();
        let source = create_test_image(dir.path(), "photo.jpg", 800, 600);
        let queue = JobQueue::production(dir.path().to_path_buf());
        let req = sample_request_with_source(source);

        let resp = enqueue_job(&queue, dir.path(), req).await.unwrap();

        // Verify job is pending
        let completed = queue.get_completed().await.unwrap();
        assert!(completed.is_empty());

        // Process
        let result = process_pending_jobs(&queue, dir.path(), 10).await.unwrap();
        assert_eq!(result.attempted, 1);
        assert_eq!(result.completed, 1);
        assert_eq!(result.retry_scheduled, 0);
        assert_eq!(result.terminal_failed, 0);

        // Verify completed
        let completed = queue.get_completed().await.unwrap();
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].result.width, 400);
        assert_eq!(completed[0].result.height, 300);
        assert_eq!(completed[0].result.content_type, "image/webp");

        // Verify cache file exists
        assert!(completed[0].result.cache_path.exists());
    }

    #[tokio::test]
    async fn process_respects_limit() {
        let dir = temp_dir();
        let queue = JobQueue::production(dir.path().to_path_buf());

        for i in 0..5 {
            let source = create_test_image(dir.path(), &format!("p{i}.jpg"), 200, 200);
            let req = sample_request_with_source(source);
            enqueue_job(&queue, dir.path(), req).await.unwrap();
        }

        let result = process_pending_jobs(&queue, dir.path(), 2).await.unwrap();
        assert_eq!(result.attempted, 2);
        assert_eq!(result.completed, 2);
    }

    #[tokio::test]
    async fn process_zero_limit_returns_error() {
        let dir = temp_dir();
        let queue = JobQueue::production(dir.path().to_path_buf());

        let result = process_pending_jobs(&queue, dir.path(), 0).await;
        assert!(matches!(
            result,
            Err(PluginError::InvalidRequest { field: "limit", .. })
        ));
    }

    #[tokio::test]
    async fn corrupt_image_schedules_retry() {
        let dir = temp_dir();
        let queue = JobQueue::production(dir.path().to_path_buf());

        // Create a corrupt image
        let source = dir.path().join("corrupt.jpg");
        std::fs::write(&source, b"NOT A JPEG").unwrap();

        let mut req = sample_request_with_source(source);
        req.max_attempts = Some(3);

        enqueue_job(&queue, dir.path(), req).await.unwrap();
        let result = process_pending_jobs(&queue, dir.path(), 1).await.unwrap();
        assert_eq!(result.attempted, 1);
        assert_eq!(result.completed, 0);
        assert_eq!(result.retry_scheduled, 1);
    }

    #[tokio::test]
    async fn corrupt_image_terminal_after_max_attempts() {
        let dir = temp_dir();
        let queue = JobQueue::production(dir.path().to_path_buf());

        let source = dir.path().join("corrupt.jpg");
        std::fs::write(&source, b"NOT A JPEG").unwrap();

        let mut req = sample_request_with_source(source);
        req.max_attempts = Some(1);

        enqueue_job(&queue, dir.path(), req).await.unwrap();

        let result = process_pending_jobs(&queue, dir.path(), 10).await.unwrap();
        assert_eq!(result.attempted, 1);
        assert_eq!(result.completed, 0);
        assert_eq!(result.terminal_failed, 1);

        let failed = queue.get_failed().await.unwrap();
        assert_eq!(failed.len(), 1);
    }

    // ── Consume-first cleanup ──────────────────────────────────

    #[tokio::test]
    async fn consume_removes_job_from_completed() {
        let dir = temp_dir();
        let source = create_test_image(dir.path(), "photo.jpg", 200, 200);
        let queue = JobQueue::production(dir.path().to_path_buf());
        let req = sample_request_with_source(source);

        let resp = enqueue_job(&queue, dir.path(), req).await.unwrap();
        process_pending_jobs(&queue, dir.path(), 10).await.unwrap();

        let completed = queue.get_completed().await.unwrap();
        assert_eq!(completed.len(), 1);

        let result = queue.consume(&resp.job_id).await.unwrap();
        assert!(result.cache_path.exists()); // cache survives consumption

        assert!(queue.get_completed().await.unwrap().is_empty());
    }

    // ── Get cached asset path ──────────────────────────────────

    #[tokio::test]
    async fn get_cached_asset_returns_path() {
        let dir = temp_dir();
        let source = create_test_image(dir.path(), "photo.jpg", 200, 200);
        let queue = JobQueue::production(dir.path().to_path_buf());
        let req = sample_request_with_source(source);

        let resp = enqueue_job(&queue, dir.path(), req).await.unwrap();
        process_pending_jobs(&queue, dir.path(), 10).await.unwrap();

        let completed = queue.get_completed().await.unwrap();
        let result = &completed[0].result;

        let cached = get_cached_asset_path(
            dir.path(),
            "merchant-1",
            &result.asset_id,
            "image/webp",
        )
        .await
        .unwrap();

        assert!(cached.is_some());
        let cached = cached.unwrap();
        assert!(cached.local_path.exists());
        assert_eq!(cached.content_type, "image/webp");
    }

    #[tokio::test]
    async fn pending_preview_prefers_active_job_over_completed_job() {
        let dir = temp_dir();
        let completed_source = create_test_image(dir.path(), "completed.jpg", 200, 200);
        let pending_source = create_test_image(dir.path(), "pending.jpg", 200, 200);
        let queue = JobQueue::production(dir.path().to_path_buf());

        let completed_request = sample_request_with_source(completed_source);
        let completed_preview_path = dir.path().join("completed-preview.jpg");
        std::fs::write(&completed_preview_path, b"completed-preview").unwrap();
        let completed_job = queue
            .enqueue(completed_request, Some(completed_preview_path.clone()))
            .await
            .unwrap();
        let completed_result = JobResult {
            asset_id: "completed-asset".into(),
            cache_path: dir.path().join("completed.webp"),
            preview_path: Some(completed_preview_path.clone()),
            content_hash: "completed-asset".into(),
            content_type: "image/webp".into(),
            byte_size: 10,
            width: 200,
            height: 200,
            original_filename: "completed.jpg".into(),
        };
        queue.claim_next().await.unwrap().unwrap();
        queue
            .complete(&completed_job.0, completed_result)
            .await
            .unwrap();

        let pending_preview_path = dir.path().join("pending-preview.jpg");
        std::fs::write(&pending_preview_path, b"pending-preview").unwrap();
        let pending_request = sample_request_with_source(pending_source);
        let pending_job = queue
            .enqueue(pending_request, Some(pending_preview_path.clone()))
            .await
            .unwrap();

        let preview = get_pending_preview(
            &queue,
            &AttachmentLookup {
                entity_type: "product".into(),
                entity_id: "product-1".into(),
                attachment_field: "image_asset_id".into(),
            },
        )
        .await
        .unwrap()
        .expect("active preview should be returned");

        assert_eq!(preview.preview_path, pending_preview_path);
        assert_eq!(pending_job.0.len(), 36);
    }
}
