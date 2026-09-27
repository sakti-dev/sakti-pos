## Context

Specs are ahead of code: `menu` R1–R16, `orders` R2/R5/R7/R11, and `dashboard` R1–R13 all specify DB-backed behavior, but the screens read `lib/data/*.ts` mock arrays (pre-June src-old UI). The tables, sync machinery, and query plumbing (`src/db/index.ts`, `useDrizzleQuery`, write transactions with `enqueueChange`) are proven by staff, auth, and inventory flows. This change is wiring, not redesign.

## Goals / Non-Goals

**Goals:**
- Catalog CRUD on-device, merchant-scoped, sync-enqueued, with product photos through the existing asset pipeline
- Cash-register grid from live products; sale loop persists to `orders` + `order_items`
- Transactions list and dashboard aggregates from real orders
- Fix the `orders.paymentMethod` enum lag (schema vs spec R5)
- Unwire the mock data modules the core loop was leaning on (files kept on disk, unused)

**Non-Goals:**
- Modifier selection UI / `order_item_modifiers` writes (no UI exists; table stays unused)
- Tax persistence on orders (schema has only `totalMinorUnits`; receipt totals render from the in-memory order; schema extension deferred)
- Staff/devices/business-settings rewiring (mock stays; separate change)
- Outlet-product overrides UI (menu R12 spec'd, wiring deferred)
- Inventory stock decrement on sale (inventory domain change)
- Refunds/cancellations (`status` stays `completed`)

## Decisions

### D1: Catalog module mirrors `db/staff.ts`, not a generic repo

One file per domain (`src/db/catalog.ts`) with plain async functions using `getSyncClient().writeTransaction` + `enqueueChange`, exactly like `staff.ts` and `payment-settings.ts`. No repository abstraction — the drizzle tables are the contract, and the existing patterns are simple enough to copy.

### D2: Product photos reuse the staged-image flow as spec'd (`menu` R6/R11)

The product form already stages a picked image; on submit, save the product row first, then enqueue the background photo job targeting `productImage` (existing pipeline). No new asset code — only the call-site wiring. The spec's toast ("Foto akan diproses di background") is already implemented in the form.

### D3: `commit()` becomes async; the payment page awaits it

`sale-session.commit(): Promise<CompletedOrder>`. The Drizzle write (orders + items + enqueues) happens inside the awaited call; the returned in-memory order still feeds the receipt immediately. A failure to persist surfaces as a rejected promise — the payment page shows an error and does NOT navigate, so no sale completes without a persisted row (offline-first: the write is local, sync happens later).

### D4: Money converts at the persistence seam

The in-app sale loop speaks whole-Rupiah numbers (as today); the repository multiplies by 100 into `*MinorUnits` columns on write and divides on read, keeping the AGENTS.md minor-units convention contained in `db/orders.ts`.

### D5: `orderNumber` keeps the existing generator

`generateOrderId()` already produces the spec'd daily-sequence format (orders R4). The uuidv7 `orders.id` is the PK; `orderNumber` is the human-facing unique field — unchanged behavior, now persisted.

### D6: Enum fix follows the established regen rhythm

Extend the paymentMethod enum in both schema files → `bun run generate:sync` → fresh 0000 baselines on both sides → dev data clear (the QRIS change just exercised this path end-to-end; `scripts/dev` option 2 handles cleanup).

### D7: Staff/register attribution best-effort

`orders.staffId` and `registerId` are nullable; wire `registerId` from `currentRegisterId()` and `staffId` from the claimed staff session when available, else null. No new auth plumbing.

## Risks / Trade-offs

- **Async commit changes the payment button contract** — the confirm handler must handle rejection; mitigation: single call-site (payment page) + error state on the button.
- **Dashboard period queries** on SQLite are timestamp-text scans; volume is small (single outlet), and the `(outlet_id, created_at)` index from June's hardening covers it.
- **Data clear again** — acceptable dev-stage cost, same as the QRIS change.

## Migration Plan

1. Enum fix in both schemas → regen → API + local baseline refresh
2. `db/catalog.ts` + tests → catalog UI rewire → device smoke test (create product/category, photo upload)
3. `db/orders.ts` repository + async commit → payment/receipt smoke test
4. Transactions list + dashboard rewire → mock deletion → full verification
