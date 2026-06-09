use std::path::PathBuf;
use std::sync::Arc;

use tauri_plugin_image_pipeline::dto::*;
use tauri_plugin_image_pipeline::error::PluginError;
use tauri_plugin_image_pipeline::queue_state::JobQueue;

fn temp_dir() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
}

fn sample_request(merchant_id: &str, entity_id: &str) -> EnqueueJobRequest {
    EnqueueJobRequest {
        merchant_id: merchant_id.into(),
        source_path: PathBuf::from("/tmp/photo.jpg"),
        original_filename: "photo.jpg".into(),
        source_mime_type: Some("image/jpeg".into()),
        processing_kind: "image:webp-thumbnail".into(),
        entity_type: "product".into(),
        entity_id: entity_id.into(),
        attachment_field: "image_asset_id".into(),
        max_long_edge: 400,
        preview_max_long_edge: 320,
        max_attempts: Some(3),
    }
}

fn sample_result() -> JobResult {
    JobResult {
        asset_id: "abc123hash".into(),
        cache_path: PathBuf::from("/cache/assets/abc123hash.webp"),
        preview_path: Some(PathBuf::from("/cache/previews/abc.jpg")),
        content_hash: "abc123hash".into(),
        content_type: "image/webp".into(),
        byte_size: 12345,
        width: 400,
        height: 300,
        original_filename: "photo.jpg".into(),
    }
}

// ═══════════════════════════════════════════════════════════════
// Task 4.1-4.2: Full lifecycle
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn lifecycle_enqueue_claim_complete_consume() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    // Enqueue
    let (job_id, preview) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();
    assert!(!job_id.is_empty());
    assert!(preview.is_none());

    // Claim
    let claimed = queue.claim_next().await.unwrap().unwrap();
    assert_eq!(claimed.id, job_id);
    assert_eq!(claimed.status, JobStatus::Processing);
    assert_eq!(claimed.attempts, 1);

    // No more pending
    assert!(queue.claim_next().await.unwrap().is_none());

    // Complete
    let result = sample_result();
    queue.complete(&job_id, result.clone()).await.unwrap();

    // List completed
    let completed = queue.get_completed().await.unwrap();
    assert_eq!(completed.len(), 1);
    assert_eq!(completed[0].id, job_id);
    assert_eq!(completed[0].result.content_hash, "abc123hash");

    // Consume
    let consumed = queue.consume(&job_id).await.unwrap();
    assert_eq!(consumed.content_hash, "abc123hash");

    // Empty after consume
    assert!(queue.get_completed().await.unwrap().is_empty());
}

#[tokio::test]
async fn enqueue_multiple_jobs_claimed_fifo_order() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (id1, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();
    // Small delay to ensure different timestamps
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    let (id2, _) = queue
        .enqueue(sample_request("m1", "p2"), None)
        .await
        .unwrap();

    let first = queue.claim_next().await.unwrap().unwrap();
    assert_eq!(first.id, id1, "should claim oldest first");

    let second = queue.claim_next().await.unwrap().unwrap();
    assert_eq!(second.id, id2);
}

// ═══════════════════════════════════════════════════════════════
// Task 4.3-4.4: Invalid transitions
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn complete_pending_job_is_invalid() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();

    let result = queue.complete(&job_id, sample_result()).await;
    assert!(matches!(
        result,
        Err(PluginError::InvalidTransition {
            action: "complete",
            ..
        })
    ));
}

#[tokio::test]
async fn consume_pending_job_is_invalid() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();

    let result = queue.consume(&job_id).await;
    assert!(matches!(
        result,
        Err(PluginError::InvalidTransition {
            action: "consume",
            ..
        })
    ));
}

#[tokio::test]
async fn consume_processing_job_is_invalid() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();
    queue.claim_next().await.unwrap().unwrap();

    let result = queue.consume(&job_id).await;
    assert!(matches!(
        result,
        Err(PluginError::InvalidTransition {
            action: "consume",
            ..
        })
    ));
}

#[tokio::test]
async fn complete_nonexistent_job_is_not_found() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let result = queue.complete("no-such-id", sample_result()).await;
    assert!(matches!(result, Err(PluginError::JobNotFound { .. })));
}

#[tokio::test]
async fn consume_nonexistent_job_is_not_found() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let result = queue.consume("no-such-id").await;
    assert!(matches!(result, Err(PluginError::JobNotFound { .. })));
}

// ═══════════════════════════════════════════════════════════════
// Task 4.5-4.6: Retryable failure
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn retryable_failure_returns_to_pending() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();
    queue.claim_next().await.unwrap().unwrap();

    // Retryable failure
    queue
        .fail_retryable(&job_id, "network timeout".into())
        .await
        .unwrap();

    // Job should be back to pending
    let claimed = queue.claim_next().await.unwrap().unwrap();
    assert_eq!(claimed.id, job_id);
    assert_eq!(claimed.status, JobStatus::Processing);
    assert_eq!(claimed.attempts, 2, "attempts should increment on re-claim");
    assert_eq!(claimed.last_error, Some("network timeout".into()));
}

#[tokio::test]
async fn retryable_failure_on_pending_is_invalid() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();

    let result = queue.fail_retryable(&job_id, "err".into()).await;
    assert!(matches!(
        result,
        Err(PluginError::InvalidTransition {
            action: "fail_retryable",
            ..
        })
    ));
}

// ═══════════════════════════════════════════════════════════════
// Task 4.7-4.8: Terminal failure
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn terminal_failure_marks_job_failed() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();
    queue.claim_next().await.unwrap().unwrap();

    queue
        .fail_terminal(&job_id, "corrupt image".into())
        .await
        .unwrap();

    // Should not be claimable
    assert!(queue.claim_next().await.unwrap().is_none());

    // Should appear in failed list
    let failed = queue.get_failed().await.unwrap();
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0].id, job_id);
    assert_eq!(failed[0].last_error, "corrupt image");
}

#[tokio::test]
async fn terminal_failure_on_pending_is_invalid() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();

    let result = queue.fail_terminal(&job_id, "err".into()).await;
    assert!(matches!(
        result,
        Err(PluginError::InvalidTransition {
            action: "fail_terminal",
            ..
        })
    ));
}

// ═══════════════════════════════════════════════════════════════
// Task 4.9-4.10: Explicit retry
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn explicit_retry_resets_failed_job() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    // Create a temp source file
    let source = dir.path().join("source.jpg");
    tokio::fs::write(&source, b"fake image").await.unwrap();

    let mut req = sample_request("m1", "p1");
    req.source_path = source.clone();

    let (job_id, _) = queue.enqueue(req, None).await.unwrap();
    queue.claim_next().await.unwrap().unwrap();
    queue
        .fail_terminal(&job_id, "corrupt".into())
        .await
        .unwrap();

    // Retry
    queue.retry_failed(&job_id).await.unwrap();

    // Should be claimable again with reset attempts
    let claimed = queue.claim_next().await.unwrap().unwrap();
    assert_eq!(claimed.id, job_id);
    assert_eq!(
        claimed.attempts, 1,
        "attempts reset to 0 then incremented to 1 on claim"
    );
    assert!(claimed.last_error.is_none());
}

#[tokio::test]
async fn retry_pending_job_is_invalid() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();

    let result = queue.retry_failed(&job_id).await;
    assert!(matches!(
        result,
        Err(PluginError::InvalidTransition {
            action: "retry_failed",
            ..
        })
    ));
}

// ═══════════════════════════════════════════════════════════════
// Task 4.11-4.12: Retry with missing source
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn retry_with_missing_source_returns_error() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (job_id, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();
    queue.claim_next().await.unwrap().unwrap();
    queue.fail_terminal(&job_id, "err".into()).await.unwrap();

    // Source doesn't exist
    let result = queue.retry_failed(&job_id).await;
    assert!(matches!(
        result,
        Err(PluginError::InvalidRequest {
            field: "source_path",
            ..
        })
    ));
}

// ═══════════════════════════════════════════════════════════════
// Task 4.13-4.14: Reset stuck jobs
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn reset_stuck_returns_processing_to_pending() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (id1, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();
    let (id2, _) = queue
        .enqueue(sample_request("m1", "p2"), None)
        .await
        .unwrap();

    // Claim both
    queue.claim_next().await.unwrap().unwrap();
    queue.claim_next().await.unwrap().unwrap();

    // No pending left
    assert!(queue.claim_next().await.unwrap().is_none());

    // Reset stuck
    let count = queue.reset_stuck().await.unwrap();
    assert_eq!(count, 2);

    // Both should be claimable again
    let claimed = queue.claim_next().await.unwrap().unwrap();
    assert!(claimed.id == id1 || claimed.id == id2);
}

#[tokio::test]
async fn reset_stuck_with_no_processing_returns_zero() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();

    let count = queue.reset_stuck().await.unwrap();
    assert_eq!(count, 0);
}

// ═══════════════════════════════════════════════════════════════
// Task 4.15-4.16: Concurrent claims
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn concurrent_claims_never_duplicate() {
    let dir = temp_dir();
    let queue = Arc::new(JobQueue::production(dir.path().to_path_buf()));

    // Enqueue 5 jobs
    for i in 0..5 {
        queue
            .enqueue(sample_request("m1", &format!("p{i}")), None)
            .await
            .unwrap();
    }

    // Spawn 10 tasks trying to claim
    let mut handles = vec![];
    for _ in 0..10 {
        let q = queue.clone();
        handles.push(tokio::spawn(async move { q.claim_next().await }));
    }

    let mut claimed_ids = vec![];
    for h in handles {
        if let Ok(Ok(Some(job))) = h.await {
            claimed_ids.push(job.id);
        }
    }

    // Exactly 5 unique claims
    claimed_ids.sort();
    claimed_ids.dedup();
    assert_eq!(claimed_ids.len(), 5, "each job claimed exactly once");
}

// ═══════════════════════════════════════════════════════════════
// Task 4.17: Run with thread configs
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn multiple_enqueue_claim_complete_cycles() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    for i in 0..5 {
        let (job_id, _) = queue
            .enqueue(sample_request("m1", &format!("p{i}")), None)
            .await
            .unwrap();

        let claimed = queue.claim_next().await.unwrap().unwrap();
        assert_eq!(claimed.id, job_id);

        queue.complete(&job_id, sample_result()).await.unwrap();
        queue.consume(&job_id).await.unwrap();
    }

    assert!(queue.get_completed().await.unwrap().is_empty());
    assert!(queue.get_failed().await.unwrap().is_empty());
}

#[tokio::test]
async fn failed_jobs_appear_in_failed_list() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let (id1, _) = queue
        .enqueue(sample_request("m1", "p1"), None)
        .await
        .unwrap();
    queue.claim_next().await.unwrap().unwrap();
    queue.fail_terminal(&id1, "bad image".into()).await.unwrap();

    let failed = queue.get_failed().await.unwrap();
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0].id, id1);
    assert_eq!(failed[0].last_error, "bad image");
    assert_eq!(failed[0].attempts, 1);
}

#[tokio::test]
async fn retry_failed_on_nonexistent_job_is_not_found() {
    let dir = temp_dir();
    let queue = JobQueue::production(dir.path().to_path_buf());

    let result = queue.retry_failed("no-such-id").await;
    assert!(matches!(result, Err(PluginError::JobNotFound { .. })));
}
