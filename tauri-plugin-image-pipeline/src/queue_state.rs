//! Queue state machine: enqueue, claim, complete, consume, retry, reset.
//!
//! All mutations go through a `tokio::sync::Mutex` to serialize concurrent access.
//! The mutex protects only queue load/transition/save — it MUST NOT be held
//! during image processing, caching, or file I/O beyond the queue file itself.

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::dto::*;
use crate::error::PluginError;
use crate::job_queue::{self, FsAdapter, ProductionFs};

/// In-process queue with mutex-protected mutations.
pub struct JobQueue {
    dir: PathBuf,
    fs: Arc<dyn FsAdapter>,
    lock: Mutex<()>,
}

impl JobQueue {
    pub fn new(dir: PathBuf, fs: Arc<dyn FsAdapter>) -> Self {
        Self {
            dir,
            fs,
            lock: Mutex::new(()),
        }
    }

    /// Production queue using real filesystem.
    pub fn production(dir: PathBuf) -> Self {
        Self::new(dir, Arc::new(ProductionFs))
    }

    /// Enqueue a new job. Returns the job ID and preview path.
    pub async fn enqueue(
        &self,
        request: EnqueueJobRequest,
        preview_path: Option<PathBuf>,
    ) -> Result<(String, Option<PathBuf>), PluginError> {
        let _guard = self.lock.lock().await;
        let now = chrono::Utc::now().to_rfc3339();
        let job_id = uuid::Uuid::new_v4().to_string();

        let job = JobRecord {
            id: job_id.clone(),
            merchant_id: request.merchant_id,
            source_path: request.source_path,
            original_filename: request.original_filename,
            source_mime_type: request.source_mime_type,
            processing_kind: request.processing_kind,
            entity_type: request.entity_type,
            entity_id: request.entity_id,
            attachment_field: request.attachment_field,
            max_long_edge: request.max_long_edge,
            preview_max_long_edge: request.preview_max_long_edge,
            status: JobStatus::Pending,
            attempts: 0,
            max_attempts: request.max_attempts.unwrap_or(3),
            last_error: None,
            result: None,
            preview_path: preview_path.clone(),
            created_at: now.clone(),
            updated_at: now,
        };

        job.validate()?;

        let mut doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;
        doc.jobs.push(job);
        job_queue::save_queue(&self.dir, &doc, self.fs.as_ref()).await?;

        Ok((job_id, preview_path))
    }

    /// Claim the next pending job (oldest first). Returns the claimed job.
    pub async fn claim_next(&self) -> Result<Option<JobRecord>, PluginError> {
        let _guard = self.lock.lock().await;
        let mut doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        // Find the oldest pending job
        let idx = doc
            .jobs
            .iter()
            .position(|j| j.status == JobStatus::Pending);

        let Some(idx) = idx else {
            return Ok(None);
        };

        let now = chrono::Utc::now().to_rfc3339();
        let job = &mut doc.jobs[idx];
        job.status = JobStatus::Processing;
        job.attempts += 1;
        job.updated_at = now;

        let claimed = job.clone();
        job_queue::save_queue(&self.dir, &doc, self.fs.as_ref()).await?;

        Ok(Some(claimed))
    }

    /// Complete a job with its result.
    pub async fn complete(&self, job_id: &str, result: JobResult) -> Result<(), PluginError> {
        let _guard = self.lock.lock().await;
        let mut doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        let job = doc
            .jobs
            .iter_mut()
            .find(|j| j.id == job_id)
            .ok_or_else(|| PluginError::JobNotFound {
                job_id: job_id.to_string(),
            })?;

        if job.status != JobStatus::Processing {
            return Err(PluginError::InvalidTransition {
                job_id: job_id.to_string(),
                from: job.status,
                action: "complete",
            });
        }

        let now = chrono::Utc::now().to_rfc3339();
        job.status = JobStatus::Completed;
        job.result = Some(result);
        job.updated_at = now;

        job_queue::save_queue(&self.dir, &doc, self.fs.as_ref()).await
    }

    /// Record a retryable failure (attempts remaining).
    pub async fn fail_retryable(
        &self,
        job_id: &str,
        error: String,
    ) -> Result<(), PluginError> {
        let _guard = self.lock.lock().await;
        let mut doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        let job = doc
            .jobs
            .iter_mut()
            .find(|j| j.id == job_id)
            .ok_or_else(|| PluginError::JobNotFound {
                job_id: job_id.to_string(),
            })?;

        if job.status != JobStatus::Processing {
            return Err(PluginError::InvalidTransition {
                job_id: job_id.to_string(),
                from: job.status,
                action: "fail_retryable",
            });
        }

        let now = chrono::Utc::now().to_rfc3339();
        job.status = JobStatus::Pending;
        job.last_error = Some(error);
        job.updated_at = now;

        job_queue::save_queue(&self.dir, &doc, self.fs.as_ref()).await
    }

    /// Record a terminal failure (no attempts remaining).
    pub async fn fail_terminal(
        &self,
        job_id: &str,
        error: String,
    ) -> Result<(), PluginError> {
        let _guard = self.lock.lock().await;
        let mut doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        let job = doc
            .jobs
            .iter_mut()
            .find(|j| j.id == job_id)
            .ok_or_else(|| PluginError::JobNotFound {
                job_id: job_id.to_string(),
            })?;

        if job.status != JobStatus::Processing {
            return Err(PluginError::InvalidTransition {
                job_id: job_id.to_string(),
                from: job.status,
                action: "fail_terminal",
            });
        }

        let now = chrono::Utc::now().to_rfc3339();
        job.status = JobStatus::Failed;
        job.last_error = Some(error);
        job.updated_at = now;

        job_queue::save_queue(&self.dir, &doc, self.fs.as_ref()).await
    }

    /// Get all completed jobs.
    pub async fn get_completed(&self) -> Result<Vec<CompletedJob>, PluginError> {
        let _guard = self.lock.lock().await;
        let doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        Ok(doc
            .jobs
            .into_iter()
            .filter(|j| j.status == JobStatus::Completed)
            .map(|j| CompletedJob {
                id: j.id,
                merchant_id: j.merchant_id,
                processing_kind: j.processing_kind,
                entity_type: j.entity_type,
                entity_id: j.entity_id,
                attachment_field: j.attachment_field,
                result: j.result.unwrap(),
                attempts: j.attempts,
                created_at: j.created_at,
                updated_at: j.updated_at,
            })
            .collect())
    }

    /// Get all jobs in the queue snapshot.
    pub async fn snapshot(&self) -> Result<Vec<JobRecord>, PluginError> {
        let _guard = self.lock.lock().await;
        let doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;
        Ok(doc.jobs)
    }

    /// Consume (remove) a completed job. Returns its result.
    pub async fn consume(&self, job_id: &str) -> Result<JobResult, PluginError> {
        let _guard = self.lock.lock().await;
        let mut doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        let idx = doc
            .jobs
            .iter()
            .position(|j| j.id == job_id)
            .ok_or_else(|| PluginError::JobNotFound {
                job_id: job_id.to_string(),
            })?;

        if doc.jobs[idx].status != JobStatus::Completed {
            return Err(PluginError::InvalidTransition {
                job_id: job_id.to_string(),
                from: doc.jobs[idx].status,
                action: "consume",
            });
        }

        let result = doc.jobs[idx].result.clone().unwrap();
        doc.jobs.remove(idx);
        job_queue::save_queue(&self.dir, &doc, self.fs.as_ref()).await?;

        Ok(result)
    }

    /// Reset stuck jobs: processing → pending. Returns count of reset jobs.
    pub async fn reset_stuck(&self) -> Result<u32, PluginError> {
        let _guard = self.lock.lock().await;
        let mut doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        let now = chrono::Utc::now().to_rfc3339();
        let mut count = 0u32;

        for job in &mut doc.jobs {
            if job.status == JobStatus::Processing {
                job.status = JobStatus::Pending;
                job.updated_at = now.clone();
                count += 1;
            }
        }

        if count > 0 {
            job_queue::save_queue(&self.dir, &doc, self.fs.as_ref()).await?;
        }

        Ok(count)
    }

    /// Explicitly retry a failed job. Resets attempts and error.
    /// Validates that the source file still exists.
    pub async fn retry_failed(&self, job_id: &str) -> Result<(), PluginError> {
        let _guard = self.lock.lock().await;
        let mut doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        let job = doc
            .jobs
            .iter_mut()
            .find(|j| j.id == job_id)
            .ok_or_else(|| PluginError::JobNotFound {
                job_id: job_id.to_string(),
            })?;

        if job.status != JobStatus::Failed {
            return Err(PluginError::InvalidTransition {
                job_id: job_id.to_string(),
                from: job.status,
                action: "retry_failed",
            });
        }

        // Validate source exists
        if !self.fs.exists(&job.source_path).await {
            return Err(PluginError::InvalidRequest {
                field: "source_path",
                reason: format!("source file no longer exists: {}", job.source_path.display()),
            });
        }

        let now = chrono::Utc::now().to_rfc3339();
        job.status = JobStatus::Pending;
        job.attempts = 0;
        job.last_error = None;
        job.updated_at = now;

        job_queue::save_queue(&self.dir, &doc, self.fs.as_ref()).await
    }

    /// Get all failed jobs with diagnostic info.
    pub async fn get_failed(&self) -> Result<Vec<FailedJob>, PluginError> {
        let _guard = self.lock.lock().await;
        let doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        Ok(doc
            .jobs
            .into_iter()
            .filter(|j| j.status == JobStatus::Failed)
            .map(|j| FailedJob {
                id: j.id,
                merchant_id: j.merchant_id,
                processing_kind: j.processing_kind,
                entity_type: j.entity_type,
                entity_id: j.entity_id,
                attachment_field: j.attachment_field,
                source_path: j.source_path,
                attempts: j.attempts,
                max_attempts: j.max_attempts,
                last_error: j.last_error.unwrap_or_default(),
                updated_at: j.updated_at,
            })
            .collect())
    }

    /// Find the newest active preview for a given attachment target.
    pub async fn get_pending_preview(
        &self,
        target: &AttachmentLookup,
    ) -> Result<Option<PreviewPathResponse>, PluginError> {
        let _guard = self.lock.lock().await;
        let doc = job_queue::load_queue(&self.dir, self.fs.as_ref()).await?;

        let mut matches: Vec<&JobRecord> = doc
            .jobs
            .iter()
            .filter(|job| {
                matches!(job.status, JobStatus::Pending | JobStatus::Processing)
                    && job.entity_type == target.entity_type
                    && job.entity_id == target.entity_id
                    && job.attachment_field == target.attachment_field
                    && job.preview_path.is_some()
            })
            .collect();

        matches.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then(b.created_at.cmp(&a.created_at)));

        for job in matches {
            let Some(preview_path) = job.preview_path.clone() else {
                continue;
            };

            if tokio::fs::metadata(&preview_path).await.is_ok() {
                return Ok(Some(PreviewPathResponse {
                    preview_path,
                    preview_mime_type: "image/jpeg".into(),
                }));
            }
        }

        Ok(None)
    }
}
