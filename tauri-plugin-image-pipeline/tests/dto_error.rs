use serde_json;
use std::path::PathBuf;

use tauri_plugin_image_pipeline::dto::*;
use tauri_plugin_image_pipeline::error::PluginError;

fn sample_valid_job_record() -> JobRecord {
    JobRecord {
        id: uuid::Uuid::new_v4().to_string(),
        merchant_id: "merchant-1".into(),
        source_path: PathBuf::from("/tmp/photo.jpg"),
        original_filename: "photo.jpg".into(),
        source_mime_type: Some("image/jpeg".into()),
        processing_kind: "image:webp-thumbnail".into(),
        entity_type: "product".into(),
        entity_id: "product-1".into(),
        attachment_field: "image_asset_id".into(),
        max_long_edge: 400,
        preview_max_long_edge: 320,
        status: JobStatus::Pending,
        attempts: 0,
        max_attempts: 3,
        last_error: None,
        result: None,
        preview_path: Some(PathBuf::from("/cache/previews/abc.jpg")),
        created_at: "2026-06-09T12:00:00Z".into(),
        updated_at: "2026-06-09T12:00:00Z".into(),
    }
}

fn sample_completed_job_record() -> JobRecord {
    let mut job = sample_valid_job_record();
    job.status = JobStatus::Completed;
    job.result = Some(JobResult {
        asset_id: "abc123hash".into(),
        cache_path: PathBuf::from("/cache/sakti-image/merchant-1/assets/abc123hash.webp"),
        preview_path: Some(PathBuf::from("/cache/previews/abc.jpg")),
        content_hash: "abc123hash".into(),
        content_type: "image/webp".into(),
        byte_size: 12345,
        width: 400,
        height: 300,
        original_filename: "photo.jpg".into(),
    });
    job
}

fn sample_failed_job_record() -> JobRecord {
    let mut job = sample_valid_job_record();
    job.status = JobStatus::Failed;
    job.attempts = 3;
    job.last_error = Some("decode failed".into());
    job
}

// ═══════════════════════════════════════════════════════════════
// Task 2.1: Serialization tests
// ═══════════════════════════════════════════════════════════════

#[test]
fn queue_document_serializes_camel_case() {
    let doc = QueueDocument::default();
    let json = serde_json::to_string(&doc).unwrap();
    // Must use camelCase field names
    assert!(json.contains("\"version\""), "version field");
    assert!(json.contains("\"jobs\""), "jobs field");
}

#[test]
fn queue_document_version_is_1() {
    let doc = QueueDocument::default();
    assert_eq!(doc.version, QUEUE_VERSION);
    assert_eq!(doc.version, 1);
}

#[test]
fn queue_document_round_trip() {
    let doc = QueueDocument {
        version: 1,
        jobs: vec![sample_valid_job_record()],
    };
    let json = serde_json::to_string(&doc).unwrap();
    let parsed: QueueDocument = serde_json::from_str(&json).unwrap();
    assert_eq!(doc, parsed);
}

#[test]
fn job_status_snake_case_serialization() {
    assert_eq!(
        serde_json::to_string(&JobStatus::Pending).unwrap(),
        "\"pending\""
    );
    assert_eq!(
        serde_json::to_string(&JobStatus::Processing).unwrap(),
        "\"processing\""
    );
    assert_eq!(
        serde_json::to_string(&JobStatus::Completed).unwrap(),
        "\"completed\""
    );
    assert_eq!(
        serde_json::to_string(&JobStatus::Failed).unwrap(),
        "\"failed\""
    );
}

#[test]
fn job_record_camel_case_fields() {
    let job = sample_valid_job_record();
    let json = serde_json::to_string(&job).unwrap();
    let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&json).unwrap();

    // Verify camelCase field names
    assert!(map.contains_key("merchantId"), "merchantId");
    assert!(map.contains_key("sourcePath"), "sourcePath");
    assert!(map.contains_key("originalFilename"), "originalFilename");
    assert!(map.contains_key("sourceMimeType"), "sourceMimeType");
    assert!(map.contains_key("processingKind"), "processingKind");
    assert!(map.contains_key("entityType"), "entityType");
    assert!(map.contains_key("entityId"), "entityId");
    assert!(map.contains_key("attachmentField"), "attachmentField");
    assert!(map.contains_key("maxLongEdge"), "maxLongEdge");
    assert!(map.contains_key("previewMaxLongEdge"), "previewMaxLongEdge");
    assert!(map.contains_key("maxAttempts"), "maxAttempts");
    assert!(map.contains_key("lastError"), "lastError");
    assert!(map.contains_key("previewPath"), "previewPath");
    assert!(map.contains_key("createdAt"), "createdAt");
    assert!(map.contains_key("updatedAt"), "updatedAt");

    // Must NOT contain snake_case versions
    assert!(!map.contains_key("merchant_id"));
    assert!(!map.contains_key("source_path"));
    assert!(!map.contains_key("max_long_edge"));
}

#[test]
fn job_result_camel_case_fields() {
    let result = JobResult {
        asset_id: "hash123".into(),
        cache_path: PathBuf::from("/cache/asset.webp"),
        preview_path: None,
        content_hash: "hash123".into(),
        content_type: "image/webp".into(),
        byte_size: 5000,
        width: 400,
        height: 300,
        original_filename: "photo.jpg".into(),
    };
    let json = serde_json::to_string(&result).unwrap();
    let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&json).unwrap();

    assert!(map.contains_key("assetId"));
    assert!(map.contains_key("cachePath"));
    assert!(map.contains_key("previewPath"));
    assert!(map.contains_key("contentHash"));
    assert!(map.contains_key("contentType"));
    assert!(map.contains_key("byteSize"));
    assert!(map.contains_key("originalFilename"));
}

#[test]
fn enqueue_request_deserializes_camel_case() {
    let json = r#"{
        "merchantId": "m1",
        "sourcePath": "/tmp/photo.jpg",
        "originalFilename": "photo.jpg",
        "sourceMimeType": "image/jpeg",
        "processingKind": "image:webp-thumbnail",
        "entityType": "product",
        "entityId": "p1",
        "attachmentField": "image_asset_id",
        "maxLongEdge": 400,
        "previewMaxLongEdge": 320,
        "maxAttempts": 5
    }"#;
    let req: EnqueueJobRequest = serde_json::from_str(json).unwrap();
    assert_eq!(req.merchant_id, "m1");
    assert_eq!(req.max_long_edge, 400);
    assert_eq!(req.max_attempts, Some(5));
}

#[test]
fn completed_job_camel_case() {
    let job = CompletedJob {
        id: "job-1".into(),
        merchant_id: "m1".into(),
        processing_kind: "image:webp-thumbnail".into(),
        entity_type: "product".into(),
        entity_id: "p1".into(),
        attachment_field: "image_asset_id".into(),
        result: JobResult {
            asset_id: "hash".into(),
            cache_path: PathBuf::from("/cache/asset.webp"),
            preview_path: None,
            content_hash: "hash".into(),
            content_type: "image/webp".into(),
            byte_size: 1000,
            width: 400,
            height: 300,
            original_filename: "photo.jpg".into(),
        },
        attempts: 1,
        created_at: "2026-06-09T12:00:00Z".into(),
        updated_at: "2026-06-09T12:00:00Z".into(),
    };
    let json = serde_json::to_string(&job).unwrap();
    let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&json).unwrap();
    assert!(map.contains_key("entityType"));
    assert!(map.contains_key("entityId"));
    assert!(map.contains_key("attachmentField"));
    assert!(map.contains_key("processingKind"));
}

#[test]
fn event_payloads_camel_case() {
    let completed = JobCompletedPayload {
        job_id: "j1".into(),
        asset_path: std::path::PathBuf::from("/cache/abc.webp"),
        content_hash: "sha256:abc".into(),
        content_type: "image/webp".into(),
        byte_size: 1234,
        width: 400,
        height: 300,
        original_filename: "photo.jpg".into(),
    };
    let json = serde_json::to_string(&completed).unwrap();
    assert!(json.contains("\"jobId\""));

    let failed = JobFailedPayload {
        job_id: "j1".into(),
        error: "oops".into(),
        attempts: 2,
        max_attempts: 3,
        terminal: false,
    };
    let json = serde_json::to_string(&failed).unwrap();
    assert!(json.contains("\"jobId\""));
    assert!(json.contains("\"maxAttempts\""));
}

#[test]
fn process_jobs_response_camel_case() {
    let resp = ProcessJobsResponse {
        attempted: 5,
        completed: 3,
        retry_scheduled: 1,
        terminal_failed: 1,
    };
    let json = serde_json::to_string(&resp).unwrap();
    assert!(json.contains("\"retryScheduled\""));
    assert!(json.contains("\"terminalFailed\""));
}

// ═══════════════════════════════════════════════════════════════
// Task 2.3: Job invariant validation tests
// ═══════════════════════════════════════════════════════════════

#[test]
fn valid_job_record_passes_validation() {
    assert!(sample_valid_job_record().validate().is_ok());
}

#[test]
fn zero_max_long_edge_rejected() {
    let mut job = sample_valid_job_record();
    job.max_long_edge = 0;
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, .. } => assert_eq!(field, "max_long_edge"),
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn zero_preview_max_long_edge_rejected() {
    let mut job = sample_valid_job_record();
    job.preview_max_long_edge = 0;
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, .. } => assert_eq!(field, "preview_max_long_edge"),
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn zero_max_attempts_rejected() {
    let mut job = sample_valid_job_record();
    job.max_attempts = 0;
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, .. } => assert_eq!(field, "max_attempts"),
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn attempts_above_max_rejected() {
    let mut job = sample_valid_job_record();
    job.attempts = 5;
    job.max_attempts = 3;
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, reason } => {
            assert_eq!(field, "attempts");
            assert!(
                reason.contains("5"),
                "reason should mention actual attempts"
            );
            assert!(reason.contains("3"), "reason should mention max_attempts");
        }
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn completed_without_result_rejected() {
    let mut job = sample_valid_job_record();
    job.status = JobStatus::Completed;
    job.result = None;
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, .. } => assert_eq!(field, "result"),
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn non_completed_with_result_rejected() {
    let mut job = sample_valid_job_record();
    job.status = JobStatus::Pending;
    job.result = Some(JobResult {
        asset_id: "hash".into(),
        cache_path: PathBuf::from("/cache/a.webp"),
        preview_path: None,
        content_hash: "hash".into(),
        content_type: "image/webp".into(),
        byte_size: 1000,
        width: 400,
        height: 300,
        original_filename: "photo.jpg".into(),
    });
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, .. } => assert_eq!(field, "result"),
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn failed_without_error_rejected() {
    let mut job = sample_valid_job_record();
    job.status = JobStatus::Failed;
    job.last_error = None;
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, .. } => assert_eq!(field, "last_error"),
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn malformed_created_at_rejected() {
    let mut job = sample_valid_job_record();
    job.created_at = "not-a-date".into();
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, .. } => assert_eq!(field, "created_at"),
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn malformed_updated_at_rejected() {
    let mut job = sample_valid_job_record();
    job.updated_at = "June 9th 2026".into();
    let err = job.validate().unwrap_err();
    match err {
        PluginError::InvalidRequest { field, .. } => assert_eq!(field, "updated_at"),
        e => panic!("wrong error: {:?}", e),
    }
}

#[test]
fn completed_job_with_result_passes_validation() {
    assert!(sample_completed_job_record().validate().is_ok());
}

#[test]
fn failed_job_with_error_passes_validation() {
    assert!(sample_failed_job_record().validate().is_ok());
}

// ═══════════════════════════════════════════════════════════════
// Task 2.5: PluginError serialization tests
// ═══════════════════════════════════════════════════════════════

#[test]
fn plugin_error_io_has_operation_path_context() {
    let err = PluginError::Io {
        operation: "write",
        path: PathBuf::from("/tmp/jobs.json"),
        source: std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied"),
    };
    let msg = err.to_string();
    assert!(msg.contains("write"), "should mention operation");
    assert!(msg.contains("jobs.json"), "should mention path");
}

#[test]
fn plugin_error_invalid_request_has_field_context() {
    let err = PluginError::InvalidRequest {
        field: "max_long_edge",
        reason: "must be positive".into(),
    };
    let msg = err.to_string();
    assert!(msg.contains("max_long_edge"), "should mention field");
    assert!(msg.contains("positive"), "should mention reason");
}

#[test]
fn plugin_error_unsafe_path_has_path() {
    let err = PluginError::UnsafePath {
        path: PathBuf::from("/etc/passwd"),
    };
    let msg = err.to_string();
    assert!(msg.contains("/etc/passwd"));
}

#[test]
fn plugin_error_queue_corrupt_has_paths() {
    let err = PluginError::QueueCorrupt {
        primary: PathBuf::from("/cache/jobs.json"),
        backup: PathBuf::from("/cache/jobs.json.bak"),
    };
    let msg = err.to_string();
    assert!(msg.contains("jobs.json"));
    assert!(msg.contains("jobs.json.bak"));
}

#[test]
fn plugin_error_unsupported_version() {
    let err = PluginError::UnsupportedQueueVersion {
        found: 2,
        supported: 1,
    };
    let msg = err.to_string();
    assert!(msg.contains('2'));
    assert!(msg.contains('1'));
}

#[test]
fn plugin_error_invalid_transition() {
    let err = PluginError::InvalidTransition {
        job_id: "job-123".into(),
        from: JobStatus::Pending,
        action: "consume",
    };
    let msg = err.to_string();
    assert!(msg.contains("job-123"));
    assert!(
        msg.contains("Pending") || msg.contains("pending"),
        "should mention status"
    );
    assert!(msg.contains("consume"), "should mention action");
}

#[test]
fn plugin_error_job_not_found() {
    let err = PluginError::JobNotFound {
        job_id: "missing".into(),
    };
    assert!(err.to_string().contains("missing"));
}

#[test]
fn plugin_error_processing() {
    let err = PluginError::Processing {
        job_id: Some("j1".into()),
        stage: "decode",
        reason: "corrupt header".into(),
    };
    let msg = err.to_string();
    assert!(msg.contains("j1"));
    assert!(msg.contains("decode"));
    assert!(msg.contains("corrupt"));
}

#[test]
fn plugin_error_processing_no_job_id() {
    let err = PluginError::Processing {
        job_id: None,
        stage: "hash",
        reason: "empty bytes".into(),
    };
    let msg = err.to_string();
    assert!(msg.contains("hash"));
}

#[test]
fn plugin_error_event() {
    let err = PluginError::Event {
        name: "asset-job-completed",
        reason: "emitter closed".into(),
    };
    let msg = err.to_string();
    assert!(msg.contains("asset-job-completed"));
}
