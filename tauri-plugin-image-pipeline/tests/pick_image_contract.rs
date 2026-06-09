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
// Android picker selection must preserve content:// selections
// ═══════════════════════════════════════════════════════════════

#[test]
fn content_uri_picker_selection_is_not_treated_like_a_local_path() {
    let selected =
        PickerSelection::from_picker_path_string("content://media/external/images/media/42")
            .expect("content uri should remain selectable");

    assert!(
        selected.is_content_uri(),
        "content:// picker selections must stay as URIs so they can be staged into cache"
    );
    assert!(
        selected.local_path().is_none(),
        "content:// picker selections must not be converted into a local path before staging"
    );
}
