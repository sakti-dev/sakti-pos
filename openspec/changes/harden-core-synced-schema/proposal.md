## Why

The 10 core synced tables ship with only the sync-engine's indexes (`(scope, sync_updated_at)` on API, `is_synced` on local) — no indexes for the queries the UI actually runs (catalog grid, receipt build, report history). The `assets.status` enum carries a stale `pending_upload` value that was removed from the live lifecycle in the corrected assets spec but never cleaned from the type declaration. Onboarding preferences (`businessType`, `useTax`, `taxPercentage`) are currently collected in the wizard but have nowhere to persist — the spec calls them "stored locally, NOT persisted to API," which is an acknowledged gap, not an intentional design.

This is the low-risk hygiene pass: additive-only changes to existing synced tables, no new tables, no behavior changes. It lands ahead of the feature-table extension so the foundation is sound before more weight goes on it.

## What Changes

- **Add read-path indexes** to 6 of 10 core synced tables (both `api-synced-schema.ts` and `local-synced-schema.ts`):
  - `products(merchant_id, is_active, sort_order)` — catalog grid render
  - `categories(merchant_id, sort_order)` — category nav
  - `orders(outlet_id, created_at)` — reports / history
  - `order_items(order_id)` — receipt building (currently a full table scan)
  - `staff(merchant_id, is_active)` — PIN login user list
  - `outlet_products(outlet_id, product_id)` — outlet catalog availability
- **Fix `assets.status` enum drift** — remove `pending_upload` from the API-side drizzle enum (`['pending','compressed','ready','failed']`); add the matching typed enum on the local side (currently untyped `text`). Type-level only — SQLite stores enums as `text` regardless of declared values, so no SQL migration is required.
- **Add 3 preference columns** to frozen tables (additive, both schema files):
  - `merchants.business_type` — `text enum ['fnb','retail','hybrid']`, notNull, default `'hybrid'`
  - `outlets.use_tax` — `integer boolean`, notNull, default `false`
  - `outlets.tax_percentage` — `integer` (whole percent), notNull, default `0`
- **Regenerate baresync contract** (`bun run generate:sync`) to capture the new columns.
- **Generate API migration** `apps/api/drizzle/0002_*.sql` via `drizzle-kit generate`.
- **Hand-write local migration** `apps/pos-app/src-tauri/migrations/0001_*.sql` mirroring the API migration's structural changes (new indexes + 3 ALTER TABLE columns; omits the type-only enum change).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `merchants-outlets`: add requirements for onboarding-preference persistence (business type on merchant; tax enable/percentage on outlet)

Note: the `assets` spec is already correct (`pending`, `compressed`, `ready`, `failed` — no `pending_upload`). The drift is only in the schema *declaration* (`packages/sync-contract/src/api-synced-schema.ts`) and generated artifacts, fixed as a code change — no spec delta needed.

## Impact

- **Schema files:** `packages/sync-contract/src/{api,local}-synced-schema.ts` (additive columns + indexes + enum fix)
- **Contract:** `packages/sync-contract/sync.config.ts` unchanged (no new tables); `generated/<date>/` regenerated
- **Migrations:** `apps/api/drizzle/0002_*.sql` (generated), `apps/pos-app/src-tauri/migrations/0001_*.sql` (hand-written)
- **No app code changes required** — these are schema-foundation changes. UI consumption of the new columns (`businessType` flag gating, tax calculation at checkout) is separate feature work.
- **No breaking changes** — all additive. Existing rows get column defaults; the enum-value removal affects only the TypeScript type, not existing data (no row carries `pending_upload` — it was dead before the lifecycle correction).
- **Risk: low.** Pure-upside hygiene. Verification: `generate:sync` clean, API tests (58 baseline), POS-app `tsc` + ultracite + vitest (76 baseline), column-for-column diff of the two migrations.

This change is the prerequisite-but-not-blocker for `extend-pos-domain-tables` (the 8 new feature tables). They can apply in either order, but sequencing hygiene-first keeps the reviews focused.
