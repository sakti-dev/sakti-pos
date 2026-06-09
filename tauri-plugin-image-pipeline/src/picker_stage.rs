use std::path::{Path, PathBuf};

use tauri::Runtime;
use tauri_plugin_dialog::FilePath;

use crate::{error::PluginError, path_safety::is_safe_segment};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PickerSelection {
    LocalPath(PathBuf),
}

impl PickerSelection {
    pub fn from_picker_path_string(raw: &str) -> Result<Self, PluginError> {
        if let Some(path) = raw.strip_prefix("file://") {
            return Ok(Self::LocalPath(PathBuf::from(path)));
        }

        if raw.starts_with("content://") {
            return Err(PluginError::InvalidRequest {
                field: "picker_path",
                reason: "content:// picker selections must be staged before use".into(),
            });
        }

        Ok(Self::LocalPath(PathBuf::from(raw)))
    }

    pub fn from_file_path(file_path: FilePath) -> Result<Self, PluginError> {
        match file_path {
            FilePath::Path(path) => Ok(Self::LocalPath(path)),
            FilePath::Url(url) => {
                url.to_file_path()
                    .map(Self::LocalPath)
                    .map_err(|_| PluginError::InvalidRequest {
                        field: "picker_path",
                        reason: format!("unsupported picker uri: {url}"),
                    })
            }
        }
    }

    pub fn local_path(&self) -> Option<&Path> {
        match self {
            Self::LocalPath(path) => Some(path.as_path()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StagedPickerSource {
    pub path: PathBuf,
    pub original_filename: String,
}

pub fn staged_source_path(cache_root: &Path, job_id: &str) -> Result<PathBuf, PluginError> {
    if !is_safe_segment(job_id) {
        return Err(PluginError::UnsafePath {
            path: PathBuf::from(job_id),
        });
    }

    Ok(cache_root
        .join("sakti-image")
        .join("picked")
        .join(format!("{job_id}.source")))
}

pub async fn stage_picker_selection<R: Runtime>(
    _app: &tauri::AppHandle<R>,
    cache_root: &Path,
    job_id: &str,
    selection: PickerSelection,
) -> Result<StagedPickerSource, PluginError> {
    let staged_path = staged_source_path(cache_root, job_id)?;
    let source_path = match selection {
        PickerSelection::LocalPath(path) => path,
    };

    let original_filename = source_path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "picked_image".into());

    tokio::fs::create_dir_all(
        staged_path
            .parent()
            .ok_or_else(|| PluginError::UnsafePath {
                path: staged_path.clone(),
            })?,
    )
    .await
    .map_err(|source| PluginError::Io {
        operation: "create_picker_staging_dir",
        path: staged_path.clone(),
        source,
    })?;

    tokio::fs::copy(&source_path, &staged_path)
        .await
        .map_err(|source| PluginError::Io {
            operation: "copy_picker_source",
            path: staged_path.clone(),
            source,
        })?;

    Ok(StagedPickerSource {
        path: staged_path,
        original_filename,
    })
}
