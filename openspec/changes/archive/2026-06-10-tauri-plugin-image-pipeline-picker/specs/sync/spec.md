## MODIFIED Requirements

### Requirement: Manual Sync
The system SHALL support manual sync triggered by the user via the sync status button.

- Manual sync calls `syncNow()` which runs the bare baresync sync cycle.
- Asset hydration still runs in the background after sync.
- Image picking and image compression are not part of sync execution; they are owned by `tauri-plugin-image-pipeline` and are handled through plugin commands and events.
- Success shows a toast with row counts and table counts.

#### Scenario: Manual sync triggers baresync cycle
- **WHEN** the user triggers manual sync
- **THEN** the system SHALL run the baresync sync cycle and hydrate missing product images in the background
- **AND THEN** it SHALL NOT process pending asset processing jobs or enqueue plugin image work

#### Scenario: Manual sync completion toast
- **WHEN** manual sync completes
- **THEN** the system SHALL show a toast message in Indonesian: "Sinkronisasi berhasil (X diterima, Y tabel dikirim, Z dibersihkan)" for full sync, or variants for push-only/pull-only/no-op

### Requirement: Asset Sync (Separate Pipeline)
The system SHALL handle asset upload and hydration separately from baresync data sync, while leaving image picking and background compression to `tauri-plugin-image-pipeline`.

- Asset uploads use S3 presigned URLs, not the sync push endpoint.
- Asset downloads use a local asset cache table (`local_asset_cache`).
- Asset hydration (downloading missing images) runs after sync in the background.
- The app SHALL react to `image_pipeline://job_completed` and persist the final asset before the existing asset-cache and attachment events are emitted.

#### Scenario: Sync cycle runs data sync then hydration
- **WHEN** a sync cycle starts
- **THEN** the system SHALL run baresync data sync and then schedule background hydration of missing product images
- **AND THEN** it SHALL NOT process pending asset processing jobs

#### Scenario: Hydration starts after sync
- **WHEN** baresync data sync completes
- **THEN** the system SHALL start background hydration of missing product images
