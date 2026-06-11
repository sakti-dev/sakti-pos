## MODIFIED Requirements

### Requirement: R14 — Manual Sync

**WHEN** the user triggers manual sync
**THEN** the system SHALL execute in order:
1. baresync `syncNow()` core — push dirty rows, pull server changes
2. `uploadPendingAssets()` — upload compressed assets to S3
3. `hydrateMissingAssets()` — download missing assets in the background

**Previous order was**: process pending asset jobs → upload → baresync syncNow → hydrate. The new order reflects that asset processing (compress) is now plugin-driven and event-based (no batch processing step), and upload runs after the core sync ensures asset rows are pushed to the server first.

### Requirement: R17 — Asset Sync (Separate Pipeline)

The system SHALL handle asset upload separately from the baresync data pipeline. Asset processing (compression) is handled by the plugin and driven by events. Asset upload uses S3 presigned URLs, not the sync push endpoint.

**WHEN** a sync cycle starts
**THEN** the system SHALL:
1. Run baresync `syncNow()` core (push dirty rows, pull server changes)
2. Upload compressed assets via `uploadPendingAssets()`
3. Hydrate missing assets in the background

**WHEN** a compressed asset is uploaded
**THEN** the system SHALL use baresync `writeTransaction` to update the asset row to `status = 'ready'` and record the outbox entry via `writeLocalChange`.

### Requirement: R13 — Startup Sync

**WHEN** the app boots with a valid session
**THEN** after the startup sync completes, `recoverAssets()` SHALL run to re-trigger any stuck pending/compressed assets.

**Previous behavior**: Rust recovery ran at startup. **New behavior**: JS recovery runs after login + first sync, since it needs auth tokens and DB access via Drizzle.
