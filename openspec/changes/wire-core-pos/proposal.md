## Why

The schema foundation landed in June (18 synced tables) and the specs (`menu`, `orders`, `dashboard`) already specify DB-backed behavior — but the catalog, sale loop, transactions list, and dashboard screens still render mock arrays from `lib/data/*.ts`. After a data clear, the POS shows phantom products and orders that never existed. This change closes the spec-vs-code gap: the core POS loop runs entirely on the local synced database.

## What Changes

1. **Schema enum fix** — `orders.paymentMethod` still allows only `["cash","qris"]` in both synced schemas; extend to `["cash","qris_static","qris_dynamic"]` (spec `orders` R5 already mandates the three values). Contract regenerated, both baselines refreshed (dev data clear).
2. **Catalog domain module** — `src/db/catalog.ts` (categories + products CRUD per `menu` R1–R13): merchant-scoped reads, write-transaction inserts/updates with sync enqueue, soft deletes, staged-image handoff to the existing photo pipeline on product create/update.
3. **Catalog UI rewire** — menu index, product form, category form, and tab components consume the catalog module (TanStack query + invalidation) instead of `lib/data/catalog.ts`.
4. **Cash-register grid rewire** — the sale screen's product grid reads live products (`orders` R2: Product Browsing and Filtering), grouped/filtered by category.
5. **Order persistence** — replace `InMemoryOrderRepository` with a Drizzle-backed implementation (`orders` R11): `sale-session.commit()` becomes async and writes an `orders` row (orderNumber, totals in minor units, paymentMethod, paid/change, status `completed`, outletId scope, registerId/staffId when known) plus `order_items` snapshot rows, each sync-enqueued. Receipt continues to render from the returned in-memory order.
6. **Transactions list + dashboard rewire** — the transactions page and home dashboard aggregate from `orders`/`order_items` (period grouping per `dashboard` R11) instead of mock lists.
7. **Mock unwiring** — screens stop importing `lib/data/catalog.ts`, `lib/data/transactions.ts`, `lib/data/dashboard.ts`, and `pages/home/lib/data.ts`; the files stay on disk for reference/seed use. Staff/devices/regions mocks remain as-is (out of scope).

## Capabilities

No spec deltas — this change implements already-spec'd behavior (`menu`, `orders`, `dashboard`, `assets` for product images). `skip_specs: true` is set for that reason.

## Impact

- **Schema files:** `packages/sync-contract/src/{api,local}-synced-schema.ts` (enum values only), `sync.config.ts` unchanged, contract regenerated → both 0000 baselines refreshed (dev devices need a data clear)
- **App:** new `src/db/catalog.ts` + `src/db/orders.ts`; rewires `pages/catalog/*`, `pages/transactions/cash-register`, `pages/transactions/index`, `pages/home/*`, `lib/sales/sale-session.ts` (async commit), `lib/sales/order-repository.ts` (Drizzle impl)
- **Kept but unused:** `lib/data/{catalog,transactions,dashboard}.ts`, `pages/home/lib/data.ts` (no screen imports)
- **No API changes** beyond the regenerated contract (sync service already handles orders/order_items)
