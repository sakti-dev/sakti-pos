# Project Status & Roadmap

_Last reviewed: 2026-09-29 · branch `main` (all work pushed) · tests: 131 pos-app / 70 api green · no active OpenSpec changes_

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
- Remaining: prod-build smoke (6.4) + archive the OpenSpec change

### 2. Dashboard real data
- Home money-hero (`Rp 2.450.000`), payment breakdown, attention list — all mock constants (`home/lib/data.ts`, `lib/data/dashboard`)
- Orders are real now → wire today's-sales / attention counts to SQLite
- Follow-on: full dashboard spec (revenue trends, top products, category sales, period picker — specced Jun 11, never built)

### 3. Printer smoke test on device
- Implemented June; run a real thermal-printer pass — predates all recent work

### 4. Housekeeping
- Delete merged `elysia-2-migration` branch + stale `feat/*` branches
- Bump Elysia 2.0.0-beta.19 → stable when released

### Deferred by spec
- Ingredients recipe/BOM linkage (explicitly deferred in `openspec/specs/ingredients/spec.md`)
