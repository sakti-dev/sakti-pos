## ADDED Requirements

### Requirement: All recordLocalChange calls are replaced
Every `recordLocalChange()` call across the codebase SHALL be replaced with `writeTransaction` + `writeLocalChange` pattern.

#### Scenario: Search finds no remaining recordLocalChange calls
- **WHEN** `grep -r "recordLocalChange" apps/pos-app/src/` runs after migration
- **THEN** no results are returned

#### Scenario: All call sites are migrated
- **WHEN** the migration is complete
- **THEN** every former `recordLocalChange` call site uses `writeTransaction` + `writeLocalChange`

### Requirement: Each recordLocalChange pattern maps correctly
Each `recordLocalChange` call SHALL be migrated to the equivalent `writeTransaction` + `writeLocalChange` pattern based on the operation type.

#### Scenario: Insert operation mapping
- **WHEN** `recordLocalChange` was called with `operation: "insert"`
- **THEN** replacement uses `client.writeLocalChange(tx, { table, rowId, operation: "insert", write: (tx) => tx.insert(table).values({...}) })`

#### Scenario: Update operation mapping
- **WHEN** `recordLocalChange` was called with `operation: "update"`
- **THEN** replacement uses `client.writeLocalChange(tx, { table, rowId, operation: "update", write: (tx) => tx.update(table).set({...}).where(eq(table.id, rowId)) })`

#### Scenario: Delete operation mapping
- **WHEN** `recordLocalChange` was called with `operation: "delete"`
- **THEN** replacement uses `client.writeLocalChange(tx, { table, rowId, operation: "update", write: (tx) => tx.update(table).set({ deletedAt: now, isSynced: false, updatedAt: now }).where(eq(table.id, rowId)) })`

### Requirement: Transaction wrapping is preserved
When `recordLocalChange` was called inside an existing transaction, the replacement SHALL maintain the same atomicity guarantees.

#### Scenario: Nested transaction handling
- **WHEN** `recordLocalChange` was called inside a `db.transaction` block
- **THEN** the replacement uses `writeTransaction` which opens its own transaction (SQLite does not support nested transactions, but the outbox entry is always co-located with the write)

#### Scenario: Multiple operations in one transaction
- **WHEN** multiple `recordLocalChange` calls were in one transaction
- **THEN** they become multiple `writeLocalChange` calls inside one `writeTransaction`

### Requirement: No behavioral changes during migration
The migration SHALL preserve all existing sync behavior. Data that was syncing before SHALL continue syncing after.

#### Scenario: Existing sync cycle continues
- **WHEN** the migration is complete
- **THEN** push/pull/status sync cycles work identically to before

#### Scenario: No data loss
- **WHEN** the migration is complete
- **THEN** all existing local data is preserved and accessible
