## ADDED Requirements

### Requirement: Asset lifecycle event listener

The system SHALL provide a `startAssetLifecycleListener()` function that listens for `image_pipeline://job_completed` events from the plugin and updates the assets table via baresync `writeTransaction`.

**WHEN** `image_pipeline://job_completed` is received with `{ jobId, ContentHash, ByteSize, Width, Height }`
**THEN** the system SHALL:
1. Query the assets table for the row matching `jobId`
2. Use `writeTransaction` to update the asset row: set `status = 'compressed'`, `contentHash`, `byteSize`, `width`, `height`
3. Call `enqueueChange` to record the outbox entry
4. Trigger upload for the asset

#### Scenario: Compression completes for a new product
- **WHEN** the plugin emits `image_pipeline://job_completed` for a job that matches a pending asset
- **THEN** the asset row is updated to `status = 'compressed'` with all metadata, and upload is triggered

#### Scenario: Compression completes for a recovery job
- **WHEN** the plugin emits `image_pipeline://job_completed` for a previously stuck job
- **THEN** the same lifecycle handler updates the asset and triggers upload — no special recovery path

#### Scenario: Event received but no matching asset row
- **WHEN** the event's `jobId` doesn't match any asset row
- **THEN** the system SHALL log a warning and skip

### Requirement: Asset lifecycle startup recovery

The system SHALL provide a `recoverAssets()` function that queries for stuck assets after login and re-triggers their lifecycle.

**WHEN** recovery runs after login
**THEN** the system SHALL:
1. Query assets with `status = 'pending'`
2. For each: mark as `status = 'failed'` (staged source is cleaned up after pick, so re-compression is impossible — user must re-pick)
3. Query assets with `status = 'compressed'`
4. For each: trigger upload directly

#### Scenario: Pending asset from crashed compression
- **WHEN** an asset has `status = 'pending'` at startup
- **THEN** recovery marks it as `status = 'failed'` since the staged source file has been cleaned up and re-compression is not possible

#### Scenario: Compressed asset that was never uploaded
- **WHEN** an asset has `status = 'compressed'` at startup
- **THEN** recovery triggers upload for it directly

### Requirement: Lifecycle listener startup

**WHEN** the app starts and listeners are initialized
**THEN** `startAssetLifecycleListener()` SHALL be called once alongside other app event listeners.

**WHEN** the lifecycle listener is started
**THEN** it SHALL subscribe to `image_pipeline://job_completed` events and remain active for the app session.
