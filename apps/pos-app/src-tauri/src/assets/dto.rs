use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessedImageResponse {
    pub byte_size: usize,
    pub content_hash: String,
    pub content_type: String,
    pub data_base64: String,
    pub height: u32,
    pub width: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedAssetResponse {
    pub local_path: String,
    pub object_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedAssetRecord {
    pub id: String,
    pub merchant_id: String,
    pub object_key: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub content_hash: String,
    pub kind: String,
    pub width: i32,
    pub height: i32,
    pub status: String,
    pub created_by_user_id: String,
    pub deleted_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedLocalAssetResponse {
    pub asset: PreparedAssetRecord,
    pub data_base64: String,
    pub local_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueAssetProcessingRequest {
    pub(super) original_filename: String,
    pub(super) processing_kind: String,
    pub(super) source_mime_type: Option<String>,
    pub(super) source_path: String,
    pub(super) target: AssetAttachmentTarget,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueAssetProcessingResponse {
    pub job_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetAttachmentTarget {
    pub(super) entity_type: String,
    pub(super) entity_id: String,
    pub(super) field: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedAssetPathResponse {
    pub local_path: String,
    pub content_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPreviewPathResponse {
    pub preview_path: String,
    pub preview_mime_type: String,
}

#[derive(Debug)]
pub(super) struct PreparedImageInput {
    pub(super) byte_size: i64,
    pub(super) content_hash: String,
    pub(super) content_type: String,
    pub(super) data_base64: String,
    pub(super) height: i32,
    pub(super) kind: String,
    pub(super) merchant_id: String,
    pub(super) original_filename: String,
    pub(super) width: i32,
}
