## ADDED Requirements

### Requirement: Sync contract generator produces valid contract from paired Drizzle schemas
The system SHALL provide a `generate:sync` script that reads `sync.config.ts`, validates paired API and local Drizzle schemas, and writes `sync-contract.json` to the configured output directory.

#### Scenario: Successful contract generation
- **WHEN** developer runs `bun run generate:sync`
- **THEN** system writes `sync-contract.json`, `sync-table-order.ts`, and `sync-contract.manifest.json` to the configured output directory

#### Scenario: Schema validation catches missing primary key
- **WHEN** a synced table in `sync.config.ts` has no primary key column
- **THEN** generator reports error `SYNC_SCHEMA_MISSING_PRIMARY_KEY` with table name and fix suggestion, and exits without writing files

#### Scenario: Schema validation catches missing scope column
- **WHEN** a synced table's configured `scopeColumn` does not match any column in the Drizzle schema
- **THEN** generator reports error `SYNC_SCHEMA_MISSING_SCOPE_COLUMN` with table name, column name, and fix suggestion, and exits without writing files

#### Scenario: Contract contains correct table order
- **WHEN** synced tables have foreign key dependencies (e.g., `outlet_products` references `products`)
- **THEN** generated `sync-table-order.ts` contains `SYNC_UPSERT_ORDER` with parent tables before children and `SYNC_DELETE_ORDER` with children before parents

#### Scenario: Contract contains correct scope mappings
- **WHEN** tables are configured with scope columns in `sync.config.ts`
- **THEN** generated `sync-contract.json` includes scope metadata for each table matching the configured `scopeColumn`

#### Scenario: Check mode validates without writing
- **WHEN** developer runs `bun run generate:sync:check`
- **THEN** generator validates schemas and contract without writing any files

#### Scenario: Doctor mode runs diagnostics
- **WHEN** developer runs `bun run generate:sync:doctor`
- **THEN** generator runs all diagnostic checks (errors and warnings) and prints results without writing files

### Requirement: Sync contract contains all 10 synced tables
The generated `sync-contract.json` SHALL include entries for all 10 synced tables: merchants, outlets, registers, staff, categories, assets, products, outletProducts, orders, orderItems.

#### Scenario: All tables present in contract
- **WHEN** `sync.config.ts` lists all 10 tables
- **THEN** `sync-contract.json` `tables` object contains keys for all 10 table names

#### Scenario: Local-only and server-only columns are declared
- **WHEN** contract is generated
- **THEN** each table entry includes `localOnlyColumns: ["isSynced"]` and `serverOnlyColumns: ["syncUpdatedAt"]`

### Requirement: Sync contract includes push limits
The generated `sync-contract.json` SHALL include `limits` with `maxPushBytes` and `maxPushRows` values.

#### Scenario: Default limits in contract
- **WHEN** no custom limits are specified in `sync.config.ts`
- **THEN** `sync-contract.json` `limits` contains `maxPushBytes: 2097152` (2MB) and `maxPushRows: 2000`

#### Scenario: Custom limits override defaults
- **WHEN** `sync.config.ts` specifies `limits: { maxPushBytes: 1048576, maxPushRows: 1000 }`
- **THEN** `sync-contract.json` `limits` contains the custom values

### Requirement: Sync contract is embeddable by Tauri plugin
The generated `sync-contract.json` SHALL be a valid JSON file that can be included via Rust `include_str!` macro.

#### Scenario: Contract file is valid JSON
- **WHEN** `sync-contract.json` is generated
- **THEN** file is valid JSON parseable by `serde_json::from_str` in Rust

#### Scenario: Contract includes version metadata
- **WHEN** contract is generated
- **THEN** file contains `version` (date string) and `generatorVersion` fields
