# Project Status & Roadmap

_Last reviewed: 2026-10-01 · branch `main` (all work pushed) · tests: 157 pos-app / 70 api green · no active OpenSpec changes_

## Done & Verified

| Area | State |
|------|-------|
| Production API | Live on Cloudflare Workers — https://nata-pos.hieka.id (Turso `nata-pos-main`, Elysia 2 + AOT) |
| Release APK | `API_URL=... ./scripts/build-apk` → `sakti-pos-prod.apk`; prod device flow verified end-to-end |
| Core POS loop | Catalog, cart, checkout (cash / QRIS static+dynamic), order history, outlet tax — all DB-backed (2026-09-28 wire-core-pos / wire-outlet-tax) |
| QRIS detection | Notification-based auto-detect, device-verified (mismatch / stale / reboot / revoked-access edges), archived |
| Inventory | Ingredients bare catalog + goods-receipt + stocktake |
| Auth | Cloud auth + Google OAuth + staff PIN (June) |
| Printer & receipt | Rust hardware bridge + receipt page + device settings (June) |

## Backlog — In Order

### 1. Cash shifts — ✅ implemented, device-verified (Waydroid + Redmi)
- Gate, setoran close (expected = float + tunai, QRIS excluded), live StatusPlaque/ShiftCard, `closedByStaffId` handover
- Remaining: prod-build smoke (6.4) — bundled into the next deploy

### 2. Dashboard real data — ✅ done
- MoneyHero on live `getTodayOrderStats` (was `createResource`, now sync-invalidated TanStack query)
- Attention list = Stok menipis (`inventory_stocks` ≤ threshold) + Belum tersinkron (`orders.is_synced=0`) — live counts
- StatusPlaque identity real (session staff + outlet name from DB); role labels Kasir/Manager/Pemilik
- Dead mocks deleted (`lib/data/dashboard.ts`, earnings/kpi/attention constants)
- Follow-on: full dashboard spec (revenue trends, top products, category sales, period picker — specced Jun 11, never built)

### 2b. Modifier groups (varian) — ✅ implemented, device-verified
- Shared groups (single/multi, required flag) + options with signed deltas + product links; real Variant tab & forms; POS selection sheet; `order_item_modifiers` snapshots; sync verified end-to-end on Waydroid (offline queue drained, server rows present)

### 2c. Inventory + recipes — ✅ implemented (wire-inventory + product-recipes), device passes pending
- Row-exists stock tracking (balances, receipts, opname, adjustments, checkout decrement), real ingredient CRUD, four-feed Riwayat; recipes (`product_ingredients` + qty-aware product-form section) deduct bahan per unit sold
- Migration histories REBUILT as clean `0000_baseline` files (old meta was hand-mangled) — applied at first install; existing dev installs need clear-data (data re-pulls from dev Turso)
- **Pending user**: device passes (wire-inventory 5.2/5.3 + recipes 5.2/5.3) on a rebuilt APK
- **Pending deploy**: prod Turso needs the post-0003 tables applied manually (`modifier_groups` + `modifier_options` + `product_modifier_groups` + `stock_adjustments` + `product_ingredients` + `ingredient_categories`), bundled with the cash-shifts 6.4 deploy

### 3. Printer smoke test on device
- Implemented June; run a real thermal-printer pass — predates all recent work

### 4. Housekeeping
- Delete merged `elysia-2-migration` branch + stale `feat/*` branches
- Bump Elysia 2.0.0-beta.19 → stable when released

### Deferred by spec
- ~~Ingredients recipe/BOM linkage~~ — delivered by `product-recipes` (see 2c)
