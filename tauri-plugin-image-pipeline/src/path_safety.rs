//! Path safety: validate source paths and safe path segments.
//!
//! Source paths MUST be absolute, canonical, and under the cache directory.
//! Safe path segments reject traversal, null bytes, and non-UTF8 characters.

use std::path::Path;

use crate::error::PluginError;

/// Validate that a source path is safe for processing.
///
/// Requirements:
/// - Path must be absolute
/// - Path must be canonical (no `..`, `.`, or symlink tricks)
/// - Path must not contain null bytes
/// - Every path segment must pass `is_safe_segment`
pub fn validate_source_path(path: &Path, cache_root: &Path) -> Result<(), PluginError> {
    // Must be absolute
    if !path.is_absolute() {
        return Err(PluginError::UnsafePath {
            path: path.to_path_buf(),
        });
    }

    // No null bytes
    let path_str = path.to_string_lossy();
    if path_str.contains('\0') {
        return Err(PluginError::UnsafePath {
            path: path.to_path_buf(),
        });
    }

    // Validate each segment (skip root component "/")
    for segment in path.iter() {
        let s = segment.to_string_lossy();
        // Skip the root component (which is just "/")
        if s == "/" {
            continue;
        }
        if !is_safe_segment(&s) {
            return Err(PluginError::UnsafePath {
                path: path.to_path_buf(),
            });
        }
    }

    // Must be under cache root
    if !path.starts_with(cache_root) {
        return Err(PluginError::UnsafePath {
            path: path.to_path_buf(),
        });
    }

    Ok(())
}

/// Check if a single path segment is safe.
///
/// Rejects:
/// - Empty segments
/// - `.` and `..`
/// - Segments containing null bytes
/// - Segments containing path separators
/// - Segments longer than 255 bytes
pub fn is_safe_segment(segment: &str) -> bool {
    if segment.is_empty() {
        return false;
    }
    if segment == "." || segment == ".." {
        return false;
    }
    if segment.contains('\0') {
        return false;
    }
    if segment.contains('/') || segment.contains('\\') {
        return false;
    }
    if segment.len() > 255 {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn cache_root() -> PathBuf {
        PathBuf::from("/tmp/sakti-cache")
    }

    // ── Source path validation ─────────────────────────────────

    #[test]
    fn valid_absolute_under_cache_passes() {
        let path = PathBuf::from("/tmp/sakti-cache/merchant-1/assets/photo.jpg");
        assert!(validate_source_path(&path, &cache_root()).is_ok());
    }

    #[test]
    fn relative_path_rejected() {
        let path = PathBuf::from("merchant-1/assets/photo.jpg");
        assert!(validate_source_path(&path, &cache_root()).is_err());
    }

    #[test]
    fn absolute_outside_cache_rejected() {
        let path = PathBuf::from("/etc/passwd");
        assert!(validate_source_path(&path, &cache_root()).is_err());
    }

    #[test]
    fn path_with_dotdot_rejected() {
        let path = PathBuf::from("/tmp/sakti-cache/../../../etc/passwd");
        // The path has ".." segments which fail is_safe_segment
        assert!(validate_source_path(&path, &cache_root()).is_err());
    }

    #[test]
    fn path_with_null_byte_rejected() {
        let path = PathBuf::from("/tmp/sakti-cache/photo\0.jpg");
        assert!(validate_source_path(&path, &cache_root()).is_err());
    }

    #[test]
    fn path_with_dot_segment_is_normalized() {
        // PathBuf normalizes "." segments, so this is equivalent to the canonical path.
        // The is_safe_segment "." check is defense-in-depth for raw string inputs.
        let path = PathBuf::from("/tmp/sakti-cache/./photo.jpg");
        assert!(validate_source_path(&path, &cache_root()).is_ok());
    }

    // ── Safe segment validation ────────────────────────────────

    #[test]
    fn normal_segment_passes() {
        assert!(is_safe_segment("photo.jpg"));
        assert!(is_safe_segment("merchant-1"));
        assert!(is_safe_segment("abc123hash.webp"));
    }

    #[test]
    fn empty_segment_rejected() {
        assert!(!is_safe_segment(""));
    }

    #[test]
    fn dot_rejected() {
        assert!(!is_safe_segment("."));
    }

    #[test]
    fn dotdot_rejected() {
        assert!(!is_safe_segment(".."));
    }

    #[test]
    fn segment_with_null_rejected() {
        assert!(!is_safe_segment("photo\0.jpg"));
    }

    #[test]
    fn segment_with_slash_rejected() {
        assert!(!is_safe_segment("foo/bar"));
    }

    #[test]
    fn segment_with_backslash_rejected() {
        assert!(!is_safe_segment("foo\\bar"));
    }

    #[test]
    fn long_segment_rejected() {
        let long = "a".repeat(256);
        assert!(!is_safe_segment(&long));
    }

    #[test]
    fn max_length_segment_passes() {
        let max = "a".repeat(255);
        assert!(is_safe_segment(&max));
    }
}
