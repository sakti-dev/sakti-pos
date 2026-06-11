## MODIFIED Requirements

### Requirement: R4: Image Processing
The system SHALL delegate decode, EXIF correction, resize, encode, preview generation, hashing, and processed-file caching to `tauri-plugin-image-pipeline`.

#### Scenario: Process a queued image
- **WHEN** the POS app requests pending image processing
- **THEN** it calls the plugin processing API and receives completed jobs containing output metadata and opaque attachment metadata

#### Scenario: Persist a completed result
- **WHEN** the app reconciles a completed plugin job
- **THEN** it verifies the result and persists the asset metadata, local cache metadata, attachment link, and sync outbox changes in one SQLite transaction

#### Scenario: Persistence transaction fails
- **WHEN** any completed-result persistence step fails
- **THEN** the SQLite transaction rolls back and the plugin job remains completed and unconsumed for a later retry

#### Scenario: App crashes after commit
- **WHEN** the SQLite transaction commits but the app exits before plugin consumption
- **THEN** the next reconciliation repeats the idempotent transaction safely and then consumes the job

### Requirement: R5: Pending Asset Processing Jobs
The system SHALL use the plugin JSON queue as the sole durable processing queue and SHALL remove `pending_asset_processing_jobs` from the POS schema and runtime.

#### Scenario: Enqueue image processing
- **WHEN** `enqueue_asset_processing` receives a supported attachment target
- **THEN** the app validates the target, resolves its merchant and processing kind, and enqueues one plugin job containing the attachment metadata

#### Scenario: Reject an unsupported target
- **WHEN** the attachment target is not in the app allowlist
- **THEN** the app rejects the request before calling the plugin

#### Scenario: Process queued work
- **WHEN** `process_pending_asset_jobs` is called
- **THEN** the app asks the plugin to process pending jobs and reconciles completed results through the app-owned transactional persistence path

#### Scenario: Start the app
- **WHEN** app startup reaches asset recovery
- **THEN** it resets interrupted plugin jobs, reconciles every completed job, and runs orphan cleanup only after queue recovery succeeds

#### Scenario: Complete the cutover
- **WHEN** the plugin queue becomes active
- **THEN** no application code or generated local schema references `pending_asset_processing_jobs`

### Requirement: R6: Local Asset Cache
The system SHALL retain `local_asset_cache` as app-owned metadata while delegating processed-file storage and disk resolution to the plugin.

#### Scenario: Persist a processed cache result
- **WHEN** a completed job is reconciled
- **THEN** the app upserts `local_asset_cache` with the plugin cache path, merchant ID, content hash, object key, and status in the same transaction as the asset and attachment writes

#### Scenario: Resolve a cached asset for the frontend
- **WHEN** `get_cached_asset_path(assetId)` is called
- **THEN** the app loads the asset's merchant ID and content type from SQLite, requests the merchant-qualified path from the plugin, and returns the existing `{ localPath, contentType }` response shape

#### Scenario: Cached file is absent
- **WHEN** SQLite metadata exists but the plugin reports that the merchant-qualified file is missing
- **THEN** the app returns `null`

#### Scenario: Resolve a pending preview
- **WHEN** the frontend requests a pending preview for a product
- **THEN** the app queries the plugin by product attachment target and returns the existing preview response shape or `null`

### Requirement: R17: Asset Events
The system SHALL translate durable plugin job events into the existing app asset lifecycle events after business persistence succeeds.

#### Scenario: Receive a completion event
- **WHEN** the plugin emits `asset-job-completed`
- **THEN** the app reconciles the job transactionally, consumes it after commit, and emits `asset-cache-ready` and `asset-attachment-ready`

#### Scenario: Receive a failure event
- **WHEN** the plugin emits `asset-job-failed`
- **THEN** the app logs the job ID, attempt state, terminal state, and error without emitting successful asset events

#### Scenario: Reconcile without an event
- **WHEN** startup finds a completed job whose event was missed
- **THEN** the app performs the same transactional reconciliation, consumption, and app event emission used by the live event path

## ADDED Requirements

### Requirement: Image pipeline plugin access
The POS app SHALL register the image pipeline plugin and grant only the commands and event access required by its integration.

#### Scenario: Run the Sakti POS business workflow
- **WHEN** the Sakti POS frontend enqueues, processes, or resolves an asset
- **THEN** it invokes the existing app-owned command, which applies business validation and calls the plugin through its public Rust API

#### Scenario: Use the standalone guest JS bindings
- **WHEN** a consumer directly invokes a plugin command through `guest-js`
- **THEN** it uses `plugin:image-pipeline|<command>` and its Tauri capability explicitly grants that command

#### Scenario: Initialize app integration
- **WHEN** Sakti POS setup or startup code requests plugin state
- **THEN** the plugin has already been registered on the Tauri builder

### Requirement: Image pipeline operational logging
The image pipeline integration SHALL emit documented structured logs for enqueue, processing, queue recovery, persistence, consumption, and cleanup.

#### Scenario: Add image pipeline log prefixes
- **WHEN** the change introduces a new stable prefix or message family
- **THEN** `docs/knowledge/APP-LOGGING-DOCS.md` documents it and `logs/capture-adb-logcat.sh` includes it in `LOG_FILTER`

#### Scenario: Capture device evidence
- **WHEN** a tester runs `logs/capture-adb-logcat.sh`
- **THEN** `logs/app.log` includes the plugin and app messages needed to follow one job from enqueue through consumption or failure
