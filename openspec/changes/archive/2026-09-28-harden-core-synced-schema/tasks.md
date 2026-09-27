## 1. Schema files — additive columns + assets.status fix

- [x] 1.1 In `packages/sync-contract/src/api-synced-schema.ts`: add `businessType` (`text enum ['fnb','retail','hybrid']`, notNull, default `'hybrid'`) to `merchants`. Add `useTax` (`integer boolean`, notNull, default `false`) and `taxPercentage` (`integer`, notNull, default `0`) to `outlets`.
- [x] 1.2 In `api-synced-schema.ts`: fix `assets.status` enum from `['pending','compressed','pending_upload','ready','failed']` → `['pending','compressed','ready','failed']`.
- [x] 1.3 Mirror 1.1 + 1.2 in `packages/sync-contract/src/local-synced-schema.ts`: same columns on `merchants`/`outlets`; convert local `assets.status` from untyped `text("status").notNull().default("pending")` to typed enum `['pending','compressed','ready','failed']` matching the API side.

## 2. Schema files — read-path indexes

- [x] 2.1 In `api-synced-schema.ts`, add read-path indexes alongside the existing `*_scope_sync_idx`: `products(merchant_id, is_active, sort_order)`, `categories(merchant_id, sort_order)`, `orders(outlet_id, created_at)`, `order_items(order_id)`, `staff(merchant_id, is_active)`, `outlet_products(outlet_id, product_id)`.
- [x] 2.2 Mirror 2.1 in `local-synced-schema.ts` (same index definitions alongside the existing `*_is_synced_idx`).

## 3. Contract regeneration

- [x] 3.1 Run `bun run generate:sync`. Verify clean output: no `SYNC_SCHEMA_JSON_ONLY_FIELD` warnings, no missing-scope errors, no paired-column drift. Inspect `generated/<date>/sync-contract.json` to confirm the 3 new columns and 6 new indexes are captured.

## 4. API migration

- [x] 4.1 Run `drizzle-kit generate` in `apps/api`. Verify the generated `apps/api/drizzle/0002_*.sql` contains: 3 `ALTER TABLE ADD COLUMN` (merchants.business_type, outlets.use_tax, outlets.tax_percentage) and 6 `CREATE INDEX`. Confirm no `DROP`, `RENAME`, or type-change statements on existing columns.
- [x] 4.2 Run the API vitest suite — expect no regressions (baseline 58 passing).

## 5. Local (Tauri) migration

- [x] 5.1 Hand-write `apps/pos-app/src-tauri/migrations/0001_*.sql` mirroring the API `0002` migration's structural changes: same 3 `ALTER TABLE ADD COLUMN` and same 6 `CREATE INDEX`. Follow the existing `0000_slow_korg.sql` style (snake_case columns, backtick-quoted identifiers, `--> statement-breakpoint` separators). Local side does NOT need to mirror the type-only `assets.status` enum change.
- [x] 5.2 Column-for-column diff: verify `0001_*.sql` and API `0002_*.sql` have identical structural changes (same columns, same types, same defaults, same index definitions), modulo the sync-metadata columns that come from the spread.

## 6. Verify

- [x] 6.1 `tsc --noEmit` in `apps/pos-app` — expect zero errors.
- [x] 6.2 `ultracite check` in `apps/pos-app` — expect zero errors.
- [x] 6.3 vitest in `apps/pos-app` — expect no regressions (baseline 76 passing).
- [x] 6.4 Confirm no remaining `pending_upload` literal in `packages/sync-contract/src/` (the `.wrangler/tmp/` build artifacts are gitignored and regenerate).
