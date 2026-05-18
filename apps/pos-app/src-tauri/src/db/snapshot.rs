use serde::Serialize;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use tauri::{command, AppHandle, Manager, State};
use tokio::fs;

use crate::app::state::AppState;

pub const DEV_SNAPSHOT_EXPORT_URL: &str = "sakti-pos-dev://snapshot-export";

#[derive(Debug, Serialize)]
pub struct DbSnapshotExportResult {
    pub snapshot_path: String,
}

#[command]
pub async fn export_db_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DbSnapshotExportResult, String> {
    export_db_snapshot_with_pool(&app, &state.db_pool).await
}

pub async fn export_db_snapshot_with_pool(
    app: &AppHandle,
    db_pool: &SqlitePool,
) -> Result<DbSnapshotExportResult, String> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|_| "Could not resolve app config directory".to_string())?;

    let snapshot_path = resolve_snapshot_target_path(None, &app_config_dir);
    export_snapshot_to_path(db_pool, &snapshot_path).await?;
    let snapshot_path = snapshot_path.display().to_string();
    crate::pos_log!(
        info,
        "DB",
        "SNAPSHOT_EXPORT_DONE",
        "Exported local DB snapshot",
        "snapshot_path" => snapshot_path
    );
    Ok(DbSnapshotExportResult { snapshot_path })
}

pub async fn handle_dev_snapshot_export_urls(
    app: &AppHandle,
    db_pool: &SqlitePool,
    urls: &[String],
) -> Result<bool, String> {
    if !urls.iter().any(|url| is_dev_snapshot_export_url(url)) {
        return Ok(false);
    }

    export_db_snapshot_with_pool(app, db_pool).await?;
    Ok(true)
}

pub fn resolve_snapshot_target_path(
    preferred_path: Option<&str>,
    app_config_dir: &Path,
) -> PathBuf {
    if let Some(preferred_path) = preferred_path {
        let trimmed = preferred_path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    app_config_dir.join("db-snapshots").join("latest.sqlite")
}

async fn export_snapshot_to_path(pool: &SqlitePool, snapshot_path: &Path) -> Result<(), String> {
    let parent = snapshot_path
        .parent()
        .ok_or_else(|| "Snapshot path is missing a parent directory".to_string())?;

    fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Failed to create snapshot directory: {}", error))?;

    if fs::try_exists(snapshot_path)
        .await
        .map_err(|error| format!("Failed to check snapshot path: {}", error))?
    {
        fs::remove_file(snapshot_path)
            .await
            .map_err(|error| format!("Failed to clear previous snapshot: {}", error))?;
    }

    crate::pos_log!(
        info,
        "DB",
        "SNAPSHOT_EXPORT_REQUESTED",
        "Exporting local DB snapshot",
        "snapshot_path" => snapshot_path.display().to_string()
    );

    let sql = format!(
        "VACUUM INTO '{}'",
        escape_sqlite_single_quotes(snapshot_path)
    );
    sqlx::query(&sql)
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to export DB snapshot: {}", error))?;

    Ok(())
}

fn escape_sqlite_single_quotes(path: &Path) -> String {
    path.display().to_string().replace('\'', "''")
}

pub fn is_dev_snapshot_export_url(url: &str) -> bool {
    url == DEV_SNAPSHOT_EXPORT_URL
}

#[cfg(test)]
mod tests {
    use super::{is_dev_snapshot_export_url, resolve_snapshot_target_path};
    use std::path::PathBuf;

    #[test]
    fn resolve_snapshot_target_path_prefers_override_path() {
        let app_config_dir = PathBuf::from("/data/user/0/com.sakti_dev.sakti_pos/files");
        let resolved = resolve_snapshot_target_path(
            Some("/workspace/sakti-pos/apps/pos-app/.db-snapshots/latest.sqlite"),
            &app_config_dir,
        );

        assert_eq!(
            resolved,
            PathBuf::from("/workspace/sakti-pos/apps/pos-app/.db-snapshots/latest.sqlite")
        );
    }

    #[test]
    fn resolve_snapshot_target_path_falls_back_to_app_config_dir() {
        let app_config_dir = PathBuf::from("/data/user/0/com.sakti_dev.sakti_pos/files");
        let resolved = resolve_snapshot_target_path(None, &app_config_dir);

        assert_eq!(
            resolved,
            PathBuf::from("/data/user/0/com.sakti_dev.sakti_pos/files/db-snapshots/latest.sqlite")
        );
    }

    #[test]
    fn dev_snapshot_export_url_matches_expected_scheme() {
        assert!(is_dev_snapshot_export_url(
            "sakti-pos-dev://snapshot-export"
        ));
        assert!(!is_dev_snapshot_export_url("sakti-pos://snapshot-export"));
        assert!(!is_dev_snapshot_export_url("https://example.com"));
        assert!(!is_dev_snapshot_export_url(
            "sakti-pos-dev://snapshot-export?source=adb"
        ));
    }
}
