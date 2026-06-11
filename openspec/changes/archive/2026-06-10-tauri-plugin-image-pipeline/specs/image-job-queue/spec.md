## ADDED Requirements

### Requirement: JSON-only durable queue
The plugin SHALL use a versioned document at `<app-cache>/sakti-image/jobs.json` as the only durable image processing queue.

#### Scenario: Initialize without a queue file
- **WHEN** neither a primary queue nor a backup queue exists
- **THEN** the plugin initializes `{ "version": 1, "jobs": [] }`

#### Scenario: Load an unsupported queue version
- **WHEN** the queue document version is not supported
- **THEN** the plugin returns an unsupported-version error without interpreting or replacing the queue

#### Scenario: Enqueue or transition a job
- **WHEN** queue state changes
- **THEN** the plugin serializes the complete queue document through its atomic persistence procedure

#### Scenario: Inspect POS persistence
- **WHEN** the plugin queue is active
- **THEN** the POS app does not create, read, update, or delete `pending_asset_processing_jobs` rows

### Requirement: Serialized queue mutation
The plugin SHALL serialize all in-process queue mutations through one async lock.

#### Scenario: Concurrent commands mutate jobs
- **WHEN** two plugin commands attempt queue mutations concurrently
- **THEN** their load, transition, and save operations execute in a deterministic serialized order without dropping either mutation

### Requirement: Recoverable queue persistence
The plugin SHALL preserve the last valid queue document during replacement and SHALL NOT silently treat a corrupt existing queue as empty.

#### Scenario: Persist a queue update
- **WHEN** a queue update is saved
- **THEN** the plugin writes and flushes `jobs.json.tmp`, retains the prior valid document as `jobs.json.bak`, and atomically replaces `jobs.json`

#### Scenario: Primary queue is corrupt
- **WHEN** `jobs.json` cannot be parsed or validated
- **THEN** the plugin renames it to `jobs.corrupt-<timestamp>.json`, logs the recovery failure, and attempts to restore `jobs.json.bak`

#### Scenario: Backup recovery succeeds
- **WHEN** the primary queue is corrupt and the backup is valid
- **THEN** the plugin restores the backup and continues from its jobs

#### Scenario: No valid queue can be recovered
- **WHEN** both primary and backup queue documents are invalid
- **THEN** queue operations return a descriptive corruption error and orphan cleanup remains disabled

### Requirement: Durable job schema
Each queue job SHALL contain all processing and app reconciliation information required after a process restart.

#### Scenario: Serialize a job
- **WHEN** a job is persisted
- **THEN** it includes `id`, `merchant_id`, `source_path`, `original_filename`, `source_mime_type`, `processing_kind`, `entity_type`, `entity_id`, `attachment_field`, `max_long_edge`, `preview_max_long_edge`, `status`, `attempts`, `max_attempts`, `last_error`, `result`, `preview_path`, `created_at`, and `updated_at`

#### Scenario: Generate a job identity
- **WHEN** a new job is enqueued
- **THEN** its ID is a UUID v4 and its timestamps are UTC RFC 3339 strings

#### Scenario: Preserve attachment metadata
- **WHEN** the app restarts after a job completed
- **THEN** `get_completed_jobs` returns the entity type, entity ID, attachment field, processing kind, and merchant ID needed for app persistence

### Requirement: Safe enqueue
The plugin SHALL validate and durably enqueue source images.

#### Scenario: Enqueue a valid source
- **WHEN** `enqueue_job` receives a source contained by an allowed canonical temporary root and valid processing metadata
- **THEN** the plugin generates a unique job ID, writes a preview, persists a `pending` job, and returns its job ID and preview path

#### Scenario: Preview generation fails
- **WHEN** the source is valid but preview generation fails
- **THEN** enqueue returns an error and does not create a queue job

#### Scenario: Source path escapes the temporary root
- **WHEN** canonical path resolution shows the source is outside every allowed temporary root
- **THEN** enqueue rejects the request

#### Scenario: Source is a symlink escape
- **WHEN** the lexical source path is inside a temporary root but its canonical target is outside that root
- **THEN** enqueue rejects the request

### Requirement: Bounded job processing
The plugin SHALL process pending jobs in creation order with a bounded number of attempts.

#### Scenario: Process pending jobs
- **WHEN** `process_pending_jobs` is called with a positive limit
- **THEN** it claims up to that number of `pending` jobs in oldest-first order, increments each attempt count, persists the claim, processes and caches the output, and persists successful jobs as `completed`

#### Scenario: Report processing outcomes
- **WHEN** `process_pending_jobs` finishes
- **THEN** it returns separate counts for attempted, completed, retry-scheduled, and terminal-failed jobs

#### Scenario: Recoverable attempt fails
- **WHEN** processing fails and the job has attempts remaining
- **THEN** the plugin records the error, returns the job to `pending`, emits `asset-job-failed` with retry metadata, and continues with the next job

#### Scenario: Final attempt fails
- **WHEN** processing fails at `max_attempts`
- **THEN** the plugin records the error, marks the job `failed`, emits a terminal `asset-job-failed` event, and excludes it from automatic processing

#### Scenario: Invalid processing limit
- **WHEN** the requested limit is zero or negative
- **THEN** the plugin rejects the request instead of processing an unbounded number of jobs

### Requirement: Completed job result
A completed job SHALL expose metadata derived from the cached output.

#### Scenario: Complete a job
- **WHEN** processing and cache writing succeed
- **THEN** the result includes `asset_id`, `cache_path`, `preview_path`, `content_hash`, `content_type`, `byte_size`, `width`, `height`, and `original_filename`

#### Scenario: Emit completion
- **WHEN** the completed state has been durably persisted
- **THEN** the plugin emits `asset-job-completed` with the job ID

### Requirement: Completed job reconciliation
The plugin SHALL retain completed jobs until the POS app explicitly consumes them.

#### Scenario: Query completed jobs
- **WHEN** `get_completed_jobs` is called
- **THEN** it returns every completed job with full result and attachment metadata

#### Scenario: App was closed during completion
- **WHEN** the app starts after processing completed in an earlier session
- **THEN** startup reconciliation can retrieve and persist the completed job before consuming it

### Requirement: Consume after app persistence
The plugin SHALL consume only jobs in the completed state.

#### Scenario: Consume a completed job
- **WHEN** `consume_completed_job` receives a completed job ID after app persistence commits
- **THEN** it removes the job durably and then attempts safe source and preview cleanup

#### Scenario: Consume a non-completed job
- **WHEN** consumption is requested for a pending, processing, or failed job
- **THEN** the plugin returns an error and preserves the job

#### Scenario: Cleanup fails after consumption
- **WHEN** the queue removal succeeds but source or preview deletion fails
- **THEN** the plugin logs the cleanup failure and returns the consumed result without recreating the job

### Requirement: Startup recovery
The plugin SHALL recover interrupted processing without reviving terminal failures.

#### Scenario: Reset interrupted jobs
- **WHEN** `reset_stuck_jobs` is called
- **THEN** every `processing` job returns to `pending`, the queue is persisted, and the reset count is returned

#### Scenario: Preserve terminal failures
- **WHEN** startup recovery encounters a `failed` job
- **THEN** it leaves the job failed

### Requirement: Explicit failed-job retry
The plugin SHALL support explicit retry of a terminal failed job.

#### Scenario: Retry a failed job
- **WHEN** `retry_failed_job` receives a failed job ID whose source still exists
- **THEN** it resets attempts and error state, changes status to `pending`, and persists the queue

#### Scenario: Retry a job with a missing source
- **WHEN** explicit retry is requested but the source file no longer exists
- **THEN** the plugin returns an error and preserves the failed job

#### Scenario: Query terminal failures
- **WHEN** `get_failed_jobs` is called
- **THEN** it returns failed jobs with attachment metadata, source path, attempt counts, last error, and update timestamp but no source or processed image bytes

### Requirement: Queue events and diagnostics
The plugin SHALL emit structured completion and failure events only after the associated state transition is durably saved.

#### Scenario: Emit a retryable failure event
- **WHEN** a job attempt fails but retries remain
- **THEN** `asset-job-failed` includes job ID, error, attempt count, maximum attempts, and `terminal = false`

#### Scenario: Emit a terminal failure event
- **WHEN** a job exhausts its attempts
- **THEN** `asset-job-failed` includes job ID, error, attempt count, maximum attempts, and `terminal = true`
