//! Queue persistence: load, save, and recover jobs.json
//!
//! File layout:
//!   <dir>/jobs.json        — primary queue
//!   <dir>/jobs.json.tmp    — temp during save
//!   <dir>/jobs.json.bak    — backup of last valid primary
//!   <dir>/jobs.corrupt-<ts>.json — quarantined corrupt files

use std::path::{Path, PathBuf};

use crate::dto::{QueueDocument, QUEUE_VERSION};
use crate::error::PluginError;

const PRIMARY_FILE: &str = "jobs.json";
const TEMP_FILE: &str = "jobs.json.tmp";
const BACKUP_FILE: &str = "jobs.json.bak";
const CORRUPT_PREFIX: &str = "jobs.corrupt-";

// ── Filesystem adapter ───────────────────────────────────────────

/// Abstraction over filesystem operations so tests can inject failures.
#[async_trait::async_trait]
pub trait FsAdapter: Send + Sync {
    async fn create_dir_all(&self, path: &Path) -> Result<(), std::io::Error>;
    async fn read_to_string(&self, path: &Path) -> Result<String, std::io::Error>;
    async fn write_and_sync(&self, path: &Path, data: &[u8]) -> Result<(), std::io::Error>;
    async fn rename(&self, from: &Path, to: &Path) -> Result<(), std::io::Error>;
    async fn exists(&self, path: &Path) -> bool;
    async fn remove_file(&self, path: &Path) -> Result<(), std::io::Error>;
}

// ── Production filesystem ────────────────────────────────────────

/// Real filesystem adapter delegating to `tokio::fs`.
pub struct ProductionFs;

#[async_trait::async_trait]
impl FsAdapter for ProductionFs {
    async fn create_dir_all(&self, path: &Path) -> Result<(), std::io::Error> {
        tokio::fs::create_dir_all(path).await
    }

    async fn read_to_string(&self, path: &Path) -> Result<String, std::io::Error> {
        tokio::fs::read_to_string(path).await
    }

    async fn write_and_sync(&self, path: &Path, data: &[u8]) -> Result<(), std::io::Error> {
        let mut file = tokio::fs::File::create(path).await?;
        use tokio::io::AsyncWriteExt;
        file.write_all(data).await?;
        file.sync_all().await?;
        Ok(())
    }

    async fn rename(&self, from: &Path, to: &Path) -> Result<(), std::io::Error> {
        tokio::fs::rename(from, to).await
    }

    async fn exists(&self, path: &Path) -> bool {
        tokio::fs::metadata(path).await.is_ok()
    }

    async fn remove_file(&self, path: &Path) -> Result<(), std::io::Error> {
        tokio::fs::remove_file(path).await
    }
}

// ── Helper path constructors ─────────────────────────────────────

fn primary_path(dir: &Path) -> PathBuf {
    dir.join(PRIMARY_FILE)
}

fn temp_path(dir: &Path) -> PathBuf {
    dir.join(TEMP_FILE)
}

fn backup_path(dir: &Path) -> PathBuf {
    dir.join(BACKUP_FILE)
}

fn corrupt_path(dir: &Path) -> PathBuf {
    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    dir.join(format!("{CORRUPT_PREFIX}{ts}.json"))
}

// ── Core operations ──────────────────────────────────────────────

/// Parse a single JSON file and validate its contents.
///
/// Returns `Ok(Some(doc))` on success, `Ok(None)` if the file does not exist,
/// or an error for corrupt / unsupported data.
pub async fn try_load_and_validate(
    path: &Path,
    fs: &dyn FsAdapter,
) -> Result<Option<QueueDocument>, PluginError> {
    let raw = match fs.read_to_string(path).await {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => {
            return Err(PluginError::Io {
                operation: "read",
                path: path.to_path_buf(),
                source: e,
            })
        }
    };

    let doc: QueueDocument = serde_json::from_str(&raw).map_err(|e| PluginError::Io {
        operation: "parse",
        path: path.to_path_buf(),
        source: std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()),
    })?;

    if doc.version != QUEUE_VERSION {
        return Err(PluginError::UnsupportedQueueVersion {
            found: doc.version,
            supported: QUEUE_VERSION,
        });
    }

    // Validate every job in the document
    for job in &doc.jobs {
        job.validate().map_err(|e| {
            let msg = format!("job {} validation: {e}", job.id);
            PluginError::Io {
                operation: "validate",
                path: path.to_path_buf(),
                source: std::io::Error::new(std::io::ErrorKind::InvalidData, msg),
            }
        })?;
    }

    Ok(Some(doc))
}

/// Rename the current primary file to a `jobs.corrupt-<timestamp>.json`
/// quarantine file so it is preserved for later inspection.
pub async fn quarantine_primary(dir: &Path, fs: &dyn FsAdapter) -> Result<(), PluginError> {
    let primary = primary_path(dir);
    if fs.exists(&primary).await {
        let dest = corrupt_path(dir);
        fs.rename(&primary, &dest)
            .await
            .map_err(|e| PluginError::Io {
                operation: "quarantine",
                path: primary,
                source: e,
            })?;
    }
    Ok(())
}

/// Load the queue following the recovery algorithm:
///
/// 1. Try primary — on success return it.
/// 2. Primary missing → try backup → return it or empty doc.
/// 3. Primary corrupt → quarantine it, try backup.
/// 4. Both corrupt → return `QueueCorrupt`.
pub async fn load_queue(dir: &Path, fs: &dyn FsAdapter) -> Result<QueueDocument, PluginError> {
    let primary = primary_path(dir);
    let backup = backup_path(dir);

    // Step 1: Try primary
    match try_load_and_validate(&primary, fs).await {
        Ok(Some(doc)) => return Ok(doc),
        Ok(None) => {
            // Primary missing — try backup
            return match try_load_and_validate(&backup, fs).await {
                Ok(Some(doc)) => Ok(doc),
                Ok(None) => Ok(QueueDocument::default()),
                Err(_) => Ok(QueueDocument::default()),
            };
        }
        Err(e @ PluginError::UnsupportedQueueVersion { .. }) => {
            // Unsupported version is intentional — do NOT fall back to backup.
            // The queue was written by a newer version; using an old backup
            // would lose data. Return the error directly.
            return Err(e);
        }
        Err(_primary_err) => {
            // Step 3: Primary corrupt — quarantine and try backup
            let _ = quarantine_primary(dir, fs).await;

            match try_load_and_validate(&backup, fs).await {
                Ok(Some(doc)) => Ok(doc),
                Ok(None) => Ok(QueueDocument::default()),
                Err(_) => Err(PluginError::QueueCorrupt {
                    primary: primary.to_path_buf(),
                    backup: backup.to_path_buf(),
                }),
            }
        }
    }
}

/// Save the queue following the atomic-write algorithm:
///
/// 1. Serialize to JSON bytes.
/// 2. Ensure directory exists.
/// 3. Write to temp file + `sync_all`.
/// 4. If primary exists and is valid, rename primary → backup.
/// 5. Rename temp → primary.
///
/// If any step before (5) fails, the old primary is untouched.
pub async fn save_queue(
    dir: &Path,
    doc: &QueueDocument,
    fs: &dyn FsAdapter,
) -> Result<(), PluginError> {
    let primary = primary_path(dir);
    let tmp = temp_path(dir);
    let backup = backup_path(dir);

    // 1. Serialize
    let bytes = serde_json::to_vec_pretty(doc).map_err(|e| PluginError::Io {
        operation: "serialize",
        path: tmp.clone(),
        source: std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()),
    })?;

    // 2. Ensure directory
    fs.create_dir_all(dir).await.map_err(|e| PluginError::Io {
        operation: "create_dir",
        path: dir.to_path_buf(),
        source: e,
    })?;

    // Clean up any leftover temp file from a previous crashed save
    if fs.exists(&tmp).await {
        let _ = fs.remove_file(&tmp).await;
    }

    // 3. Write temp + sync
    fs.write_and_sync(&tmp, &bytes)
        .await
        .map_err(|e| PluginError::Io {
            operation: "write_tmp",
            path: tmp.clone(),
            source: e,
        })?;

    // 4. Backup existing primary ONLY if it's valid.
    //    Do NOT overwrite a valid backup with corrupt primary data.
    if fs.exists(&primary).await {
        if try_load_and_validate(&primary, fs).await.is_ok() {
            let _ = fs.rename(&primary, &backup).await;
        }
    }

    // 5. Atomically replace primary
    fs.rename(&tmp, &primary)
        .await
        .map_err(|e| PluginError::Io {
            operation: "replace_primary",
            path: primary,
            source: e,
        })?;

    Ok(())
}
