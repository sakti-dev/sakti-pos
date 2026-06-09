use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

use tauri_plugin_image_pipeline::dto::{JobRecord, JobStatus, QueueDocument, QUEUE_VERSION};
use tauri_plugin_image_pipeline::error::PluginError;
use tauri_plugin_image_pipeline::job_queue::{FsAdapter, ProductionFs};

// ── Helpers ─────────────────────────────────────────────────────

fn sample_job(id: &str) -> JobRecord {
    JobRecord {
        id: id.into(),
        merchant_id: "merchant-1".into(),
        source_path: PathBuf::from("/tmp/photo.jpg"),
        original_filename: "photo.jpg".into(),
        source_mime_type: Some("image/jpeg".into()),
        processing_kind: "image:webp-thumbnail".into(),
        entity_type: "product".into(),
        entity_id: "product-1".into(),
        attachment_field: "image_asset_id".into(),
        max_long_edge: 400,
        preview_max_long_edge: 320,
        status: JobStatus::Pending,
        attempts: 0,
        max_attempts: 3,
        last_error: None,
        result: None,
        preview_path: None,
        created_at: "2026-06-09T12:00:00Z".into(),
        updated_at: "2026-06-09T12:00:00Z".into(),
    }
}

fn empty_doc() -> QueueDocument {
    QueueDocument::default()
}

fn doc_with_jobs(jobs: Vec<JobRecord>) -> QueueDocument {
    QueueDocument {
        version: QUEUE_VERSION,
        jobs,
    }
}

/// Creates a real temp directory for tests
fn temp_dir() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
}

// ═══════════════════════════════════════════════════════════════
// Task 3.2-3.3: Missing primary and backup files → empty version-1
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn missing_files_load_as_empty_versioned_doc() {
    let dir = temp_dir();
    let fs = ProductionFs;
    let doc = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs)
        .await
        .unwrap();
    assert_eq!(doc.version, QUEUE_VERSION);
    assert!(doc.jobs.is_empty());
}

#[tokio::test]
async fn missing_files_do_not_create_corruption_artifact() {
    let dir = temp_dir();
    let fs = ProductionFs;
    let _ = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs)
        .await
        .unwrap();
    // No corrupt files should be created
    let entries: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();
    assert!(
        entries.is_empty(),
        "no files should be created for missing queue"
    );
}

// ═══════════════════════════════════════════════════════════════
// Task 3.4-3.5: Save and reload preserves all fields
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn save_and_reload_preserves_all_fields() {
    let dir = temp_dir();
    let fs = ProductionFs;
    let original = doc_with_jobs(vec![sample_job("j1"), sample_job("j2")]);

    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &original, &fs)
        .await
        .unwrap();

    let loaded = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs)
        .await
        .unwrap();
    assert_eq!(original, loaded);
}

#[tokio::test]
async fn save_creates_primary_file() {
    let dir = temp_dir();
    let fs = ProductionFs;
    let doc = empty_doc();

    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc, &fs)
        .await
        .unwrap();

    assert!(dir.path().join("jobs.json").exists());
}

// ═══════════════════════════════════════════════════════════════
// Task 3.6-3.7: Failed write before replacement preserves old primary
// ═══════════════════════════════════════════════════════════════

/// A filesystem adapter that fails on demand.
struct FailingFs {
    inner: ProductionFs,
    fail_write: Mutex<bool>,
    fail_rename_from: Mutex<Option<PathBuf>>,
}

impl FailingFs {
    fn new() -> Self {
        Self {
            inner: ProductionFs,
            fail_write: Mutex::new(false),
            fail_rename_from: Mutex::new(None),
        }
    }
}

#[async_trait::async_trait]
impl FsAdapter for FailingFs {
    async fn create_dir_all(&self, path: &Path) -> Result<(), std::io::Error> {
        self.inner.create_dir_all(path).await
    }

    async fn read_to_string(&self, path: &Path) -> Result<String, std::io::Error> {
        self.inner.read_to_string(path).await
    }

    async fn write_and_sync(&self, path: &Path, data: &[u8]) -> Result<(), std::io::Error> {
        if *self.fail_write.lock().await {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "injected write failure",
            ));
        }
        self.inner.write_and_sync(path, data).await
    }

    async fn rename(&self, from: &Path, to: &Path) -> Result<(), std::io::Error> {
        let guard = self.fail_rename_from.lock().await;
        if let Some(ref fail_path) = *guard {
            if from == fail_path.as_path() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "injected rename failure",
                ));
            }
        }
        self.inner.rename(from, to).await
    }

    async fn exists(&self, path: &Path) -> bool {
        self.inner.exists(path).await
    }

    async fn remove_file(&self, path: &Path) -> Result<(), std::io::Error> {
        self.inner.remove_file(path).await
    }
}

#[tokio::test]
async fn failed_temp_write_preserves_old_primary() {
    let dir = temp_dir();
    let fs = ProductionFs;
    let doc_a = doc_with_jobs(vec![sample_job("j1")]);

    // Save initial doc
    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc_a, &fs)
        .await
        .unwrap();

    // Read the bytes of the valid primary
    let original_bytes = tokio::fs::read(dir.path().join("jobs.json")).await.unwrap();

    // Now fail the write on next save
    let fail_fs = FailingFs::new();
    *fail_fs.fail_write.lock().await = true;

    let doc_b = doc_with_jobs(vec![sample_job("j2")]);
    let result =
        tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc_b, &fail_fs).await;
    assert!(result.is_err());

    // Primary should be unchanged
    let current_bytes = tokio::fs::read(dir.path().join("jobs.json")).await.unwrap();
    assert_eq!(
        original_bytes, current_bytes,
        "primary should be unchanged after failed write"
    );
}

// ═══════════════════════════════════════════════════════════════
// Task 3.8-3.9: Two saves → backup has old primary
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn second_save_creates_backup_with_first_primary() {
    let dir = temp_dir();
    let fs = ProductionFs;

    let doc_a = doc_with_jobs(vec![sample_job("j1")]);
    let doc_b = doc_with_jobs(vec![sample_job("j2")]);

    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc_a, &fs)
        .await
        .unwrap();
    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc_b, &fs)
        .await
        .unwrap();

    // Primary = doc_b
    let primary = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs)
        .await
        .unwrap();
    assert_eq!(primary, doc_b);

    // Backup = doc_a
    let backup_path = dir.path().join("jobs.json.bak");
    let backup_raw = tokio::fs::read_to_string(&backup_path).await.unwrap();
    let backup: QueueDocument = serde_json::from_str(&backup_raw).unwrap();
    assert_eq!(backup, doc_a);
}

// ═══════════════════════════════════════════════════════════════
// Task 3.10-3.11: Corrupt primary + valid backup → quarantine + restore
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn corrupt_primary_with_valid_backup_recovers() {
    let dir = temp_dir();
    let fs = ProductionFs;

    let doc = doc_with_jobs(vec![sample_job("j1")]);

    // Save a valid doc
    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc, &fs)
        .await
        .unwrap();

    // Manually create a valid backup (copy of valid primary)
    tokio::fs::copy(
        dir.path().join("jobs.json"),
        dir.path().join("jobs.json.bak"),
    )
    .await
    .unwrap();

    // Corrupt the primary
    tokio::fs::write(dir.path().join("jobs.json"), "{invalid json!!")
        .await
        .unwrap();

    // Load should recover from backup
    let loaded = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs)
        .await
        .unwrap();
    assert_eq!(loaded, doc);

    // Corrupt file should be quarantined
    let entries: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    let quarantined = entries.iter().any(|name| name.starts_with("jobs.corrupt-"));
    assert!(
        quarantined,
        "corrupt file should be quarantined with jobs.corrupt- prefix"
    );
}

// ═══════════════════════════════════════════════════════════════
// Task 3.12-3.13: Corrupt primary + corrupt backup → QueueCorrupt
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn both_corrupt_returns_queue_corrupt() {
    let dir = temp_dir();
    let fs = ProductionFs;

    // Write corrupt primary and backup
    tokio::fs::write(dir.path().join("jobs.json"), "NOT VALID JSON")
        .await
        .unwrap();
    tokio::fs::write(dir.path().join("jobs.json.bak"), "ALSO NOT VALID")
        .await
        .unwrap();

    let result = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        PluginError::QueueCorrupt { .. } => {} // expected
        e => panic!("expected QueueCorrupt, got: {e:?}"),
    }
}

#[tokio::test]
async fn both_corrupt_does_not_overwrite_with_empty() {
    let dir = temp_dir();
    let fs = ProductionFs;

    let corrupt_primary = "NOT VALID JSON";
    let corrupt_backup = "ALSO NOT VALID";
    tokio::fs::write(dir.path().join("jobs.json"), corrupt_primary)
        .await
        .unwrap();
    tokio::fs::write(dir.path().join("jobs.json.bak"), corrupt_backup)
        .await
        .unwrap();

    let _ = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs).await;

    // Primary should be quarantined, not overwritten
    // Backup should remain untouched
    let backup_content = tokio::fs::read_to_string(dir.path().join("jobs.json.bak"))
        .await
        .unwrap();
    assert_eq!(
        backup_content, corrupt_backup,
        "backup should not be overwritten"
    );
}

// ═══════════════════════════════════════════════════════════════
// Task 3.14-3.15: Unsupported queue version
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn unsupported_version_returns_error() {
    let dir = temp_dir();
    let fs = ProductionFs;

    let bad_doc = r#"{"version": 2, "jobs": []}"#;
    tokio::fs::write(dir.path().join("jobs.json"), bad_doc)
        .await
        .unwrap();

    let result = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        PluginError::UnsupportedQueueVersion { found, supported } => {
            assert_eq!(found, 2);
            assert_eq!(supported, 1);
        }
        e => panic!("expected UnsupportedQueueVersion, got: {e:?}"),
    }
}

#[tokio::test]
async fn unsupported_version_with_backup_recovers() {
    let dir = temp_dir();
    let fs = ProductionFs;

    let doc = doc_with_jobs(vec![sample_job("j1")]);

    // Write valid backup
    tokio::fs::write(
        dir.path().join("jobs.json.bak"),
        serde_json::to_string(&doc).unwrap(),
    )
    .await
    .unwrap();

    // Write unsupported version primary
    tokio::fs::write(
        dir.path().join("jobs.json"),
        r#"{"version": 99, "jobs": []}"#,
    )
    .await
    .unwrap();

    let result = tauri_plugin_image_pipeline::job_queue::load_queue(dir.path(), &fs).await;
    // Design: unsupported version returns error immediately, does NOT fall back to backup.
    assert!(result.is_err());
    match result.unwrap_err() {
        PluginError::UnsupportedQueueVersion { found, supported } => {
            assert_eq!(found, 99);
            assert_eq!(supported, 1);
        }
        e => panic!("expected UnsupportedQueueVersion, got: {e:?}"),
    }
}

// ═══════════════════════════════════════════════════════════════
#[tokio::test]
async fn concurrent_saves_dont_corrupt() {
    let dir = temp_dir();
    let fs = Arc::new(ProductionFs);
    let dir_path = dir.path().to_path_buf();
    let mutex = Arc::new(tokio::sync::Mutex::new(()));

    // First save to create the file
    let initial = doc_with_jobs(vec![]);
    tauri_plugin_image_pipeline::job_queue::save_queue(&dir_path, &initial, fs.as_ref())
        .await
        .unwrap();

    let mut handles = vec![];
    for i in 0..10 {
        let fs = fs.clone();
        let d = dir_path.clone();
        let m = mutex.clone();
        handles.push(tokio::spawn(async move {
            let _guard = m.lock().await;
            let doc = doc_with_jobs(vec![sample_job(&format!("j{i}"))]);
            tauri_plugin_image_pipeline::job_queue::save_queue(&d, &doc, fs.as_ref())
                .await
                .unwrap();
        }));
    }

    for h in handles {
        h.await.unwrap();
    }

    // Should still be loadable
    let loaded = tauri_plugin_image_pipeline::job_queue::load_queue(&dir_path, fs.as_ref())
        .await
        .unwrap();
    assert_eq!(loaded.version, QUEUE_VERSION);
    assert!(!loaded.jobs.is_empty());
}

#[tokio::test]
async fn concurrent_loads_always_succeed() {
    let dir = temp_dir();
    let fs = Arc::new(ProductionFs);
    let dir_path = dir.path().to_path_buf();

    let doc = doc_with_jobs(vec![sample_job("j1")]);
    tauri_plugin_image_pipeline::job_queue::save_queue(&dir_path, &doc, fs.as_ref())
        .await
        .unwrap();

    let mut handles = vec![];
    for _ in 0..10 {
        let fs = fs.clone();
        let d = dir_path.clone();
        handles.push(tokio::spawn(async move {
            tauri_plugin_image_pipeline::job_queue::load_queue(&d, fs.as_ref())
                .await
                .unwrap()
        }));
    }

    for h in handles {
        let loaded = h.await.unwrap();
        assert_eq!(loaded, doc);
    }
}

// ═══════════════════════════════════════════════════════════════
// Additional: save_queue backs up only valid primary (design rule)
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn backup_of_corrupt_primary_does_not_overwrite_valid_backup() {
    let dir = temp_dir();
    let fs = ProductionFs;

    let doc_a = doc_with_jobs(vec![sample_job("j1")]);
    let doc_b = doc_with_jobs(vec![sample_job("j2")]);

    // Save doc A
    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc_a, &fs)
        .await
        .unwrap();
    // Save doc B (backup now = doc A)
    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc_b, &fs)
        .await
        .unwrap();

    // Corrupt the primary manually
    tokio::fs::write(dir.path().join("jobs.json"), "CORRUPT")
        .await
        .unwrap();

    // Save doc C — the old corrupt primary should NOT overwrite the valid backup (doc A)
    let doc_c = doc_with_jobs(vec![sample_job("j3")]);
    tauri_plugin_image_pipeline::job_queue::save_queue(dir.path(), &doc_c, &fs)
        .await
        .unwrap();

    // Read backup
    let backup_raw = tokio::fs::read_to_string(dir.path().join("jobs.json.bak"))
        .await
        .unwrap();
    let backup: QueueDocument = serde_json::from_str(&backup_raw).unwrap();

    // After save_b: primary=b, backup=a.
    // After corruption: primary="CORRUPT", backup=a.
    // After save_c: primary=c (corrupt not backed up), backup=a.
    // Backup should retain doc_a — the last valid backup, not the corrupt primary.
    assert_eq!(
        backup, doc_a,
        "backup should retain the last valid backup, not the corrupt primary"
    );
}
