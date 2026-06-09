use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Queue document ──────────────────────────────────────────────────

pub const QUEUE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueueDocument {
    pub version: u32,
    pub jobs: Vec<JobRecord>,
}

impl Default for QueueDocument {
    fn default() -> Self {
        Self {
            version: QUEUE_VERSION,
            jobs: Vec::new(),
        }
    }
}

// ── Job state ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

impl std::fmt::Display for JobStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Processing => write!(f, "processing"),
            Self::Completed => write!(f, "completed"),
            Self::Failed => write!(f, "failed"),
        }
    }
}

// ── Job record ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: String,
    pub merchant_id: String,
    pub source_path: PathBuf,
    pub original_filename: String,
    pub source_mime_type: Option<String>,
    pub processing_kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
    pub max_long_edge: u32,
    pub preview_max_long_edge: u32,
    pub status: JobStatus,
    pub attempts: u32,
    pub max_attempts: u32,
    pub last_error: Option<String>,
    pub result: Option<JobResult>,
    pub preview_path: Option<PathBuf>,
    pub created_at: String,
    pub updated_at: String,
}

impl JobRecord {
    /// Validates all invariants required by the queue design.
    /// Returns the first invariant violation encountered.
    pub fn validate(&self) -> Result<(), crate::error::PluginError> {
        if self.max_long_edge == 0 {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "max_long_edge",
                reason: "must be greater than zero".into(),
            });
        }
        if self.preview_max_long_edge == 0 {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "preview_max_long_edge",
                reason: "must be greater than zero".into(),
            });
        }
        if self.max_attempts == 0 {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "max_attempts",
                reason: "must be greater than zero".into(),
            });
        }
        if self.attempts > self.max_attempts {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "attempts",
                reason: format!(
                    "attempts ({}) exceeds max_attempts ({})",
                    self.attempts, self.max_attempts
                ),
            });
        }
        // Only completed jobs may have a result.
        if self.status == JobStatus::Completed && self.result.is_none() {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "result",
                reason: "completed job must have a result".into(),
            });
        }
        if self.status != JobStatus::Completed && self.result.is_some() {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "result",
                reason: "non-completed job must not have a result".into(),
            });
        }
        // Failed jobs must have an error.
        if self.status == JobStatus::Failed && self.last_error.is_none() {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "last_error",
                reason: "failed job must have an error".into(),
            });
        }
        // Validate timestamps are parseable as RFC 3339.
        if chrono::DateTime::parse_from_rfc3339(&self.created_at).is_err() {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "created_at",
                reason: "must be a valid UTC RFC 3339 timestamp".into(),
            });
        }
        if chrono::DateTime::parse_from_rfc3339(&self.updated_at).is_err() {
            return Err(crate::error::PluginError::InvalidRequest {
                field: "updated_at",
                reason: "must be a valid UTC RFC 3339 timestamp".into(),
            });
        }
        Ok(())
    }
}

// ── Requests ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueJobRequest {
    pub merchant_id: String,
    pub source_path: PathBuf,
    pub original_filename: String,
    pub source_mime_type: Option<String>,
    pub processing_kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
    pub max_long_edge: u32,
    pub preview_max_long_edge: u32,
    pub max_attempts: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentLookup {
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
}

// ── Results ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JobResult {
    pub asset_id: String,
    pub cache_path: PathBuf,
    pub preview_path: Option<PathBuf>,
    pub content_hash: String,
    pub content_type: String,
    pub byte_size: u64,
    pub width: u32,
    pub height: u32,
    pub original_filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedJob {
    pub id: String,
    pub merchant_id: String,
    pub processing_kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
    pub result: JobResult,
    pub attempts: u32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedJob {
    pub id: String,
    pub merchant_id: String,
    pub processing_kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
    pub source_path: PathBuf,
    pub attempts: u32,
    pub max_attempts: u32,
    pub last_error: String,
    pub updated_at: String,
}

// ── Responses ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueJobResponse {
    pub job_id: String,
    pub preview_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessJobsResponse {
    pub attempted: u32,
    pub completed: u32,
    pub retry_scheduled: u32,
    pub terminal_failed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPathResponse {
    pub preview_path: PathBuf,
    pub preview_mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedPathResponse {
    pub local_path: PathBuf,
    pub content_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidGeneratePreviewRequest {
    pub source_path: PathBuf,
    pub preview_output_dir: PathBuf,
    pub original_filename: String,
    pub preview_max_long_edge: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidGeneratePreviewResponse {
    pub preview_path: Option<PathBuf>,
    pub preview_mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidCompressImageRequest {
    pub source_path: PathBuf,
    pub output_dir: PathBuf,
    pub preview_output_dir: Option<PathBuf>,
    pub original_filename: String,
    pub api_level: Option<u32>,
    pub max_long_edge: u32,
    pub preview_max_long_edge: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidCompressImageResponse {
    pub asset_path: PathBuf,
    pub preview_path: Option<PathBuf>,
    pub content_hash: String,
    pub content_type: String,
    pub width: u32,
    pub height: u32,
    pub byte_size: u64,
    pub original_filename: String,
}
// ── Picker DTOs ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickImageCompressionOptions {
    pub max_long_edge: u32,
    pub preview_max_long_edge: u32,
    pub quality: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickImageRequest {
    pub picker_mode: String,
    pub compression: PickImageCompressionOptions,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PickImageStatus {
    Pending,
    Processing,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PickImageResponse {
    pub job_id: String,
    pub preview_path: PathBuf,
    pub preview_mime_type: String,
    pub status: PickImageStatus,
}

// ── Event payloads ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobCompletedPayload {
    pub job_id: String,
    pub asset_path: PathBuf,
    pub content_hash: String,
    pub content_type: String,
    pub byte_size: u64,
    pub width: u32,
    pub height: u32,
    pub original_filename: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobFailedPayload {
    pub job_id: String,
    pub error: String,
    pub attempts: u32,
    pub max_attempts: u32,
    pub terminal: bool,
}