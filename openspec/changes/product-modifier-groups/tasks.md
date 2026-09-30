# Tasks

## 1. Schema + sync foundation

- [x] 1.1 Add `modifier_groups`, `modifier_options`, `product_modifier_groups` to `api-synced-schema.ts` and `local-synced-schema.ts` (design.md column shapes; merchantId scope)
- [x] 1.2 Register the three tables in `sync.config.ts`; `bun run generate:sync`; repoint `lib.rs` contract include and api service imports to the new dated contract
- [x] 1.3 Hand-write paired migrations `0004_modifier_groups.sql` (+ journal/snapshots) for `apps/pos-app/src-tauri/migrations` and `apps/api/drizzle`; apply to dev Turso (prod at deploy)
- [x] 1.4 Server repository: buildRow/readLatestRow/readRows/softDeleteRow/upsertRow for the three tables (validation helpers per column type; conflict sets include all business columns); groups→options→links in push order, reversed for deletes
- [ ] 1.5 Verify round-trip: local write pushes (200, outbox drains), second device/server DB reflects rows

## 2. Catalog data layer

- [x] 2.1 `apps/pos-app/src/db/modifier-groups.ts`: list (groups + options + link counts), get by id, create/update/soft-delete group with options, attach/detach product links — all writes via `writeTransaction` + `enqueueChange`
- [x] 2.2 Unit tests for the repo (pure predicates + write-shape, following `cash-shifts.test.ts` pattern)

## 3. Catalog UI

- [ ] 3.1 Variant tab on real queries (TanStack `["drizzle","modifier-groups",…]`), search across group/option/product, empty state; delete mock `variants` usage
- [ ] 3.2 Variant form (create/edit): name, selection type, required toggle, options editor (label + price delta), product attachment multi-select
- [ ] 3.3 Product form: attached-groups section with add/remove
- [ ] 3.4 Delete superseded mocks from `lib/data/catalog.ts` (variants + helpers); grep for other importers (inventory/history, retail-tab) and rewire or remove

## 4. POS selection + checkout

- [ ] 4.1 Selection sheet (AdaptiveDialog) per design.md rules: preselect first option for required single, at-least-one for required multi, "Tanpa <group>" for optional single, free skip for optional multi; groups in link order
- [ ] 4.2 Line pricing: base + Σ deltas; sheet confirm writes cart line with chosen options
- [ ] 4.3 Checkout persists choices to `order_item_modifiers` (group name, label, delta, quantity 1)
- [ ] 4.4 Line-item surfaces (cart list, order detail, receipt renderer) render chosen modifiers under the parent line

## 5. Verification

- [ ] 5.1 `bun run test` (pos-app + api) green; typecheck + ultracite clean
- [ ] 5.2 Device pass (Waydroid/Redmi): create group (multi, optional) + attach → sell product with multi toppings → line price correct → checkout → `order_item_modifiers` rows in local DB → sync 200 → rows in Turso → receipt shows modifiers
- [ ] 5.3 Offline pass: airplane-mode sale with modifiers persists and syncs when reconnected
- [ ] 5.4 Document any new `[JS] [DOMAIN:ACTION]` log prefixes in `openspec/DOCUMENTED-LOG-PREFIX.md` + `logs/capture-adb-logcat.sh` LOG_FILTER
