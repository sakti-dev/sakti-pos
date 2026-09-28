# Proposal: wire-outlet-tax

## Why

The sale loop hardcodes an 11% tax (`TAX_RATE` constant) that is added to every order, while the synced `outlets` schema already carries `useTax`/`taxPercentage` (both defaulting to off/0) — so receipts, totals, and persisted orders show phantom PPN the merchant never configured, and the Settings > Pajak UI is an unwired mock that saves nothing.

## What Changes

- Sale totals (`computeTotals`) consume the outlet's `useTax` + `taxPercentage` instead of the `TAX_RATE` constant; tax is 0 when disabled.
- Add `useServiceCharge` + `serviceChargePercentage` columns to the synced `outlets` table (both schemas + contract regen) and apply service charge in totals the same way as tax.
- Settings > Pajak & Biaya Tambahan becomes functional: edits and persists the outlet row (enable toggles + integer percentage fields), replacing hardcoded values and dead buttons.
- Orders persist the actual `taxMinorUnits` and the rates used; the transactions read path returns real stored tax instead of back-computing `total − subtotal` and hardcoding `taxRate: 0`.
- Remove the "PPN Termasuk Harga" (inclusive tax) toggle from the UI — out of scope by decision; no schema column, receipt-math complexity not justified for target merchants.
- Delete the now-unused exported `TAX_RATE` constant.

## Capabilities

### Modified Capabilities

- `settings` — Pajak & Biaya Tambahan section reads/writes real outlet-scoped tax and service-charge settings.
- `orders` — totals include outlet-configured tax and service charge; persisted orders record the applied amounts; order reads return stored tax.
- `merchant-outlet` (if spec covers outlets columns) — outlets gain service-charge columns.

### New Capabilities

- `outlet-tax` — outlet-scoped tax & service-charge configuration consumed by the sale loop. (Alternatively fold into `settings`/`orders` deltas only — decided at spec time.)
