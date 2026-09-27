# Payment Settings

## Purpose

Synced merchant payment configuration: a single payment_settings row per merchant holding the decoded static QRIS payload and QRIS enable flags.

## Requirements

# Payment Settings

## Purpose

Synced merchant payment configuration: a single `payment_settings` row per merchant holding the decoded static QRIS payload and the two QRIS enable flags. Tunai is always available and deliberately not stored.

### Requirement: Synced payment_settings Table

The system SHALL maintain `payment_settings` as a synced business table scoped by `merchantId`, one row per merchant, defined identically (mirrored business columns) in `packages/sync-contract/src/{api,local}-synced-schema.ts` and registered in `sync.config.ts`.

- Columns: `id` (UUIDv7 `.$defaultFn`), `merchantId` (text notNull, soft-ref `merchants.id`, scope column), `qrisStaticPayload` (text nullable — the decoded EMVCo string), `qrisStatisEnabled` (integer boolean notNull default false), `qrisDinamisEnabled` (integer boolean notNull default false), plus `apiSyncColumns()`/`localSyncColumns()`.
- Indexes: `(merchant_id, sync_updated_at)` on API; `payment_settings_is_synced_idx` on local.
- No CHECK constraints; booleans use integer mode. Column types within baresync's supported set.
- Upsert semantics: the client SHALL upsert the single row for the active merchant (create if absent); a synced pull overwrites local per server-wins, consistent with every other synced table.

#### Scenario: First QRIS scan creates the row
- **WHEN** the merchant completes the walkthrough and no `payment_settings` row exists
- **THEN** the app SHALL insert a row with the payload and the enabled flag for the mode that triggered the walkthrough (other flag false)

#### Scenario: Toggle persists offline
- **WHEN** a toggle flips while the device is offline
- **THEN** the row SHALL update locally with `isSynced = false`
- **AND** sync SHALL replicate it when connectivity returns

### Requirement: API Repository and Sync Wiring

The API SHALL expose a `payment_settings` repository and register the table in the sync service, mirroring the pattern used by the June domain tables (commit `1fc4fd3`): read/upsert endpoints scoped by merchant, table included in sync push/pull processing.

#### Scenario: Pull includes payment settings
- **WHEN** a device pulls changes for its merchant scope
- **THEN** `payment_settings` rows SHALL be included in the sync response and applied locally by PK upsert
