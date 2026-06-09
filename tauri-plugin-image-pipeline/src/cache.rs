//! Content-addressed cache: merchant-scoped asset storage.
//!
//! Layout:
//!   <root>/sakti-image/<merchant_id>/assets/<content_hash>.<ext>
//!   <root>/sakti-image/<merchant_id>/previews/<content_hash>.jpg

use std::path::{Path, PathBuf};

use crate::error::PluginError;
use crate::path_safety::is_safe_segment;

/// Map content_type to file extension.
pub fn content_type_to_ext(content_type: &str) -> Result<&'static str, PluginError> {
    match content_type {
        "image/webp" => Ok("webp"),
        "image/jpeg" => Ok("jpg"),
        "image/png" => Ok("png"),
        _ => Err(PluginError::InvalidRequest {
            field: "content_type",
            reason: format!("unsupported content type: {content_type}"),
        }),
    }
}

/// Map file extension to MIME type.
pub fn ext_to_content_type(ext: &str) -> &'static str {
    match ext {
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        _ => "application/octet-stream",
    }
}

/// Get the cache directory for a merchant's assets.
pub fn merchant_assets_dir(cache_root: &Path, merchant_id: &str) -> PathBuf {
    cache_root
        .join("sakti-image")
        .join(merchant_id)
        .join("assets")
}

/// Get the cache directory for a merchant's previews.
pub fn merchant_previews_dir(cache_root: &Path, merchant_id: &str) -> PathBuf {
    cache_root
        .join("sakti-image")
        .join(merchant_id)
        .join("previews")
}

/// Get the full path for a cached asset.
pub fn asset_cache_path(
    cache_root: &Path,
    merchant_id: &str,
    content_hash: &str,
    content_type: &str,
) -> Result<PathBuf, PluginError> {
    if !is_safe_segment(merchant_id) {
        return Err(PluginError::UnsafePath {
            path: PathBuf::from(merchant_id),
        });
    }
    if !is_safe_segment(content_hash) {
        return Err(PluginError::UnsafePath {
            path: PathBuf::from(content_hash),
        });
    }
    let ext = content_type_to_ext(content_type)?;
    Ok(merchant_assets_dir(cache_root, merchant_id).join(format!("{content_hash}.{ext}")))
}

/// Get the full path for a cached preview.
pub fn preview_cache_path(
    cache_root: &Path,
    merchant_id: &str,
    content_hash: &str,
) -> Result<PathBuf, PluginError> {
    if !is_safe_segment(merchant_id) {
        return Err(PluginError::UnsafePath {
            path: PathBuf::from(merchant_id),
        });
    }
    if !is_safe_segment(content_hash) {
        return Err(PluginError::UnsafePath {
            path: PathBuf::from(content_hash),
        });
    }
    Ok(merchant_previews_dir(cache_root, merchant_id).join(format!("{content_hash}.jpg")))
}

/// Atomically write bytes to a cache path.
///
/// Writes to a temp file first, then renames. The parent directory is created
/// if it doesn't exist.
pub async fn write_cached_file(path: &Path, data: &[u8]) -> Result<(), PluginError> {
    let parent = path.parent().ok_or_else(|| PluginError::Io {
        operation: "cache_parent",
        path: path.to_path_buf(),
        source: std::io::Error::new(std::io::ErrorKind::InvalidInput, "no parent directory"),
    })?;

    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|e| PluginError::Io {
            operation: "create_cache_dir",
            path: parent.to_path_buf(),
            source: e,
        })?;

    let tmp_path = path.with_extension("tmp");
    tokio::fs::write(&tmp_path, data)
        .await
        .map_err(|e| PluginError::Io {
            operation: "write_cache_tmp",
            path: tmp_path.clone(),
            source: e,
        })?;

    tokio::fs::rename(&tmp_path, path)
        .await
        .map_err(|e| PluginError::Io {
            operation: "rename_cache",
            path: path.to_path_buf(),
            source: e,
        })?;

    Ok(())
}

/// Write a preview to the cache.
pub async fn write_preview(
    cache_root: &Path,
    merchant_id: &str,
    content_hash: &str,
    preview_data: &[u8],
) -> Result<PathBuf, PluginError> {
    let path = preview_cache_path(cache_root, merchant_id, content_hash)?;
    write_cached_file(&path, preview_data).await?;
    Ok(path)
}

/// Look up a cached preview path.
pub async fn find_preview(
    cache_root: &Path,
    merchant_id: &str,
    content_hash: &str,
) -> Result<Option<PathBuf>, PluginError> {
    let path = preview_cache_path(cache_root, merchant_id, content_hash)?;
    if tokio::fs::metadata(&path).await.is_ok() {
        Ok(Some(path))
    } else {
        Ok(None)
    }
}

/// Find and remove orphaned temp files in the cache.
///
/// Temp files are `.tmp` files that are more than 1 hour old.
/// Returns the count of removed files.
pub async fn cleanup_orphaned_temp_files(cache_root: &Path) -> Result<u32, PluginError> {
    let sakti_dir = cache_root.join("sakti-image");
    if !tokio::fs::metadata(&sakti_dir).await.is_ok() {
        return Ok(0);
    }

    let mut count = 0u32;
    let now = std::time::SystemTime::now();
    let one_hour = std::time::Duration::from_secs(3600);

    let mut stack = vec![sakti_dir];
    while let Some(dir) = stack.pop() {
        let mut entries = match tokio::fs::read_dir(&dir).await {
            Ok(e) => e,
            Err(_) => continue,
        };

        while let Some(entry) = entries.next_entry().await.unwrap_or(None) {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            let name = path.file_name().unwrap_or_default().to_string_lossy();

            if name.ends_with(".tmp") {
                if let Ok(metadata) = entry.metadata().await {
                    if let Ok(modified) = metadata.modified() {
                        if now.duration_since(modified).unwrap_or_default() > one_hour {
                            if tokio::fs::remove_file(&path).await.is_ok() {
                                count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_type_mapping() {
        assert_eq!(content_type_to_ext("image/webp").unwrap(), "webp");
        assert_eq!(content_type_to_ext("image/jpeg").unwrap(), "jpg");
        assert_eq!(content_type_to_ext("image/png").unwrap(), "png");
        assert!(content_type_to_ext("image/gif").is_err());
    }

    #[test]
    fn ext_mapping() {
        assert_eq!(ext_to_content_type("webp"), "image/webp");
        assert_eq!(ext_to_content_type("jpg"), "image/jpeg");
        assert_eq!(ext_to_content_type("jpeg"), "image/jpeg");
        assert_eq!(ext_to_content_type("png"), "image/png");
        assert_eq!(ext_to_content_type("gif"), "application/octet-stream");
    }

    #[test]
    fn asset_path_structure() {
        let root = PathBuf::from("/cache");
        let path = asset_cache_path(&root, "merchant-1", "abc123", "image/webp").unwrap();
        assert_eq!(
            path,
            PathBuf::from("/cache/sakti-image/merchant-1/assets/abc123.webp")
        );
    }

    #[test]
    fn preview_path_structure() {
        let root = PathBuf::from("/cache");
        let path = preview_cache_path(&root, "merchant-1", "abc123").unwrap();
        assert_eq!(
            path,
            PathBuf::from("/cache/sakti-image/merchant-1/previews/abc123.jpg")
        );
    }

    #[test]
    fn unsafe_merchant_id_rejected() {
        let root = PathBuf::from("/cache");
        assert!(asset_path_with_bad_segment(&root, "../evil", "abc123").is_err());
        assert!(asset_path_with_bad_segment(&root, "merchant/1", "abc123").is_err());
    }

    fn asset_path_with_bad_segment(
        root: &Path,
        merchant_id: &str,
        content_hash: &str,
    ) -> Result<PathBuf, PluginError> {
        asset_cache_path(root, merchant_id, content_hash, "image/webp")
    }

    // ── Atomic cache writes ────────────────────────────────────

    #[tokio::test]
    async fn write_and_read_cached_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.webp");

        write_cached_file(&path, b"fake webp data").await.unwrap();
        let content = tokio::fs::read(&path).await.unwrap();
        assert_eq!(content, b"fake webp data");
    }

    #[tokio::test]
    async fn write_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir
            .path()
            .join("deep")
            .join("nested")
            .join("dir")
            .join("file.webp");

        write_cached_file(&path, b"data").await.unwrap();
        assert!(path.exists());
    }

    #[tokio::test]
    async fn write_preview_to_cache() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_preview(dir.path(), "merchant-1", "hash123", b"preview data")
            .await
            .unwrap();

        assert!(path.exists());
        let content = tokio::fs::read(&path).await.unwrap();
        assert_eq!(content, b"preview data");
    }

    // ── Preview lookup ─────────────────────────────────────────

    #[tokio::test]
    async fn find_existing_preview() {
        let dir = tempfile::tempdir().unwrap();
        write_preview(dir.path(), "merchant-1", "hash123", b"preview")
            .await
            .unwrap();

        let found = find_preview(dir.path(), "merchant-1", "hash123")
            .await
            .unwrap();
        assert!(found.is_some());
    }

    #[tokio::test]
    async fn find_missing_preview_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let found = find_preview(dir.path(), "merchant-1", "nohash")
            .await
            .unwrap();
        assert!(found.is_none());
    }

    // ── Orphan cleanup ─────────────────────────────────────────

    #[tokio::test]
    async fn cleanup_removes_old_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("sakti-image").join("m1").join("assets");
        tokio::fs::create_dir_all(&cache).await.unwrap();

        // Create an old temp file (set modified time to 2 hours ago)
        let tmp = cache.join("old.tmp");
        tokio::fs::write(&tmp, b"stale").await.unwrap();

        // Set modification time to 2 hours ago
        let two_hours_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(7200);
        filetime::set_file_mtime(&tmp, filetime::FileTime::from_system_time(two_hours_ago))
            .unwrap();

        let count = cleanup_orphaned_temp_files(dir.path()).await.unwrap();
        assert_eq!(count, 1);
        assert!(!tmp.exists());
    }

    #[tokio::test]
    async fn cleanup_keeps_recent_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("sakti-image").join("m1").join("assets");
        tokio::fs::create_dir_all(&cache).await.unwrap();

        let tmp = cache.join("recent.tmp");
        tokio::fs::write(&tmp, b"fresh").await.unwrap();

        let count = cleanup_orphaned_temp_files(dir.path()).await.unwrap();
        assert_eq!(count, 0);
        assert!(tmp.exists());
    }

    #[tokio::test]
    async fn cleanup_no_sakti_dir_returns_zero() {
        let dir = tempfile::tempdir().unwrap();
        let count = cleanup_orphaned_temp_files(dir.path()).await.unwrap();
        assert_eq!(count, 0);
    }
}
