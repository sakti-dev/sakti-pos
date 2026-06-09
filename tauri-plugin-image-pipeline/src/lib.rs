use std::sync::Arc;
use std::path::PathBuf;
use tauri::{Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.sakti_dev.sakti_pos.imagepipeline";

mod commands;
pub mod dto;
pub mod error;
pub mod job_queue;
pub mod queue_state;
pub mod path_safety;
#[cfg(not(target_os = "android"))]
pub mod processor;
pub mod cache;
#[cfg(not(target_os = "android"))]
pub mod pipeline;

/// Plugin state container.
pub(crate) struct PluginState<R: Runtime> {
    pub(crate) app: tauri::AppHandle<R>,
    #[cfg(target_os = "android")]
    pub(crate) mobile_plugin_handle: tauri::plugin::PluginHandle<R>,
}

/// Public plugin handle — Sakti POS accesses all operations through this.
pub struct ImagePipeline<R: Runtime> {
    pub(crate) inner: Arc<PluginState<R>>,
}

impl<R: Runtime> ImagePipeline<R> {
    pub fn app_handle(&self) -> &tauri::AppHandle<R> {
        &self.inner.app
    }

    #[cfg(target_os = "android")]
    fn mobile_handle(&self) -> &tauri::plugin::PluginHandle<R> {
        &self.inner.mobile_plugin_handle
    }

    fn cache_root(&self) -> Result<PathBuf, error::PluginError> {
        self.inner
            .app
            .path()
            .app_cache_dir()
            .map_err(|source| error::PluginError::InvalidRequest {
                field: "app_cache_dir",
                reason: source.to_string(),
            })
    }

    fn queue(&self) -> Result<queue_state::JobQueue, error::PluginError> {
        Ok(queue_state::JobQueue::production(
            self.cache_root()?.join("sakti-image"),
        ))
    }

    pub async fn enqueue_job(
        &self,
        request: dto::EnqueueJobRequest,
    ) -> Result<dto::EnqueueJobResponse, error::PluginError> {
        #[cfg(target_os = "android")]
        {
            return self.enqueue_job_android(request).await;
        }

        #[cfg(not(target_os = "android"))]
        {
            let queue = self.queue()?;
            let cache_root = self.cache_root()?;
            return pipeline::enqueue_job(&queue, &cache_root, request).await;
        }
    }

    #[cfg(target_os = "android")]
    async fn enqueue_job_android(
        &self,
        request: dto::EnqueueJobRequest,
    ) -> Result<dto::EnqueueJobResponse, error::PluginError> {
        let queue = self.queue()?;
        let cache_root = self.cache_root()?;
        let preview_path = if request.preview_max_long_edge > 0 {
            let preview_response: dto::AndroidGeneratePreviewResponse = self
                .mobile_handle()
                .run_mobile_plugin(
                    "generatePreview",
                    dto::AndroidGeneratePreviewRequest {
                        source_path: request.source_path.clone(),
                        preview_output_dir: cache_root.join("sakti-image").join(&request.merchant_id).join("previews"),
                        original_filename: request.original_filename.clone(),
                        preview_max_long_edge: request.preview_max_long_edge,
                    },
                )
                .map_err(|error| error.to_string())
                .map_err(|reason| error::PluginError::Processing {
                    job_id: None,
                    stage: "generate-preview",
                    reason,
                })?;
            preview_response.preview_path
        } else {
            None
        };

        let (job_id, preview_path) = queue.enqueue(request, preview_path).await?;
        Ok(dto::EnqueueJobResponse { job_id, preview_path })
    }

    pub async fn process_pending_jobs(
        &self,
        limit: u32,
    ) -> Result<dto::ProcessJobsResponse, error::PluginError> {
        #[cfg(target_os = "android")]
        {
            return self.process_pending_jobs_android(limit).await;
        }

        #[cfg(not(target_os = "android"))]
        {
            let queue = self.queue()?;
            let cache_root = self.cache_root()?;
            return pipeline::process_pending_jobs(&queue, &cache_root, limit).await;
        }
    }

    #[cfg(target_os = "android")]
    async fn process_pending_jobs_android(
        &self,
        limit: u32,
    ) -> Result<dto::ProcessJobsResponse, error::PluginError> {
        let queue = self.queue()?;
        let cache_root = self.cache_root()?;

        if limit == 0 {
            return Err(error::PluginError::InvalidRequest {
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

            let response = self
                .mobile_handle()
                .run_mobile_plugin(
                    "compressImage",
                    dto::AndroidCompressImageRequest {
                        source_path: job.source_path.clone(),
                        output_dir: cache_root.join("sakti-image").join(&job.merchant_id).join("assets"),
                        preview_output_dir: Some(
                            cache_root.join("sakti-image").join(&job.merchant_id).join("previews"),
                        ),
                        original_filename: job.original_filename.clone(),
                        api_level: None,
                        max_long_edge: job.max_long_edge,
                        preview_max_long_edge: job.preview_max_long_edge,
                    },
                );

            match response {
                Ok(android_result) => {
                    let android_result: dto::AndroidCompressImageResponse = android_result;
                    let result = dto::JobResult {
                        asset_id: android_result.content_hash.clone(),
                        cache_path: android_result.asset_path.clone(),
                        preview_path: android_result.preview_path.clone(),
                        content_hash: android_result.content_hash,
                        content_type: android_result.content_type,
                        byte_size: android_result.byte_size,
                        width: android_result.width,
                        height: android_result.height,
                        original_filename: android_result.original_filename,
                    };
                    match queue.complete(&job.id, result).await {
                        Ok(()) => completed += 1,
                        Err(_) => terminal_failed += 1,
                    }
                }
                Err(error) => {
                    let error = error.to_string();
                    if job.attempts < job.max_attempts {
                        match queue.fail_retryable(&job.id, error).await {
                            Ok(()) => retry_scheduled += 1,
                            Err(_) => terminal_failed += 1,
                        }
                    } else {
                        match queue.fail_terminal(&job.id, error).await {
                            Ok(()) => terminal_failed += 1,
                            Err(_) => terminal_failed += 1,
                        }
                    }
                }
            }
        }

        Ok(dto::ProcessJobsResponse {
            attempted,
            completed,
            retry_scheduled,
            terminal_failed,
        })
    }

    pub async fn get_completed_jobs(&self) -> Result<Vec<dto::CompletedJob>, error::PluginError> {
        self.queue()?.get_completed().await
    }

    pub async fn consume_completed_job(
        &self,
        job_id: &str,
    ) -> Result<dto::JobResult, error::PluginError> {
        self.queue()?.consume(job_id).await
    }

    pub async fn reset_stuck_jobs(&self) -> Result<u32, error::PluginError> {
        self.queue()?.reset_stuck().await
    }

    pub async fn retry_failed_job(&self, job_id: &str) -> Result<(), error::PluginError> {
        self.queue()?.retry_failed(job_id).await
    }

    pub async fn get_failed_jobs(&self) -> Result<Vec<dto::FailedJob>, error::PluginError> {
        self.queue()?.get_failed().await
    }

    pub async fn snapshot_jobs(&self) -> Result<Vec<dto::JobRecord>, error::PluginError> {
        self.queue()?.snapshot().await
    }

    pub async fn get_pending_preview(
        &self,
        target: dto::AttachmentLookup,
    ) -> Result<Option<dto::PreviewPathResponse>, error::PluginError> {
        self.queue()?.get_pending_preview(&target).await
    }

    pub async fn get_cached_asset_path(
        &self,
        merchant_id: &str,
        asset_id: &str,
        content_type: &str,
    ) -> Result<Option<dto::CachedPathResponse>, error::PluginError> {
        #[cfg(target_os = "android")]
        {
            let cache_root = self.cache_root()?;
            let path = cache::asset_cache_path(&cache_root, merchant_id, asset_id, content_type)?;
            return if tokio::fs::metadata(&path).await.is_ok() {
                Ok(Some(dto::CachedPathResponse {
                    local_path: path,
                    content_type: content_type.into(),
                }))
            } else {
                Ok(None)
            };
        }

        #[cfg(not(target_os = "android"))]
        {
        let cache_root = self.cache_root()?;
            return pipeline::get_cached_asset_path(&cache_root, merchant_id, asset_id, content_type).await;
        }
    }

    pub async fn cleanup_orphaned_temp_files(&self) -> Result<u32, error::PluginError> {
        let cache_root = self.cache_root()?;
        cache::cleanup_orphaned_temp_files(&cache_root).await
    }
}

/// Tauri extension trait for accessing the plugin handle.
pub trait ImagePipelineExt<R: Runtime> {
    fn image_pipeline(&self) -> &ImagePipeline<R>;
}

impl<R: Runtime, T: Manager<R>> ImagePipelineExt<R> for T {
    fn image_pipeline(&self) -> &ImagePipeline<R> {
        self.state::<ImagePipeline<R>>().inner()
    }
}

/// Plugin initializer — call on the Tauri builder before `.setup()`.
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("image-pipeline")
        .invoke_handler(tauri::generate_handler![
            commands::enqueue_job,
            commands::process_pending_jobs,
            commands::get_completed_jobs,
            commands::consume_completed_job,
            commands::reset_stuck_jobs,
            commands::retry_failed_job,
            commands::get_failed_jobs,
            commands::get_pending_preview,
            commands::get_cached_asset_path,
            commands::cleanup_orphaned_temp_files,
        ])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let mobile_plugin_handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ImagePipelinePlugin")?;
                let state = Arc::new(PluginState {
                    app: app.clone(),
                    mobile_plugin_handle,
                });
                app.manage(ImagePipeline { inner: state });
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                let state = Arc::new(PluginState {
                    app: app.clone(),
                });
                app.manage(ImagePipeline { inner: state });
            }
            Ok(())
        })
        .build()
}
