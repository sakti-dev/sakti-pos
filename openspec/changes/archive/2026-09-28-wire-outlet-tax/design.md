# Design: wire-outlet-tax

## Context

- `outlets` already has `useTax`/`taxPercentage` (defaults off/0) in both synced schemas; nothing reads them.
- Sale loop hardcodes `TAX_RATE = 0.11` (`computeTotals` default) → phantom tax on every order.
- `orders` table has NO tax columns; reads back-compute `total − subtotal` and hardcode `taxRate: 0`.
- Settings > Pajak (`section-tax.tsx`) is a dead mock.
- Decision: wire tax + add service charge (common Indonesian restaurant convention, 5%); drop inclusive-tax UI (no column, receipt-math complexity not justified).

## Approach

### 1. Schema (both synced schemas, contract regen, migration)

`outlets` += `useServiceCharge` (bool, default false), `serviceChargePercentage` (integer percent 0–100, default 0).
`orders` += `taxMinorUnits`, `serviceChargeMinorUnits`, `taxPercentage`, `serviceChargePercentage` (all integer NOT NULL DEFAULT 0).

- `bun run generate:sync` → new contract dir `generated/2026-09-28/`; update `include_str!` in `apps/pos-app/src-tauri/src/lib.rs` and the path in `apps/api/src/sync/service.ts`.
- Local migration `apps/pos-app/src-tauri/migrations/0001_outlet-tax-service-charge.sql` (bare `ALTER TABLE ... ADD COLUMN` x6, statement-breakpoints) + drizzle `meta/` journal/snapshot update, following the June playbook (`docs/plans/2026-06-20-pos-schema-extension-design.md`). baresync's runner applies it to existing device DBs — no data loss (user has real orders).
- API dev DB: `bun run db:push` (drizzle-kit push against local Turso), per established flow.

### 2. Sale loop

- `computeTotals(lines, rates?)` where `rates = { taxPercent: number; servicePercent: number }`, both default 0. `tax = round(subtotal * taxPercent / 100)`, `service = round(subtotal * servicePercent / 100)` (service on subtotal, pre-tax — standard bill order: subtotal → service → tax). Totals shape gains `serviceCharge` + both percents. Delete `TAX_RATE` export.
- `loadOutletContext()` also reads the 4 outlet columns; session exposes `outletChargeConfig()` getter. `sale-session.totals()` passes it through.
- `cart-totals.tsx` renders "Pajak (x%)" and "Biaya Layanan (x%)" rows only when amount > 0.

### 3. Persistence & reads

- `persistOrder` writes the 4 new columns (whole-Rupiah → minor units ×100; percents as-is).
- Read mapping (`db/orders.ts` row→order): return stored `tax`, real `taxRate` (as fraction), + `serviceCharge`; stop back-computing. Old rows (all-zero defaults) read as tax 0 — acceptable, they're dev data.

### 4. Settings UI

`section-tax.tsx` becomes functional like section-payment-methods: loads outlet row into local state (toggle + number input pairs for PPN and Biaya Layanan), Simpan → `db/outlets.ts` `saveChargeConfig` (validated 0–100 integers, `writeTransaction` + `enqueueChange`), success toast + Batal reverts. Remove inclusive-tax toggle. "Aktifkan Biaya Layanan" now real.

## Risks & Edge Cases

- **Migration divergence local vs API** → column-for-column diff in verification (June playbook gate).
- **Rounding**: per-line vs aggregate — aggregate only (round once per charge), consistent with existing tax math.
- **Old orders** show 0 tax (truth: baked into total) — noted, accepted for dev data.
- **Percent integer storage**: UI restricts to integers 0–100 (PBJT 10 / PPN 11 / service 5 all integers; no 0.5% use-case for target merchants).

## Migration Plan

Existing device DBs: migration runner adds columns (all defaulted → backfill-free). Fresh installs: new baseline CREATE TABLEs from regenerated contract. API: db:push. Contract manifest/journal regenerated; both sides point at `generated/2026-09-28/`.

## Open Questions

None blocking — scope decided with user (keep tax + service charge, drop inclusive).
