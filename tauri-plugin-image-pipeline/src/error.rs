use std::path::PathBuf;

/// Structured errors for the image pipeline plugin.
///
/// Internal code uses these variants directly. Tauri command handlers
/// convert them to descriptive strings at the plugin boundary — never
/// raw `String` errors in plugin internals.
#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("IO error during {operation} on {path}: {source}")]
    Io {
        operation: &'static str,
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Invalid request: {field} — {reason}")]
    InvalidRequest {
        field: &'static str,
        reason: String,
    },

    #[error("Unsafe path: {path}")]
    UnsafePath { path: PathBuf },

    #[error("Queue corrupt: primary={primary}, backup={backup}")]
    QueueCorrupt { primary: PathBuf, backup: PathBuf },

    #[error("Unsupported queue version: found {found}, supported {supported}")]
    UnsupportedQueueVersion { found: u32, supported: u32 },

    #[error("Invalid transition for job {job_id}: {from:?} cannot {action}")]
    InvalidTransition {
        job_id: String,
        from: crate::dto::JobStatus,
        action: &'static str,
    },

    #[error("Job not found: {job_id}")]
    JobNotFound { job_id: String },

    #[error("Processing error for job {job_id:?} at {stage}: {reason}")]
    Processing {
        job_id: Option<String>,
        stage: &'static str,
        reason: String,
    },

    #[error("Event error for {name}: {reason}")]
    Event { name: &'static str, reason: String },

    #[error("Image picker was cancelled by the user")]
    PickerCancelled,
}
