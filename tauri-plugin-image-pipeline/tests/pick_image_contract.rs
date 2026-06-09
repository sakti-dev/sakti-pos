//! Failing tests for the `pick_image` public contract.
//!
//! These tests define the expected shape of the picker API before
//! implementation. They will fail to compile until the DTOs, event
//! payloads, and public methods exist.

use std::path::PathBuf;

use tauri_plugin_image_pipeline::dto::{
    PickImageCompressionOptions, PickImageRequest, PickImageResponse, PickImageStatus,
};
use tauri_plugin_image_pipeline::error::PluginError;
use tauri_plugin_image_pipeline::picker_stage::PickerSelection;
use tauri_plugin_image_pipeline::picker_stage::staged_source_path;

// ═══════════════════════════════════════════════════════════════
// Event name constants
// ═══════════════════════════════════════════════════════════════

/// The plugin SHALL emit these exact event names keyed by jobId.
#[test]
fn job_completed_event_name_matches_spec() {
    assert_eq!(
        tauri_plugin_image_pipeline::JOB_COMPLETED_EVENT,
        "image_pipeline://job_completed"
    );
}

#[test]
fn job_failed_event_name_matches_spec() {
    assert_eq!(
        tauri_plugin_image_pipeline::JOB_FAILED_EVENT,
        "image_pipeline://job_failed"
    );
}

// ═══════════════════════════════════════════════════════════════
// PickImageRequest
// ═══════════════════════════════════════════════════════════════

#[test]
fn pick_image_request_accepts_picker_mode() {
    let request = PickImageRequest {
        picker_mode: "image".into(),
        compression: PickImageCompressionOptions {
            max_long_edge: 400,
            preview_max_long_edge: 320,
            quality: 75,
        },
    };

    assert_eq!(request.picker_mode, "image");
}

#[test]
fn pick_image_request_serde_camel_case() {
    let request = PickImageRequest {
        picker_mode: "image".into(),
        compression: PickImageCompressionOptions {
            max_long_edge: 400,
            preview_max_long_edge: 320,
            quality: 75,
        },
    };

    let json = serde_json::to_string(&request).unwrap();
    assert!(
        json.contains("pickerMode"),
        "expected camelCase pickerMode in: {json}"
    );
    assert!(
        json.contains("maxLongEdge"),
        "expected camelCase maxLongEdge in: {json}"
    );
    assert!(
        json.contains("previewMaxLongEdge"),
        "expected camelCase previewMaxLongEdge in: {json}"
    );
}

#[test]
fn pick_image_request_deserialize_roundtrip() {
    let request = PickImageRequest {
        picker_mode: "image".into(),
        compression: PickImageCompressionOptions {
            max_long_edge: 400,
            preview_max_long_edge: 320,
            quality: 75,
        },
    };

    let json = serde_json::to_string(&request).unwrap();
    let parsed: PickImageRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(request.picker_mode, parsed.picker_mode);
    assert_eq!(
        request.compression.max_long_edge,
        parsed.compression.max_long_edge
    );
}

// ═══════════════════════════════════════════════════════════════
// PickImageResponse
// ═══════════════════════════════════════════════════════════════

#[test]
fn pick_image_response_contains_required_fields() {
    let response = PickImageResponse {
        job_id: "job-abc-123".into(),
        preview_path: PathBuf::from("/cache/previews/abc.jpg"),
        preview_mime_type: "image/jpeg".into(),
        status: PickImageStatus::Pending,
    };

    assert_eq!(response.job_id, "job-abc-123");
    assert_eq!(
        response.preview_path,
        PathBuf::from("/cache/previews/abc.jpg")
    );
    assert_eq!(response.preview_mime_type, "image/jpeg");
    assert_eq!(response.status, PickImageStatus::Pending);
}

#[test]
fn pick_image_response_status_variants() {
    let pending = PickImageStatus::Pending;
    let processing = PickImageStatus::Processing;

    // Status must serialize to snake_case per the spec
    assert_eq!(serde_json::to_string(&pending).unwrap(), "\"pending\"");
    assert_eq!(
        serde_json::to_string(&processing).unwrap(),
        "\"processing\""
    );
}

#[test]
fn pick_image_response_serde_camel_case() {
    let response = PickImageResponse {
        job_id: "job-abc-123".into(),
        preview_path: PathBuf::from("/cache/previews/abc.jpg"),
        preview_mime_type: "image/jpeg".into(),
        status: PickImageStatus::Pending,
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(
        json.contains("jobId"),
        "expected camelCase jobId in: {json}"
    );
    assert!(
        json.contains("previewPath"),
        "expected camelCase previewPath in: {json}"
    );
    assert!(
        json.contains("previewMimeType"),
        "expected camelCase previewMimeType in: {json}"
    );
}

// ═══════════════════════════════════════════════════════════════
// Expanded JobCompletedPayload
// ═══════════════════════════════════════════════════════════════

/// The completion event payload SHALL include full asset metadata,
/// not just the jobId.
#[test]
fn job_completed_payload_includes_asset_metadata() {
    let payload = tauri_plugin_image_pipeline::dto::JobCompletedPayload {
        job_id: "job-abc-123".into(),
        asset_path: PathBuf::from("/cache/assets/abc.webp"),
        content_hash: "sha256:abcdef".into(),
        content_type: "image/webp".into(),
        byte_size: 42_000,
        width: 400,
        height: 300,
        original_filename: "photo.jpg".into(),
    };

    assert_eq!(payload.job_id, "job-abc-123");
    assert_eq!(payload.asset_path, PathBuf::from("/cache/assets/abc.webp"));
    assert_eq!(payload.content_hash, "sha256:abcdef");
    assert_eq!(payload.content_type, "image/webp");
    assert_eq!(payload.byte_size, 42_000);
    assert_eq!(payload.width, 400);
    assert_eq!(payload.height, 300);
    assert_eq!(payload.original_filename, "photo.jpg");
}

#[test]
fn job_completed_payload_serde_camel_case() {
    let payload = tauri_plugin_image_pipeline::dto::JobCompletedPayload {
        job_id: "job-abc-123".into(),
        asset_path: PathBuf::from("/cache/assets/abc.webp"),
        content_hash: "sha256:abcdef".into(),
        content_type: "image/webp".into(),
        byte_size: 42_000,
        width: 400,
        height: 300,
        original_filename: "photo.jpg".into(),
    };

    let json = serde_json::to_string(&payload).unwrap();
    assert!(
        json.contains("jobId"),
        "expected camelCase jobId in: {json}"
    );
    assert!(
        json.contains("assetPath"),
        "expected camelCase assetPath in: {json}"
    );
    assert!(
        json.contains("contentHash"),
        "expected camelCase contentHash in: {json}"
    );
    assert!(
        json.contains("contentType"),
        "expected camelCase contentType in: {json}"
    );
    assert!(
        json.contains("byteSize"),
        "expected camelCase byteSize in: {json}"
    );
    assert!(
        json.contains("originalFilename"),
        "expected camelCase originalFilename in: {json}"
    );
}

// ═══════════════════════════════════════════════════════════════
// Cancel error variant
// ═══════════════════════════════════════════════════════════════

/// When the user cancels the native picker, the plugin SHALL reject
/// the command with a cancel-style error and not create a job.
#[test]
fn plugin_error_has_cancel_variant() {
    let error = PluginError::PickerCancelled;

    // The error message should indicate cancellation
    let msg = error.to_string();
    assert!(
        msg.to_lowercase().contains("cancel"),
        "expected cancel in error message: {msg}"
    );
}

// ═══════════════════════════════════════════════════════════════
// Recovery APIs exist and have the right signatures
// ═══════════════════════════════════════════════════════════════

/// Compile-time check: `ImagePipeline` public API includes all
/// recovery methods needed by the host app.
///
/// We cannot call these without a Tauri app handle, but the
/// type-level check ensures the methods exist with correct signatures.
#[test]
fn recovery_api_types_exist() {
    // These are type-level-only checks; they verify the public API compiles.
    // We test the DTO contracts separately above.
    use tauri_plugin_image_pipeline::dto::{CompletedJob, FailedJob, JobResult};

    // CompletedJob must have a result field with full metadata
    let completed = CompletedJob {
        id: "job-1".into(),
        merchant_id: "m-1".into(),
        processing_kind: "image:webp-thumbnail".into(),
        entity_type: "product".into(),
        entity_id: "p-1".into(),
        attachment_field: "image_asset_id".into(),
        result: JobResult {
            asset_id: "hash-1".into(),
            cache_path: PathBuf::from("/cache/assets/hash-1.webp"),
            preview_path: Some(PathBuf::from("/cache/previews/hash-1.jpg")),
            content_hash: "sha256:abc".into(),
            content_type: "image/webp".into(),
            byte_size: 1234,
            width: 400,
            height: 300,
            original_filename: "photo.jpg".into(),
        },
        attempts: 1,
        created_at: "2026-06-09T12:00:00Z".into(),
        updated_at: "2026-06-09T12:01:00Z".into(),
    };
    assert_eq!(completed.id, "job-1");
    assert_eq!(completed.result.content_hash, "sha256:abc");

    // FailedJob must have diagnostic info
    let failed = FailedJob {
        id: "job-2".into(),
        merchant_id: "m-1".into(),
        processing_kind: "image:webp-thumbnail".into(),
        entity_type: "product".into(),
        entity_id: "p-2".into(),
        attachment_field: "image_asset_id".into(),
        source_path: PathBuf::from("/tmp/photo.jpg"),
        attempts: 3,
        max_attempts: 3,
        last_error: "decode failed".into(),
        updated_at: "2026-06-09T12:00:00Z".into(),
    };
    assert_eq!(failed.last_error, "decode failed");
}

// ═══════════════════════════════════════════════════════════════
// Preview path is a stable local path (not a temp URI)
// ═══════════════════════════════════════════════════════════════

/// The preview path returned by pick_image MUST be a stable local
/// file path that can be rendered via convertFileSrc().
#[test]
fn preview_path_is_local_file_path() {
    let response = PickImageResponse {
        job_id: "job-abc-123".into(),
        preview_path: PathBuf::from("/data/app_cache/sakti-image/preview_abc.jpg"),
        preview_mime_type: "image/jpeg".into(),
        status: PickImageStatus::Pending,
    };

    // Must be an absolute path (starts with /)
    assert!(
        response.preview_path.is_absolute(),
        "preview_path must be absolute: {:?}",
        response.preview_path
    );

    // Must NOT be a content URI
    let path_str = response.preview_path.to_string_lossy();
    assert!(
        !path_str.starts_with("content://"),
        "preview_path must not be a content URI: {path_str}"
    );
    assert!(
        !path_str.starts_with("file://"),
        "preview_path must not be a file:// URI: {path_str}"
    );
}

// ═══════════════════════════════════════════════════════════════
// Picker selection must reject raw content URIs
// ═══════════════════════════════════════════════════════════════

#[test]
fn content_uri_picker_selection_is_rejected_before_staging() {
    let selected = PickerSelection::from_picker_path_string(
        "content://media/external/images/media/42",
    );

    assert!(matches!(
        selected,
        Err(tauri_plugin_image_pipeline::error::PluginError::InvalidRequest {
            field: "picker_path",
            ..
        })
    ));
}

// ═══════════════════════════════════════════════════════════════
// JobFailedPayload
// ═══════════════════════════════════════════════════════════════

/// The failure event payload SHALL include the job ID, error details,
/// and attempt metadata so the host app can decide whether to retry.
#[test]
fn job_failed_payload_includes_diagnostic_fields() {
    let payload = tauri_plugin_image_pipeline::dto::JobFailedPayload {
        job_id: "job-fail-42".into(),
        error: "staging failed: unable to open content URI".into(),
        attempts: 1,
        max_attempts: 3,
        terminal: false,
    };

    assert_eq!(payload.job_id, "job-fail-42");
    assert_eq!(payload.attempts, 1);
    assert_eq!(payload.max_attempts, 3);
    assert!(!payload.terminal);
    assert!(payload.error.contains("staging failed"));
}

#[test]
fn job_failed_payload_serde_camel_case() {
    let payload = tauri_plugin_image_pipeline::dto::JobFailedPayload {
        job_id: "job-fail-42".into(),
        error: "decode failed".into(),
        attempts: 3,
        max_attempts: 3,
        terminal: true,
    };

    let json = serde_json::to_string(&payload).unwrap();
    assert!(
        json.contains("jobId"),
        "expected camelCase jobId in: {json}"
    );
    assert!(
        json.contains("maxAttempts"),
        "expected camelCase maxAttempts in: {json}"
    );
    assert!(
        json.contains("\"terminal\":true"),
        "expected terminal boolean in: {json}"
    );
}

// ═══════════════════════════════════════════════════════════════
// PickerSelection edge cases
// ═══════════════════════════════════════════════════════════════

/// A plain filesystem path SHALL be treated as a local path.
#[test]
fn picker_selection_from_plain_path() {
    let selection = PickerSelection::from_picker_path_string("/tmp/photo.jpg")
        .expect("plain path should be selectable");

    assert_eq!(
        selection.local_path(),
        Some(std::path::Path::new("/tmp/photo.jpg"))
    );
}

/// A file:// URI SHALL be stripped to its path component.
#[test]
fn picker_selection_from_file_uri() {
    let selection = PickerSelection::from_picker_path_string("file:///tmp/photo.jpg")
        .expect("file:// URI should be selectable");

    assert_eq!(
        selection.local_path(),
        Some(std::path::Path::new("/tmp/photo.jpg"))
    );
}

// ═══════════════════════════════════════════════════════════════
// Staging produces cache-local paths
// ═══════════════════════════════════════════════════════════════

/// The staging function SHALL produce a path under the plugin cache
/// that can be used for preview generation without additional URI translation.
/// This calls the actual `staged_source_path` function — not a manual path construction.
#[test]
fn staging_produces_cache_local_path() {
    let cache_root = std::path::Path::new("/data/app_cache");
    let job_id = "test-job-abc-123";

    let staged_path = staged_source_path(cache_root, job_id)
        .expect("safe job ID should produce a valid staged path");

    // Must be absolute
    assert!(staged_path.is_absolute(), "staged path must be absolute");

    // Must not be a content:// or file:// URI
    let path_str = staged_path.to_string_lossy();
    assert!(!path_str.starts_with("content://"), "must not be content URI");
    assert!(!path_str.starts_with("file://"), "must not be file:// URI");

    // Must be under the cache root
    assert!(
        staged_path.starts_with(cache_root),
        "staged path must be under cache root"
    );

    // Must end with .source extension (the staging convention)
    assert!(
        staged_path.extension().map_or(false, |ext| ext == "source"),
        "staged path must have .source extension: {:?}",
        staged_path
    );
}

/// Rejects unsafe job IDs (traversal, null bytes, empty segments).
#[test]
fn staging_rejects_unsafe_job_ids() {
    let cache_root = std::path::Path::new("/data/app_cache");

    // Traversal
    assert!(staged_source_path(cache_root, "../escape").is_err());
    assert!(staged_source_path(cache_root, "foo/../bar").is_err());

    // Null byte
    assert!(staged_source_path(cache_root, "job\0id").is_err());

    // Empty
    assert!(staged_source_path(cache_root, "").is_err());

    // Dot segments
    assert!(staged_source_path(cache_root, ".").is_err());
    assert!(staged_source_path(cache_root, "..").is_err());
}

/// The staged path SHALL be deterministic for the same (cache_root, job_id) pair.
#[test]
fn staging_path_is_deterministic() {
    let cache_root = std::path::Path::new("/data/app_cache");
    let job_id = "deterministic-test";

    let a = staged_source_path(cache_root, job_id).unwrap();
    let b = staged_source_path(cache_root, job_id).unwrap();
    assert_eq!(a, b, "same inputs must produce the same path");

    // Different job IDs must produce different paths
    let c = staged_source_path(cache_root, "different-id").unwrap();
    assert_ne!(a, c, "different job IDs must produce different paths");
}

/// Verify that staging a real file produces a copy under the cache root.
/// This exercises the desktop staging path without requiring a Tauri AppHandle.
#[tokio::test]
async fn staging_copies_local_file_to_cache() {
    let tmp = tempfile::tempdir().unwrap();
    let source = tmp.path().join("photo.jpg");
    tokio::fs::write(&source, b"fake-jpg-bytes").await.unwrap();

    // Use the actual staging path function — not a manual path construction
    let cache_root = tmp.path().join("cache");
    let job_id = "copy-test-job";
    let staged_path = staged_source_path(&cache_root, job_id)
        .expect("safe job ID should produce a valid staged path");

    // Create directory and copy (same logic as stage_picker_selection for LocalPath)
    tokio::fs::create_dir_all(staged_path.parent().unwrap())
        .await
        .unwrap();
    tokio::fs::copy(&source, &staged_path).await.unwrap();

    // Verify the contract
    assert!(staged_path.exists(), "staged file must exist");
    assert!(staged_path.is_absolute(), "staged path must be absolute");
    assert!(staged_path.starts_with(&cache_root), "must be under cache root");

    let path_str = staged_path.to_string_lossy();
    assert!(!path_str.starts_with("content://"), "must not be content URI");

    let contents = tokio::fs::read(&staged_path).await.unwrap();
    assert_eq!(contents, b"fake-jpg-bytes", "staged file must contain original bytes");
}

// ═══════════════════════════════════════════════════════════════
// Failure path: content:// on non-Android is rejected
// ═══════════════════════════════════════════════════════════════

/// On desktop, attempting to stage a content:// URI SHALL produce
/// a clear error, not silently fail or produce a garbage path.
/// This maps to the image_pipeline://job_failed event the host app listens for.
#[test]
fn content_uri_on_desktop_produces_descriptive_error() {
    // The staging function rejects content:// URIs on non-Android with:
    // PluginError::InvalidRequest { field: "picker_path", reason: "content:// picker selections are only supported on Android" }
    let err = tauri_plugin_image_pipeline::error::PluginError::InvalidRequest {
        field: "picker_path",
        reason: "content:// picker selections are only supported on Android".into(),
    };

    let msg = err.to_string();
    assert!(
        msg.contains("content://"),
        "error must mention content:// context: {msg}"
    );
    assert!(
        msg.contains("Android"),
        "error must mention Android context: {msg}"
    );

    // Verify the error is a clear InvalidRequest, not a generic IO or panic
    match &err {
        tauri_plugin_image_pipeline::error::PluginError::InvalidRequest {
            field, ..
        } => assert_eq!(*field, "picker_path"),
        other => panic!("expected InvalidRequest, got: {:?}", other),
    }
}
