## Context

The current paired schema has 10 synced business tables covering org/catalog/sales. The upcoming feature work needs storage for four new domains: inventory tracking, cash-shift drawer control, product modifiers on receipts, and F&B raw-material cataloging. The UI forms for stocktake and goods-receipt already exist (`apps/pos-app/src/pages/inventory/stocktake-form/`, `.../goods-receipt/`) and submit batch-shaped payloads keyed on both product and ingredient targets — proving these are real concepts, not phantoms.

This change adds 8 new synced tables. All follow the existing baresync machinery. The design is grounded in two reference documents:
- `openspec/DATABASE-DESIGN.md` — conventions, ERDs, design-decision rationale
- `docs/plans/2026-06-20-pos-schema-extension-design.md` — exact column specs, migration plan, risks

The hardest constraints are baresync's: every table needs a single text `id` PK, a scope column registered in `sync.config.ts`, mirrored business columns across both schema files, and the mandatory sync indexes. No CHECK constraints (silent sync-drop risk under server-wins — verified baresync doesn't inspect them).

## Goals / Non-Goals

**Goals:**
- Add 8 new synced tables with full baresync machinery, mirrored across both schema files.
- Use a deterministic PK for `inventory_stocks` (the one table with a natural composite key) to prevent multi-device duplicate rows.
- Use header + lines structure for stocktakes and goods-receipts (matches the UI forms' batch shape).
- Use drizzle text enums (not CHECK) for all status/type fields.
- Register all 8 tables in `sync.config.ts` and regenerate the contract cleanly.
- Generate API migration and hand-write the matching local migration, verified column-for-column.

**Non-Goals:**
- No recipe/BOM engine linking ingredients to products with quantities and costing. Defer until F&B recipe workflow is scoped.
- No suppliers table — `goods_receipts.supplierName` is a string for now.
- No refunds/returns, customer/loyalty, or modifier catalog definitions (the menu of available modifiers per product).
- No tax application to order totals — `useTax`/`taxPercentage` (from `harden-core-synced-schema`) enable calculation; applying tax at checkout is a separate flow.
- No app code changes — UI rewiring to consume these tables is follow-up feature work.
- No concurrent stock-adjustment conflict resolution — server-wins means concurrent `onHandQty` edits lose updates. The append-only ledger (`stocktake_lines`, `goods_receipt_lines`) preserves the audit trail for recovery. Full operation-log/CRDT fix is deferred. See Risks.

## Decisions

### D1: `inventory_stocks` uses a deterministic PK, not UUIDv7

Most tables use UUIDv7. `inventory_stocks` has a **natural composite key**: one row per `(outlet, target)`. Consider two registers in one outlet, both offline, both initializing stock for product X. With UUIDv7, each device generates a distinct ID; after sync you have two non-merging rows for the same logical stock card. With a deterministic ID derived from the natural key (`inv:{outletId}:{targetType}:{targetId}`), both devices target the same PK. baresync applies pulled rows via `INSERT ... ON CONFLICT(id) DO UPDATE` (verified at `vendor/baresync/.../push.rs:46` + asserted in tests), so the second-write device's row upserts over the first — the two rows converge.

A readable string format is preferred over an opaque hash for sync-log debuggability. This pattern should be applied to any future bridge/junction table with a natural composite key.

Alternative considered: random UUIDv7 + a `UNIQUE(outlet_id, target_type, target_id)` constraint. Rejected — the constraint only catches local duplicates; two devices still create distinct rows that sync as separate rows. Server-wins has no merge step.

### D2: Polymorphic `inventory_stocks.targetType/targetId` (product or ingredient)

Two real inventory targets exist: `products` (retail) and `ingredients` (F&B raw materials). Both have identical inventory semantics. A single table with `target_type` + `target_id` is simpler than two parallel tables. The polymorphic association is justified by two real targets — not a phantom (the stocktake/goods-receipt forms query both).

Soft-reference only (no hard FK locally) — matches the existing pattern across all synced tables. Server-wins overwrites can't tolerate hard FKs to late-arriving rows.

### D3: Header + lines for stocktakes and goods-receipts (not flat)

The UI forms submit **batches**: one session (`ref`, `reason`/`supplier`, `staff`) with many counted/received items. A flat single-table design (`stocktake_entries` with header fields repeated per row) violates 3NF and makes session-level queries painful. The header + lines pattern mirrors the existing `orders` + `order_items` structure.

Child line tables denormalize `outletId` (their scope column) directly, not derivable from the parent — baresync filters by the row's own scope column, not through joins. This is the existing convention (see `order_items.outletId`).

### D4: Relational `order_item_modifiers` (not JSON)

Alternative was `text({ mode: "json" })` on `order_items`. Three problems:
1. baresync warning `SYNC_SCHEMA_JSON_ONLY_FIELD` ("JSON-typed columns require special handling during serialization")
2. Inconsistency — `order_items` already snapshots relationally (`product_name`, `unit_price_minor_units`, `subtotal_minor_units` as real columns)
3. No analytics — can't query "how many extra shots sold this month" without parsing JSON per row

A relational table costs one indexed join on receipt render (sub-millisecond on local SQLite) and gains queryability + consistency + no baresync warnings.

This is a receipt **snapshot** — it captures what was actually sold on each line. It does NOT define what modifiers a product *offers* (that's a future `product_modifier_catalog` table, out of scope).

### D5: `staffId` not `userId` for all local-facing action attribution

`users` is server-only (not synced). The local app cannot resolve cloud user identity — it has no `users` table. `staff` is synced and locally resolvable. Every local-facing action (who conducted a stocktake, who logged a goods-receipt, who opened a cash shift) references `staffId`. The server maps `staff.cloud_user_id` → `users.id` when it needs to link to cloud identity. This matches the existing `orders.staffId` pattern.

### D6: Bare `ingredients` table, not a recipe engine

The stocktake/goods-receipt forms need an ingredients catalog to exist (they query `ingredients` and `products` symmetrically). A bare catalog entity (`id, merchantId, name, sku, unit, category, isActive`) — same shape as `products` minus the price/image — unblocks both forms. The recipe/BOM engine (linking ingredients to products with quantities and costing) is a distinct, larger architectural block, deferred until the F&B recipe workflow is scoped. Adding the bare table now is not premature — it's the minimum needed for the forms to function.

## Risks / Trade-offs

- **[Local migration diverges from API migration]** → Highest risk given 8 new tables. Mitigation: column-for-column diff in verification gate #5. The structural shape is uniform (each table follows the same sync-columns + scope-index pattern), so divergence is detectable by diff.
- **[Polymorphic `targetType/targetId` has no FK enforcement]** → App must guard against orphaned targets (e.g., an `inventory_stocks` row pointing at a deleted product). Accepted — matches existing soft-ref pattern. Soft-deleted targets remain referenceable; the app filters `deletedAt IS NULL` when resolving.
- **[Concurrent stock adjustment loses updates (known limitation, NOT solved here)]** → `inventory_stocks.onHandQty` is a mutable absolute value. Under server-wins, two devices adjusting stock for the same product concurrently → later write overwrites earlier → one adjustment silently lost. The deterministic ID (D1) prevents *duplicate rows*; it does NOT prevent *lost updates* to the quantity. A full fix requires operation-log/CRDT semantics (append-only adjustments summed on read), out of scope. Mitigation for now: the append-only ledger tables (`stocktake_lines`, `goods_receipt_lines`) preserve the audit trail of every adjustment, so discrepancies are recoverable from the ledger. Revisit if multi-device concurrent stock edits become a real operational problem.
- **[Soft-delete interaction with `cash_shifts.status`]** → A soft-deleted `cash_shifts` row still has `status='open'`. App logic must filter `deletedAt IS NULL` when checking "is a shift open?" — existing convention across all synced tables, documented in code.
- **[Denormalized-scope rows must be immutable]** → Child tables (`stocktake_lines`, `goods_receipt_lines`, `order_item_modifiers`) carry `outletId` directly. Mutating a parent's scope would require cascading child-scope rewrites that re-enter the outbox and destabilize incremental sync. POS ledgers are append-only by domain rule; enforce immutability in app code (see DATABASE-DESIGN.md § Immutability convention).
- **[`order_item_modifiers` grows order payload]** → One row per modifier per line item. Acceptable for POS receipt scale (single-digit modifiers per line). Revisit if bulk-order workflows emerge.

## Migration Plan

**Execution order:**
1. Edit `api-synced-schema.ts`: add 8 new tables with `apiSyncColumns()`, `(scope, syncUpdatedAt)` indexes, and read-path indexes. Use drizzle text enums for all status/type fields. `inventory_stocks.id` is a plain `text` PK (no `.$defaultFn` — the app generates the deterministic ID).
2. Edit `local-synced-schema.ts`: mirror exactly (local flavor: `localSyncColumns()`, `isSynced` indexes, same read-path indexes, same enums).
3. Edit `sync.config.ts`: register 8 new tables with their scope columns (`ingredients`→`merchantId`; the other 7 →`outletId`).
4. Run `bun run generate:sync` — verify clean (no `SYNC_SCHEMA_JSON_ONLY_FIELD`, no missing-scope errors, no paired-column drift). Inspect the generated `SYNC_UPSERT_ORDER` to confirm FK ordering is sane (parents before children).
5. Run `drizzle-kit generate` in `apps/api` → produces `0003_*.sql`. Verify 8 `CREATE TABLE` + all indexes, no statements on existing tables.
6. Hand-write `apps/pos-app/src-tauri/migrations/0002_*.sql` mirroring `0003` structurally (same columns, types, defaults, indexes; local omits `sync_updated_at`, includes `is_synced`).
7. Verify: API tests (baseline), POS-app `tsc` + ultracite + vitest (76 baseline), column-for-column migration diff.

**Rollback:** Additive only (new tables). Rollback = revert the commit + drop the 8 tables. No existing data affected. Contract version advances; rollback reverts the bundled contract.

## Open Questions

None outstanding — all design questions were resolved during the brainstorm (Path B chosen, relational modifiers chosen, ingredients-as-bare-table chosen) and the external review (deterministic IDs adopted after verification, immutability invariant documented, concurrent-adjustment limitation acknowledged).
