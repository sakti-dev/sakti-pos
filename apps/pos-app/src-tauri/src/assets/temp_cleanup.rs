use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_image_pipeline::ImagePipelineExt;
use tokio::fs;

async fn load_active_product_photo_temp_paths(app: &AppHandle) -> Result<HashSet<PathBuf>, String> {
    let jobs = app
        .image_pipeline()
        .snapshot_jobs()
        .await
        .map_err(|error| error.to_string())?;

    let mut paths = HashSet::new();
    for job in jobs {
        paths.insert(job.source_path);
        if let Some(preview_path) = job.preview_path {
            paths.insert(preview_path);
        }
    }

    Ok(paths)
}

pub(crate) async fn cleanup_orphaned_product_photo_inputs(
    app: &AppHandle,
    pool: &sqlx::SqlitePool,
) -> Result<usize, String> {
    let _ = pool;
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Could not resolve app cache directory".to_string())?;
    let referenced_paths = load_active_product_photo_temp_paths(app).await?;
    cleanup_orphaned_product_photo_inputs_inner(&cache_root, &referenced_paths).await
}

pub(super) async fn cleanup_orphaned_product_photo_inputs_inner(
    cache_root: &Path,
    referenced_paths: &HashSet<PathBuf>,
) -> Result<usize, String> {
    let temp_root = cache_root.join("product_photo_inputs");
    if !fs::try_exists(&temp_root)
        .await
        .map_err(|error| format!("Failed to inspect product photo temp directory: {}", error))?
    {
        return Ok(0);
    }

    let mut entries = fs::read_dir(&temp_root)
        .await
        .map_err(|error| format!("Failed to read product photo temp directory: {}", error))?;

    let mut deleted_count = 0usize;
    while let Some(entry) = entries.next_entry().await.map_err(|error| {
        format!(
            "Failed to enumerate product photo temp directory: {}",
            error
        )
    })? {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .await
            .map_err(|error| format!("Failed to inspect product photo temp entry: {}", error))?;
        if !file_type.is_file() || referenced_paths.contains(&path) {
            continue;
        }

        match fs::remove_file(&path).await {
            Ok(()) => {
                deleted_count += 1;
                log::info!(
                    "[RUST] [PHOTO:TRACE] temp_photo_cleanup:deleted path={}",
                    path.to_string_lossy()
                );
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                log::info!(
                    "[RUST] [PHOTO:TRACE] temp_photo_cleanup:failed path={} error={}",
                    path.to_string_lossy(),
                    error
                );
            }
        }
    }

    log::info!(
        "[RUST] [PHOTO:TRACE] temp_photo_cleanup:done deleted_count={}",
        deleted_count
    );

    Ok(deleted_count)
}
