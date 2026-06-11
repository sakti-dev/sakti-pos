## Context

The current `apps/pos-app/src-tauri/src/assets/` module combines two different responsibilities:

1. Generic image pipeline behavior:
   - read image bytes;
   - decode JPEG/PNG;
   - apply EXIF orientation;
   - resize;
   - encode WebP;
   - generate JPEG previews;
   - hash output bytes;
   - write and resolve cached files;
   - queue, retry, recover, and clean up processing work.
2. Sakti POS business behavior:
   - validate supported attachment targets;
   - resolve the target merchant;
   - write `assets` and `local_asset_cache`;
   - update `products.image_asset_id`;
   - write sync outbox rows;
   - emit `asset-cache-ready` and `asset-attachment-ready`;
   - upload and hydrate assets.

The plugin owns the first responsibility. Sakti POS retains the second.

The implementation must support Android API 24, avoid running bitmap work on Android's main thread, survive process termination between every durable state transition, and avoid a second processing queue in SQLite.

## Goals / Non-Goals

**Goals:**

- Make `jobs.json` the sole durable processing queue.
- Keep all reconciliation metadata in each durable job.
- Make completed-result persistence idempotent and crash-safe.
- Use Android-native image processing without requiring identical encoded bytes across platforms.
- Keep the plugin independent from Sakti POS database schemas.
- Preserve the existing frontend-facing Sakti POS command names and response shapes where practical.
- Use strict test-driven development: every behavior starts with a focused failing test.
- Preserve structured operational logs for device investigation.

**Non-Goals:**

- Uploading assets to object storage.
- Hydrating assets from the server.
- Teaching the plugin which Sakti POS attachment targets are valid.
- Letting the plugin write Sakti POS SQLite tables.
- Guaranteeing byte-identical output between `zenwebp` and Android's WebP encoder.
- Running work after the Android application process has been killed.
- Introducing a general-purpose task scheduler.

## TDD Implementation Rule

No production behavior is added before a test demonstrates the missing behavior.

Each task slice follows:

```text
RED
  1. Write one focused test.
  2. Run only that test.
  3. Confirm it fails for the expected missing behavior.

GREEN
  4. Implement the smallest production change that passes.
  5. Run the focused test.
  6. Run the containing crate/module test suite.

REFACTOR
  7. Improve names or remove duplication without adding behavior.
  8. Re-run the containing suite.
```

A test that passes before production code is added does not satisfy RED. A test that fails because of a syntax error, missing fixture, or broken setup also does not satisfy RED.

Tests SHOULD use real temporary directories, real JSON serialization, real SQLite transactions, and real image fixtures. Mocks are reserved for the Android mobile boundary and forced filesystem failures that cannot be reproduced portably.

## Ownership Boundary

```text
┌──────────────────────────────────────────────────────────────┐
│ Sakti POS                                                    │
│                                                              │
│ validates target -> resolves merchant -> calls plugin        │
│                                                              │
│ completed result -> one SQLite transaction:                  │
│   assets + local_asset_cache + product + sync_outbox         │
│                                                              │
│ after commit -> consume plugin job -> emit app events         │
└──────────────────────────────┬───────────────────────────────┘
                               │ public Rust plugin API
┌──────────────────────────────▼───────────────────────────────┐
│ tauri-plugin-image-pipeline                                  │
│                                                              │
│ jobs.json -> processing -> cache file -> completed result     │
│                                                              │
│ owns source/preview cleanup after completed job consumption   │
└──────────────────────────────────────────────────────────────┘
```

The plugin stores `entity_type`, `entity_id`, `attachment_field`, and `processing_kind` as opaque strings. It never queries a product or decides whether a target is supported.

## Required Crate Layout

The exact internal module split may change only if all public contracts and tests remain equivalent.

```text
tauri-plugin-image-pipeline/
├── Cargo.toml
├── build.rs
├── permissions/
│   └── default.toml
├── src/
│   ├── lib.rs
│   ├── commands.rs
│   ├── dto.rs
│   ├── error.rs
│   ├── cache.rs
│   ├── job_queue.rs
│   ├── pipeline.rs
│   ├── desktop.rs
│   ├── mobile.rs
│   └── processor/
│       ├── mod.rs
│       └── default.rs
├── guest-js/
│   └── index.ts
├── android/
│   ├── build.gradle.kts
│   └── src/
│       ├── main/java/.../ImagePipelinePlugin.kt
│       └── test/java/.../
└── tests/
    ├── cache.rs
    ├── job_queue.rs
    ├── pipeline.rs
    └── fixtures/
```

The directory is owned by the Sakti POS repository. It MUST NOT remain an accidental nested Git repository.

## Data Contracts

### Queue document

The persisted file is a versioned object, not a bare array. Versioning makes incompatible future changes detectable.

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueueDocument {
    pub version: u32,
    pub jobs: Vec<JobRecord>,
}

pub const QUEUE_VERSION: u32 = 1;
```

Equivalent JSON:

```json
{
  "version": 1,
  "jobs": []
}
```

Unknown versions return `PluginError::UnsupportedQueueVersion`; they are not interpreted as an empty queue.

### Job state

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}
```

Allowed automatic transitions:

```text
enqueue                 pending
pending claim           pending -> processing
successful processing   processing -> completed
retryable failure       processing -> pending
terminal failure        processing -> failed
startup recovery        processing -> pending
explicit retry          failed -> pending
consumption             completed -> removed
```

No other transition is valid. In particular:

- `failed` is terminal until `retry_failed_job`;
- `completed` is never automatically reprocessed;
- consumption is deletion, not a persisted `consumed` state.

### Job record

The implementation must preserve all fields below. Additional forward-compatible fields require a queue version decision.

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: String, // UUID v4
    pub merchant_id: String,
    pub source_path: PathBuf,
    pub original_filename: String,
    pub source_mime_type: Option<String>,
    pub processing_kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
    pub max_long_edge: u32,
    pub preview_max_long_edge: u32,
    pub status: JobStatus,
    pub attempts: u32,
    pub max_attempts: u32,
    pub last_error: Option<String>,
    pub result: Option<JobResult>,
    pub preview_path: Option<PathBuf>,
    pub created_at: String, // UTC RFC 3339
    pub updated_at: String, // UTC RFC 3339
}
```

Required invariants:

- `max_long_edge > 0`;
- `preview_max_long_edge > 0`;
- `max_attempts > 0`, default `3`;
- `attempts <= max_attempts`;
- only `completed` jobs have `result = Some`;
- non-completed jobs have `result = None`;
- `failed` jobs have `last_error = Some`;
- `source_path` is canonical and under an allowed temp root;
- timestamps are valid UTC RFC 3339 strings.

### Requests and results

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueJobRequest {
    pub merchant_id: String,
    pub source_path: PathBuf,
    pub original_filename: String,
    pub source_mime_type: Option<String>,
    pub processing_kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
    pub max_long_edge: u32,
    pub preview_max_long_edge: u32,
    pub max_attempts: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JobResult {
    pub asset_id: String,
    pub cache_path: PathBuf,
    pub preview_path: Option<PathBuf>,
    pub content_hash: String,
    pub content_type: String,
    pub byte_size: u64,
    pub width: u32,
    pub height: u32,
    pub original_filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedJob {
    pub id: String,
    pub merchant_id: String,
    pub processing_kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
    pub result: JobResult,
    pub attempts: u32,
    pub created_at: String,
    pub updated_at: String,
}
```

`asset_id` and `content_hash` are equal for this version because both are SHA-256 of the final encoded bytes.

### Event payloads

Events are emitted only after the state transition has been persisted successfully.

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobCompletedPayload {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobFailedPayload {
    pub job_id: String,
    pub error: String,
    pub attempts: u32,
    pub max_attempts: u32,
    pub terminal: bool,
}
```

Event names remain:

```text
asset-job-completed
asset-job-failed
```

## Plugin API Boundary

Sakti POS uses the plugin's public Rust API from app-owned Tauri commands. It does not move business validation into JavaScript and does not invoke mutating plugin commands directly from the frontend.

The intended Rust access pattern follows Tauri's extension-trait convention:

```rust
pub trait ImagePipelineExt<R: Runtime> {
    fn image_pipeline(&self) -> &ImagePipeline<R>;
}

impl<R: Runtime, T: Manager<R>> ImagePipelineExt<R> for T {
    fn image_pipeline(&self) -> &ImagePipeline<R> {
        self.state::<ImagePipeline<R>>().inner()
    }
}
```

The public handle exposes async operations equivalent to:

```rust
impl<R: Runtime> ImagePipeline<R> {
    pub async fn enqueue_job(
        &self,
        request: EnqueueJobRequest,
    ) -> Result<EnqueueJobResponse>;

    pub async fn process_pending_jobs(&self, limit: u32)
        -> Result<ProcessJobsResponse>;

    pub async fn get_completed_jobs(&self) -> Result<Vec<CompletedJob>>;
    pub async fn get_failed_jobs(&self) -> Result<Vec<FailedJob>>;

    pub async fn consume_completed_job(&self, job_id: &str)
        -> Result<JobResult>;

    pub async fn reset_stuck_jobs(&self) -> Result<u32>;
    pub async fn retry_failed_job(&self, job_id: &str) -> Result<()>;
    pub async fn get_pending_preview(
        &self,
        target: AttachmentLookup,
    ) -> Result<Option<PreviewPathResponse>>;
    pub async fn get_cached_asset_path(
        &self,
        merchant_id: &str,
        asset_id: &str,
        content_type: &str,
    ) -> Result<Option<CachedPathResponse>>;
    pub async fn cleanup_orphaned_temp_files(&self) -> Result<u32>;
}
```

Guest JS wrappers may expose the plugin command equivalents for other consumers. Sakti POS keeps calling app commands such as `enqueue_asset_processing`, `process_pending_asset_jobs`, `get_cached_asset_path`, and `get_pending_preview_path` because those commands include database and attachment behavior.

Plugin command names use the Tauri namespace:

```ts
invoke("plugin:image-pipeline|enqueue_job", { request });
```

Tauri command permissions are generated from `build.rs`. The Sakti POS capability grants only plugin commands actually invoked by its JavaScript. Rust-to-Rust calls do not require frontend command permissions.

`FailedJob` returns diagnostics and reconciliation metadata but never image bytes:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedJob {
    pub id: String,
    pub merchant_id: String,
    pub processing_kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub attachment_field: String,
    pub source_path: PathBuf,
    pub attempts: u32,
    pub max_attempts: u32,
    pub last_error: String,
    pub updated_at: String,
}
```

## Queue Concurrency

Plugin state contains one queue mutex:

```rust
pub struct PluginState<R: Runtime> {
    queue: tokio::sync::Mutex<JobQueue>,
    processor: Arc<dyn ImageProcessor>,
    app: AppHandle<R>,
    paths: PipelinePaths,
}
```

The mutex protects only queue load/transition/save work. It MUST NOT be held during image decode, resize, encode, or cache file writing.

Processing one job follows:

```text
lock queue
  select oldest pending job
  transition to processing
  increment attempts
  save queue
unlock queue

read/process/write cache without queue lock

lock queue
  if success: processing -> completed + result
  if failure and attempts < max_attempts: processing -> pending + error
  if failure and attempts == max_attempts: processing -> failed + error
  save queue
unlock queue

emit event after save
```

Two concurrent `process_pending_jobs` calls may process different jobs, but they cannot claim the same job because claiming and persistence occur while holding the same mutex.

The response distinguishes successful completions from attempted jobs:

```rust
pub struct ProcessJobsResponse {
    pub attempted: u32,
    pub completed: u32,
    pub retry_scheduled: u32,
    pub terminal_failed: u32,
}
```

## Queue Persistence And Recovery

### Paths

```text
<app-cache>/sakti-image/jobs.json
<app-cache>/sakti-image/jobs.json.tmp
<app-cache>/sakti-image/jobs.json.bak
<app-cache>/sakti-image/jobs.corrupt-<UTC timestamp>.json
```

### Save algorithm

The implementation provides a filesystem adapter so failure ordering can be tested without relying on platform-specific faults.

Required sequence:

1. Serialize and validate the next `QueueDocument`.
2. Create the queue directory if missing.
3. Write the complete bytes to `jobs.json.tmp`.
4. Flush the temp file with `sync_all`.
5. If `jobs.json` exists and is valid, replace `jobs.json.bak` with that valid primary.
6. Atomically replace `jobs.json` with the temp file using a platform-compatible helper.
7. Best-effort sync the parent directory where supported.
8. Return success only after the primary replacement succeeds.

If any step before primary replacement fails, the old primary remains authoritative. A stale temp file may be removed on the next startup.

### Load algorithm

1. If `jobs.json` is missing:
   - load `jobs.json.bak` if valid;
   - otherwise create an empty version-1 document.
2. If `jobs.json` exists:
   - parse JSON;
   - verify `version`;
   - validate every job invariant.
3. If primary validation fails:
   - rename the primary to `jobs.corrupt-<timestamp>.json`;
   - log `[RUST] [PHOTO:QUEUE_RECOVERY]`;
   - load and validate the backup.
4. If backup recovery fails:
   - return `PluginError::QueueCorrupt`;
   - do not overwrite either corrupt artifact with an empty document;
   - do not run orphan cleanup.

### Error model

Errors remain structured internally and serialize to descriptive strings at the Tauri boundary.

```rust
pub enum PluginError {
    Io { operation: &'static str, path: PathBuf, source: io::Error },
    InvalidRequest { field: &'static str, reason: String },
    UnsafePath { path: PathBuf },
    QueueCorrupt { primary: PathBuf, backup: PathBuf },
    UnsupportedQueueVersion { found: u32, supported: u32 },
    InvalidTransition { job_id: String, from: JobStatus, action: &'static str },
    JobNotFound { job_id: String },
    Processing { job_id: Option<String>, stage: &'static str, reason: String },
    Event { name: &'static str, reason: String },
}
```

Do not catch an error only to rethrow the same error. Add context at ownership boundaries.

## Path Safety

Allowed source roots are resolved from plugin configuration, initially the app's `product_photo_inputs` directory. Safety is based on canonical containment, not string matching.

```rust
fn validate_source_path(
    source: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf> {
    let canonical_source = source.canonicalize()?;
    let allowed = allowed_roots.iter().any(|root| {
        root.canonicalize()
            .map(|canonical_root| canonical_source.starts_with(canonical_root))
            .unwrap_or(false)
    });

    if !allowed {
        return Err(PluginError::UnsafePath {
            path: canonical_source,
        });
    }

    Ok(canonical_source)
}
```

The final implementation must additionally verify that the source is a regular file. Canonicalization rejects missing sources and detects symlink escapes.

Merchant IDs, asset IDs, and job IDs are path segments. They must reject:

- empty values;
- `.` or `..`;
- `/` or `\`;
- absolute paths;
- platform path prefixes.

## Image Processor Contract

```rust
pub struct ProcessInput {
    pub data: Vec<u8>,
    pub original_filename: String,
    pub max_long_edge: u32,
}

pub struct ProcessOutput {
    pub data: Vec<u8>,
    pub content_type: String,
    pub extension: String,
    pub width: u32,
    pub height: u32,
}

pub trait ImageProcessor: Send + Sync {
    fn process(&self, input: ProcessInput) -> Result<ProcessOutput>;
    fn generate_preview(
        &self,
        data: Vec<u8>,
        max_long_edge: u32,
    ) -> Result<ProcessOutput>;
}
```

`process_pending_jobs` runs the CPU-bound Rust processor through `tauri::async_runtime::spawn_blocking`. The Android processor calls the mobile plugin, whose Kotlin command moves bitmap work to a coroutine dispatcher.

### Dimension calculation

The shared semantic rule is:

```rust
fn fit_within_max_edge(width: u32, height: u32, max_edge: u32) -> (u32, u32) {
    if width <= max_edge && height <= max_edge {
        return (width, height);
    }

    if width >= height {
        let scaled_height =
            ((height as u64 * max_edge as u64) / width as u64).max(1) as u32;
        (max_edge, scaled_height)
    } else {
        let scaled_width =
            ((width as u64 * max_edge as u64) / height as u64).max(1) as u32;
        (scaled_width, max_edge)
    }
}
```

Rust and Kotlin must use an equivalent rounding rule, tested with landscape, portrait, square, one-pixel, and already-small inputs.

### Rust processor

- Decode JPEG and PNG.
- Read EXIF orientation before discarding metadata.
- Support orientations 1 through 8.
- Resize with `FilterType::Triangle`.
- Encode final output as lossy WebP, quality 75, method 6.
- Encode previews as JPEG, quality 75.
- Return final dimensions after orientation and resize.

### Android processor

The Android plugin class follows Tauri's mobile plugin pattern:

```kotlin
@TauriPlugin
class ImagePipelinePlugin(private val activity: Activity) : Plugin(activity) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Command
    fun processImage(invoke: Invoke) {
        scope.launch {
            runCatching {
                val args = invoke.parseArgs(ProcessImageArgs::class.java)
                processImageBytes(args)
            }.onSuccess { result ->
                invoke.resolve(result.toJsObject())
            }.onFailure { error ->
                invoke.reject(error.message ?: "Image processing failed")
            }
        }
    }
}
```

Bitmap work must not execute before `scope.launch`.

Android processing:

1. Read EXIF with `ExifInterface(ByteArrayInputStream(bytes))`.
2. Decode bounds first.
3. Choose `inSampleSize` to avoid decoding a full-resolution bitmap when a much smaller output is requested.
4. Decode the bitmap.
5. Apply orientation matrix for all eight orientations.
6. Scale to the exact shared target dimensions.
7. Encode WebP:

```kotlin
val format =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Bitmap.CompressFormat.WEBP_LOSSY
    } else {
        @Suppress("DEPRECATION")
        Bitmap.CompressFormat.WEBP
    }

check(bitmap.compress(format, 75, output)) {
    "Bitmap.compress returned false"
}
```

8. Recycle intermediate bitmaps only when they are distinct objects and no longer referenced.
9. Return Base64 bytes, `image/webp`, width, and height to Rust.

Preview generation follows the same orientation and sizing path but encodes JPEG quality 75.

Android API 24 through 29 uses legacy `WEBP`; it does not fall back to JPEG. `WEBP` has existed since API 14.

### Cross-backend equivalence

Tests compare:

- corrected orientation;
- target width and height;
- longest-edge bound;
- decodable WebP output;
- declared MIME type;
- non-empty bytes.

Tests do not compare exact bytes, file size, or SHA-256 across Rust and Android encoders.

## Cache Contract

### Paths

```text
<app-cache>/sakti-image/<merchant_id>/assets/<asset_id>.webp
<app-cache>/sakti-image/previews/<job_id>.jpg
```

The file extension is derived from the processor's declared content type through a closed mapping. Unknown content types are rejected.

### Atomic write

Cache and preview writes use a same-directory temporary file:

```text
create parent
write <final>.tmp-<uuid>
flush file
rename/replace final
best-effort sync parent directory
```

The content hash is computed before the final path is selected. After writing, the implementation verifies the number of bytes written matches `JobResult.byte_size`.

### Resolution

`get_cached_asset_path` requires merchant ID, asset ID, and expected content type. It computes one exact path and checks that it is a regular file. It never scans merchant directories.

### Cleanup

Cleanup first loads a valid queue snapshot. Referenced paths include sources and previews for all persisted jobs, including terminal failures and completed jobs.

Cleanup:

- scans only configured temp and preview roots;
- ignores directories and symlinks;
- deletes only regular files not present in the referenced set;
- does not follow symlinks;
- stops without deleting anything if the queue cannot be recovered.

## POS App Transaction

The app maps `processing_kind = "image:webp-thumbnail"` and
`product.image_asset_id` to asset kind `product_photo`. This mapping remains app-owned.

The completed-job persistence function receives a SQLx transaction executor. Helpers used within it must accept `&mut Transaction<'_, Sqlite>` or a compatible executor instead of opening independent operations on `SqlitePool`.

Illustrative shape:

```rust
async fn persist_completed_job(
    pool: &SqlitePool,
    job: &CompletedJob,
) -> Result<PersistedAsset, String> {
    validate_completed_job(job)?;
    let mut tx = pool.begin().await.map_err(context_begin)?;

    let persist_state =
        resolve_local_asset_persist_state(load_existing_status(&mut tx, job).await?);

    upsert_asset(&mut tx, job, &persist_state).await?;
    upsert_local_asset_cache(&mut tx, job, &persist_state).await?;
    link_asset_to_attachment_target_tx(&mut tx, job).await?;
    upsert_asset_outbox_tx(&mut tx, job).await?;
    upsert_attachment_outbox_tx(&mut tx, job).await?;

    tx.commit().await.map_err(context_commit)?;
    Ok(PersistedAsset::from(job))
}
```

Required validation before writes:

- supported `processing_kind`;
- supported attachment target;
- target entity still exists;
- target merchant equals `job.merchant_id`;
- `asset_id == content_hash`;
- `cache_path` is the exact plugin path for merchant/hash/content type;
- cache file exists and is a regular file;
- file byte size equals `result.byte_size`;
- optional: re-hash file before first persistence or when metadata is inconsistent.

Required transaction behavior:

- asset and cache upserts are idempotent by asset ID;
- an existing `ready` asset remains `ready`;
- a new local asset becomes `pending_upload`;
- product linking updates only the intended merchant's non-deleted product;
- sync outbox writes use the existing pending-row uniqueness behavior;
- any failure rolls back every write.

After commit:

```rust
let persisted = persist_completed_job(pool, &job).await?;
app.image_pipeline()
    .consume_completed_job(&job.id)
    .await?;
emit_asset_cache_ready(app, &persisted.asset_id);
emit_asset_attachment_ready(app, persisted.attachment_payload);
```

If consumption fails, return an error and do not emit success events. The committed transaction remains valid; the next reconciliation repeats it idempotently and retries consumption.

## App Command Compatibility

The frontend continues using:

```text
enqueue_asset_processing
process_pending_asset_jobs
get_cached_asset_path
get_pending_preview_path
```

`enqueue_asset_processing`:

1. validates target and processing kind;
2. resolves merchant from SQLite;
3. builds `EnqueueJobRequest`;
4. calls plugin Rust API;
5. returns the existing `{ jobId }` shape.

`process_pending_asset_jobs`:

1. calls plugin processing with default limit 20;
2. calls the shared completed-job reconciliation function;
3. returns the number of jobs persisted and consumed, not merely attempted.

`get_cached_asset_path`:

1. queries `local_asset_cache` joined with `assets`;
2. calls plugin merchant-qualified resolution;
3. returns `{ localPath, contentType }` or `null`.

`get_pending_preview_path`:

1. builds attachment lookup for `product.image_asset_id`;
2. calls plugin preview lookup;
3. returns `{ previewPath, previewMimeType }` or `null`.

This preserves existing TypeScript adapters and limits frontend changes to tests only where behavior intentionally changes.

## Startup Order

Asset startup recovery runs after the database and plugin are available:

```text
1. reset_stuck_jobs
2. reconcile all completed jobs
3. cleanup_orphaned_temp_files
4. log summary
```

If queue recovery fails:

- log the queue corruption;
- skip reconciliation;
- skip cleanup;
- allow the rest of app startup to continue unless current startup policy treats asset recovery as fatal.

The chosen policy must be tested. Recommended Sakti behavior is non-fatal app startup with clearly logged asset pipeline degradation.

## SQLite Queue Removal

`pending_asset_processing_jobs` is removed from:

- `packages/sync-contract/src/local-schema.ts`;
- generated migrations after the cutover migration;
- Rust query code;
- temp cleanup queries;
- tests and fixtures;
- startup reset code.

Add a migration:

```sql
DROP TABLE IF EXISTS pending_asset_processing_jobs;
```

Do not edit generated durable artifacts by hand when the project generator owns them. Update the Drizzle source and run the repository's migration generation workflow.

Before deleting old queue code, prove the new integration tests pass. After deletion:

```bash
rg -n "pending_asset_processing_jobs" \
  apps/pos-app packages/sync-contract \
  -g '*.{rs,ts,sql}'
```

Expected result: only historical documentation or intentionally retained migration history, if any.

## Cargo And Android Configuration

Rust codecs are target-specific dependencies:

```toml
[dependencies]
tauri = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sha2 = "0.10"
thiserror = "2"
tokio = { version = "1", features = ["fs", "sync"] }
uuid = { version = "1", features = ["v4"] }

[target.'cfg(not(target_os = "android"))'.dependencies]
image = { version = "0.25", default-features = false, features = ["jpeg", "png"] }
kamadak-exif = "0.6"
zenwebp = "0.4"
```

Exact versions should match the workspace lockfile where possible.

The Android library includes AndroidX ExifInterface. Its plugin identifier and Kotlin class name must match `register_android_plugin` exactly.

## Permissions

`build.rs` lists every Tauri command to generate `allow-*` and `deny-*` permissions. `permissions/default.toml` contains a minimal documented set.

Sakti POS does not grant mutating plugin commands merely because they exist. It adds a plugin permission only when JavaScript directly invokes that command. App Rust calls use the public handle and remain behind the app's existing Tauri commands.

Permission verification includes checking generated schemas and confirming unauthorized direct JavaScript plugin commands are denied.

## Logging

Use the existing Rust `log` route and stable message prefixes. Do not use raw `println!`, `console.log`, or Android-only ad hoc tags as the sole evidence.

Required message families:

```text
[RUST] [PHOTO:QUEUE] enqueue/claim/complete/retry/fail/consume
[RUST] [PHOTO:QUEUE_RECOVERY] primary_invalid/backup_restored/recovery_failed
[RUST] [PHOTO:PROCESS] start/done/failed
[RUST] [PHOTO:CACHE] write/resolve/cleanup
[RUST] [PHOTO:PERSIST] transaction_start/commit/rollback
```

Each job-path message includes `job_id`; applicable messages also include `merchant_id`, `attempts`, `max_attempts`, `stage`, and `error`.

Android native failures are returned to Rust, where the Rust layer emits the canonical structured log. Kotlin may additionally use an Android tag for local debugging, but it does not replace the Rust message.

Update:

- `docs/knowledge/APP-LOGGING-DOCS.md`;
- `logs/capture-adb-logcat.sh` `LOG_FILTER`.

## Test Strategy

### Rust processor tests

- all eight EXIF orientations;
- landscape, portrait, square, and already-small dimensions;
- one-pixel dimension does not round to zero;
- invalid bytes return processing error;
- output decodes as WebP;
- preview decodes as JPEG;
- output hash matches exact bytes.

### Queue tests

- missing file creates empty versioned queue;
- unsupported version fails;
- enqueue round trip preserves every field;
- invalid invariant is rejected;
- transitions enforce the state machine;
- concurrent claims never return the same job;
- retryable failure returns to pending;
- final failure becomes terminal;
- explicit retry resets terminal failure;
- reset affects processing only;
- completion survives reload;
- consume removes only completed jobs;
- primary corruption restores backup;
- unrecoverable corruption does not overwrite files;
- forced failure at every save step preserves the last valid primary.

### Cache tests

- merchant-qualified write and resolve;
- unsafe path segments rejected;
- existing final survives failed temp write;
- previews use the specified path;
- cleanup preserves every referenced status;
- cleanup refuses to run after queue recovery failure;
- symlinks are not followed.

### POS integration tests

- enqueue includes attachment metadata;
- completed job writes all four business effects in one transaction;
- forced failure after each SQL step rolls back everything;
- repeat persistence produces the same final state;
- commit followed by consume failure remains recoverable;
- target merchant mismatch rejects persistence;
- missing target rolls back;
- cache size/hash mismatch rejects persistence;
- startup order is reset, reconcile, cleanup;
- app commands preserve existing frontend response shapes.

### Android tests

- format selector uses `WEBP` below API 30 and `WEBP_LOSSY` at API 30+;
- orientation matrix covers all eight orientations;
- shared dimension cases match Rust expectations;
- bitmap command executes work through the configured coroutine scope;
- `Bitmap.compress(false)` becomes an error;
- representative JPEG input produces decodable WebP and JPEG preview.

### Static cutover checks

- no runtime references to `pending_asset_processing_jobs`;
- no Android dependency path includes Rust image codecs;
- no old direct processor commands remain registered unless intentionally retained;
- plugin command permissions are generated;
- logging docs and capture filter include new paths.

## Risks / Trade-offs

- Rewriting one JSON document per transition is acceptable for the expected low job volume. The queue mutex and atomic replacement are required because correctness matters more than throughput.
- Backup recovery preserves the last valid snapshot but cannot make every filesystem operation transactional on every OS. The design favors visible, recoverable failure over silent deletion.
- Different encoders may create different asset IDs for the same source. Content identity remains correct because it describes actual stored bytes.
- Completed jobs can remain indefinitely if app persistence repeatedly fails. This is intentional; deleting them would lose attachment work. Support logs and explicit failed handling provide visibility.
- Keeping opaque attachment metadata in the plugin broadens the job shape but avoids an unreliable second mapping store.

## Migration Plan

1. Normalize the plugin directory as a repository-owned crate.
2. Build queue/cache/processor behavior through failing plugin tests.
3. Build app transactional reconciliation through failing integration tests.
4. Register the plugin and switch app commands to its Rust API.
5. Verify the new path while the old queue code still exists but is unused.
6. Remove the SQLite queue schema and runtime code.
7. Remove old processor/cache code and Android Rust codec dependencies.
8. Run all automated, static, Android, and log verification.
9. Hand device testing a verification guide and an updated `logs/capture-adb-logcat.sh`.
