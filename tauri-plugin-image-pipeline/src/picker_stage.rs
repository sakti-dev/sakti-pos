use std::path::{Path, PathBuf};

use tauri::Runtime;
use tauri_plugin_dialog::FilePath;

use crate::{error::PluginError, path_safety::is_safe_segment};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PickerSelection {
    LocalPath(PathBuf),
    ContentUri(String),
}

impl PickerSelection {
    pub fn from_picker_path_string(raw: &str) -> Result<Self, PluginError> {
        if raw.starts_with("content://") {
            return Ok(Self::ContentUri(raw.to_string()));
        }

        if let Some(path) = raw.strip_prefix("file://") {
            return Ok(Self::LocalPath(PathBuf::from(path)));
        }

        Ok(Self::LocalPath(PathBuf::from(raw)))
    }

    pub fn from_file_path(file_path: FilePath) -> Result<Self, PluginError> {
        match file_path {
            FilePath::Path(path) => Ok(Self::LocalPath(path)),
            FilePath::Url(url) if url.scheme() == "content" => {
                Ok(Self::ContentUri(url.to_string()))
            }
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

    pub fn is_content_uri(&self) -> bool {
        matches!(self, Self::ContentUri(_))
    }

    pub fn local_path(&self) -> Option<&Path> {
        match self {
            Self::LocalPath(path) => Some(path.as_path()),
            Self::ContentUri(_) => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StagedPickerSource {
    pub path: PathBuf,
    pub original_filename: String,
}

fn staged_source_path(cache_root: &Path, job_id: &str) -> Result<PathBuf, PluginError> {
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
    #[cfg(target_os = "android")] mobile_handle: tauri::plugin::PluginHandle<R>,
    cache_root: &Path,
    job_id: &str,
    selection: PickerSelection,
) -> Result<StagedPickerSource, PluginError> {
    let staged_path = staged_source_path(cache_root, job_id)?;
    let original_filename = match &selection {
        PickerSelection::LocalPath(path) => path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "picked_image".into()),
        PickerSelection::ContentUri(uri) => {
            #[cfg(target_os = "android")]
            {
                stage_content_uri(mobile_handle, &staged_path, uri).await?
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = staged_path;
                let _ = uri;
                return Err(PluginError::InvalidRequest {
                    field: "picker_path",
                    reason: "content:// picker selections are only supported on Android".into(),
                });
            }
        }
    };

    if let PickerSelection::LocalPath(source_path) = selection {
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
    }

    Ok(StagedPickerSource {
        path: staged_path,
        original_filename,
    })
}

#[cfg(target_os = "android")]
async fn stage_content_uri(
    mobile_handle: tauri::plugin::PluginHandle<impl Runtime>,
    staged_path: &Path,
    uri: &str,
) -> Result<String, PluginError> {
    let request = crate::dto::AndroidStagePickerSourceRequest {
        source_path: uri.to_string(),
        output_path: staged_path.to_string_lossy().to_string(),
        original_filename: uri
            .rsplit('/')
            .next()
            .filter(|segment| !segment.is_empty())
            .unwrap_or("picked_image")
            .to_string(),
    };

    let response: crate::dto::AndroidStagePickerSourceResponse = mobile_handle
        .run_mobile_plugin("stagePickerSource", request)
        .map_err(|error| PluginError::Processing {
            job_id: None,
            stage: "stage-picker-source",
            reason: error.to_string(),
        })?;

    let _staged_path = PathBuf::from(response.staged_path);

    Ok(response.original_filename)
}

impl PickerSelection {}
