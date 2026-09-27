## 1. Schema enum fix + baselines

- [ ] 1.1 In `packages/sync-contract/src/{api,local}-synced-schema.ts`, extend `orders.paymentMethod` enum to `["cash", "qris", "qris_static", "qris_dynamic"]` (keep legacy `qris` for old rows), both files mirrored
- [ ] 1.2 Run `bun run generate:sync`; verify clean output and `payment_method` values in `generated/<date>/sync-contract.json`; update contract path references (`lib.rs`, `apps/api/src/sync/service.ts`)
- [ ] 1.3 Refresh both baselines: API `drizzle-kit generate` (delete prior 0000 + journal first), local `drizzle-kit generate` in pos-app; clean stale asset copies; `bun run db:push` against the dev API DB

## 2. Catalog domain module

- [ ] 2.1 Create `apps/pos-app/src/db/catalog.ts` — categories: `getCategories`, `createCategory`, `updateCategory`, `softDeleteCategory`, `toggleCategoryActive`; products: `getProducts(filterCategoryId?)`, `createProduct`, `updateProduct`, `softDeleteProduct`, `toggleProductActive` — merchant-scoped, `writeTransaction` + `enqueueChange`, soft deletes set `deletedAt` + `isSynced: false` (menu R1–R10)
- [ ] 2.2 Product create/update hands the staged image to the existing photo pipeline targeting `productImage` after the row write (menu R6/R11)
- [ ] 2.3 `src/db/__test__/catalog.test.ts`: insert/update/soft-delete/list-filter behavior with mocked db + sync client (pattern: payment-settings.test.ts)

## 3. Catalog UI rewire

- [ ] 3.1 Menu index + category tab + product tab read via `useDrizzleQuery` from `db/catalog.ts`; category filter + product-count-by-category preserved (menu R7, R13)
- [ ] 3.2 Product form + category form submit through `createProduct`/`updateProduct`/`createCategory`/`updateCategory`; validation copy unchanged; navigate-back behavior preserved
- [ ] 3.3 Query invalidation after mutations (refetch lists on successful create/update/delete)

## 4. Cash-register grid rewire

- [ ] 4.1 `pages/transactions/cash-register` product grid reads live products grouped by category (orders R2), replacing `cashRegisterProducts` from `lib/data/transactions.ts`
- [ ] 4.2 Empty state when no products exist (post-clear) with a hint to the catalog screen

## 5. Order persistence

- [ ] 5.1 Create `apps/pos-app/src/db/orders.ts` — `persistOrder(order: CompletedOrder)`: writes `orders` row (orderNumber, totalMinorUnits, paymentMethod, amountPaid/changeMinorUnits, status `completed`, outletId, registerId/staffId best-effort) + `order_items` rows (productName/qty/unitPrice snapshot), each in one `writeTransaction` with `enqueueChange` (orders R11)
- [ ] 5.2 Money conversion ×100/÷100 contained in `db/orders.ts` (D4)
- [ ] 5.3 `sale-session.commit()` becomes `async`, delegates to the Drizzle repository (swap `setOrderRepository` binding at module init); keep `InMemoryOrderRepository` for tests
- [ ] 5.4 Payment page `confirmPayment` awaits commit; on rejection shows error state and does not navigate
- [ ] 5.5 `src/db/__test__/orders.test.ts`: persistOrder row mapping (minor units, enum values incl. `qris_static`/`qris_dynamic`), item snapshots; `sale-session` tests updated for async commit

## 6. Transactions list + dashboard rewire

- [ ] 6.1 `pages/transactions/index` lists persisted orders (orders R7 Order History) — newest-first, payment method + totals, outlet-scoped
- [ ] 6.2 Home dashboard aggregates from `orders` in the selected period (dashboard R2–R8, R11 timezone grouping): revenue, order count, average, previous-period delta, payment-method breakdown, top products from `order_items`
- [ ] 6.3 Unwire `lib/data/catalog.ts`, `lib/data/transactions.ts`, `lib/data/dashboard.ts`, `pages/home/lib/data.ts` (imports reach zero) but KEEP the files on disk for future reference/seed use

## 7. Verify

- [ ] 7.1 `bun x ultracite check` clean on changed paths; `bun run typecheck` clean (root turbo)
- [ ] 7.2 `bunx vitest run` green in pos-app; `bun test` green in api
- [ ] 7.3 Device run (`bun app:dev`, option 2 — data clear from baseline refresh): create category + product with photo → product appears in catalog and cash-register grid → complete a Tunai sale → receipt renders → transaction appears in list → dashboard totals update
- [ ] 7.4 QRIS regression on device: QRIS Dinamis sale persists `payment_method = 'qris_dynamic'` and appears in the payment-method breakdown
- [ ] 7.5 Edge cases: sale with empty product catalog (empty states), commit failure path (simulate by disconnecting? — local write only; verify error state via forced invalid method), offline create → sync after reconnect
