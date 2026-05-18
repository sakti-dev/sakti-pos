use sqlx::SqlitePool;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tokio::fs;

async fn load_active_product_photo_temp_paths(
    pool: &SqlitePool,
) -> Result<HashSet<PathBuf>, String> {
    let rows = sqlx::query_scalar::<_, String>(
        r#"
        SELECT source_path AS path
        FROM pending_asset_processing_jobs
        WHERE status IN ('pending', 'processing', 'failed')
          AND source_path IS NOT NULL
        UNION
        SELECT preview_path AS path
        FROM pending_asset_processing_jobs
        WHERE status IN ('pending', 'processing', 'failed')
          AND preview_path IS NOT NULL
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to load active product photo temp paths: {}", error))?;

    Ok(rows.into_iter().map(PathBuf::from).collect())
}

pub(crate) async fn cleanup_orphaned_product_photo_inputs(
    app: &AppHandle,
    pool: &SqlitePool,
) -> Result<usize, String> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Could not resolve app cache directory".to_string())?;
    let referenced_paths = load_active_product_photo_temp_paths(pool).await?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::time_utils::current_job_id_string;

    #[test]
    fn load_active_product_photo_temp_paths_keeps_pending_and_failed_jobs() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("sqlite pool should connect");

            sqlx::query(
                r#"
                CREATE TABLE pending_asset_processing_jobs (
                    source_path TEXT,
                    preview_path TEXT,
                    status TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("pending jobs table should be created");

            let pending_source = "/tmp/product_photo_inputs/pending-source.jpg";
            let failed_preview = "/tmp/product_photo_inputs/failed-preview.jpg";
            sqlx::query(
                r#"
                INSERT INTO pending_asset_processing_jobs (
                    source_path,
                    preview_path,
                    status
                ) VALUES (?1, NULL, 'pending')
                "#,
            )
            .bind(pending_source)
            .execute(&pool)
            .await
            .expect("pending job should be inserted");

            sqlx::query(
                r#"
                INSERT INTO pending_asset_processing_jobs (
                    source_path,
                    preview_path,
                    status
                ) VALUES (NULL, ?1, 'failed')
                "#,
            )
            .bind(failed_preview)
            .execute(&pool)
            .await
            .expect("failed job should be inserted");

            let paths = load_active_product_photo_temp_paths(&pool)
                .await
                .expect("temp paths should load");

            assert!(paths.contains(&PathBuf::from(pending_source)));
            assert!(paths.contains(&PathBuf::from(failed_preview)));
        });
    }

    #[test]
    fn cleanup_orphaned_product_photo_inputs_removes_unreferenced_files() {
        tauri::async_runtime::block_on(async {
            let cache_root = std::env::temp_dir().join(format!(
                "sakti-pos-photo-cleanup-test-{}",
                current_job_id_string()
            ));
            let temp_root = cache_root.join("product_photo_inputs");
            std::fs::create_dir_all(&temp_root).expect("temp root should be created");

            let orphan_path = temp_root.join("orphan.jpg");
            let referenced_path = temp_root.join("referenced.jpg");
            let preview_path = temp_root.join("preview.jpg");
            std::fs::write(&orphan_path, b"orphan").expect("orphan should be written");
            std::fs::write(&referenced_path, b"referenced").expect("referenced should be written");
            std::fs::write(&preview_path, b"preview").expect("preview should be written");

            let mut referenced_paths = HashSet::new();
            referenced_paths.insert(referenced_path.clone());
            referenced_paths.insert(preview_path.clone());

            let deleted =
                cleanup_orphaned_product_photo_inputs_inner(&cache_root, &referenced_paths)
                    .await
                    .expect("cleanup should succeed");

            assert_eq!(deleted, 1);
            assert!(!orphan_path.exists());
            assert!(referenced_path.exists());
            assert!(preview_path.exists());

            std::fs::remove_file(referenced_path).expect("referenced file should be cleaned up");
            std::fs::remove_file(preview_path).expect("preview file should be cleaned up");
            std::fs::remove_dir_all(cache_root).expect("temp root should be cleaned up");
        });
    }
}
