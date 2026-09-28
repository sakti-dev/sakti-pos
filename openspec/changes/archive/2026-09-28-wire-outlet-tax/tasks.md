## 1. Schema & contract

- [x] 1.1 Add `useServiceCharge` + `serviceChargePercentage` to `outlets` in both synced schemas
- [x] 1.2 Add `taxMinorUnits`, `serviceChargeMinorUnits`, `taxPercentage`, `serviceChargePercentage` to `orders` in both synced schemas
- [x] 1.3 `bun run generate:sync`; verify SQL delta is 6 ADD COLUMNs; point `lib.rs` + `apps/api/src/sync/service.ts` at `generated/2026-09-28/`
- [x] 1.4 Write `migrations/0001_outlet-tax-service-charge.sql` + update drizzle `meta/`; `bun run db:push` for API dev DB
- [x] 1.5 Device: confirm migration applies to existing DB without data loss

## 2. Sale loop

- [x] 2.1 `computeTotals(lines, rates?)` with `{taxPercent, servicePercent}` (defaults 0); delete `TAX_RATE`
- [x] 2.2 `loadOutletContext` reads charge config; session exposes `outletChargeConfig()`
- [x] 2.3 `sale-session.totals()` consumes config; unit tests (off, tax-only, tax+service, rounding)
- [x] 2.4 `cart-totals.tsx` conditional Pajak/Biaya Layanan rows

## 3. Persistence & reads

- [x] 3.1 `persistOrder` stores tax/service amounts + percents
- [x] 3.2 Read path returns stored tax + real rate + service; remove back-compute and `taxRate: 0`
- [x] 3.3 Repo/roundtrip tests updated

## 4. Settings UI

- [x] 4.1 `section-tax.tsx` functional (load state, validate 0–100, Simpan/Batal); remove inclusive toggle
- [x] 4.2 `db/outlets.ts` `saveChargeConfig` (writeTransaction + enqueueChange) + tests

## 5. Receipts & lists

- [x] 5.1 Receipt shows charge breakdown lines when > 0

## 6. Verification

- [x] 6.1 vitest + tsc + ultracite green
- [x] 6.2 Device: tax off → clean totals; enable 10% + 5% → cart/receipt/order row correct; restart → persists; syncs to API

## 7. Sync poison-row hardening (incident 2026-09-28)

- [x] 7.1 saveChargeConfig refuses to enqueue updates when the outlet row is missing locally (phantom-update guard)
- [x] 7.2 Onboarding persists charge config only after the first successful syncNow
- [x] 7.3 baresync pull: batch FK failure falls back to per-row apply, quarantine-skips poison rows (vendor patch + test)
- [x] 7.4 baresync push: outbox entries with no local row are quarantined + marked synced instead of erroring forever (vendor patch + test)
- [x] 7.5 Purge dev-API orphaned rows (register/staff -> missing outlet) + duplicate owner staff

## 8. Sync registry correctness (incident 2026-09-28 #2)

- [x] 8.1 Registry keys renamed to contract table names (snake_case); regression test asserts registry ≡ contract
- [x] 8.2 Outlet-scoped tables (11) pull via join on outlets.merchantId — scope fix (orders/registers never pulled before)
- [x] 8.3 orders/outlets handlers learn tax & service-charge columns (buildRow + upsert)
- [x] 8.4 order_number uniqueness scoped per outlet (drop global unique, add unique(outlet_id, order_number)); migration 0002 both sides + contract regen
- [x] 8.5 Dev-server data repair (orphaned sale + test rows) and device push verified draining (dirty=0)
