## 1. QRIS core library (pure, tested)

- [ ] 1.1 Add `qrcode` and `jsqr` deps to `apps/pos-app/package.json` (`bun install`)
- [ ] 1.2 Create `apps/pos-app/src/lib/qris/crc16.ts` — CRC16-CCITT (poly 0x1021, init 0xFFFF), ported from qris-dinamis with MIT attribution header
- [ ] 1.3 Create `lib/qris/parser.ts` — `parseTLV` (nested tags 26–51, 62) and `parseQRIS` (method, merchant name 59, city 60, account info children)
- [ ] 1.4 Create `lib/qris/validator.ts` — `validateStaticQRIS` returning typed result: ok | not-a-qr | invalid-crc | already-dynamic (tag 01 = `12`) | bad-format (tag 00 ≠ `01`)
- [ ] 1.5 Create `lib/qris/converter.ts` — `toDynamic(payload, amount)`: tag 01 `11`→`12`, insert tag 54 before tag 58, never inject 55–57, recompute tag 63
- [ ] 1.6 Create `lib/qris/index.ts` barrel + `lib/qris/__test__/qris.test.ts`: CRC16 known vectors, TLV round-trip, real-sample static→dynamic conversion (assert tag 01/54 + CRC verifies), all validator rejection paths
- [ ] 1.7 `bun test apps/pos-app/src/lib/qris/` green

## 2. Synced schema — payment_settings table

- [ ] 2.1 `packages/sync-contract/src/api-synced-schema.ts`: add `paymentSettings` (scope `merchantId`) — `id` UUIDv7, `merchantId` notNull, `qrisStaticPayload` text nullable, `qrisStatisEnabled`/`qrisDinamisEnabled` integer boolean default false, `...apiSyncColumns()`, `(merchant_id, sync_updated_at)` index
- [ ] 2.2 `packages/sync-contract/src/local-synced-schema.ts`: mirror with `localSyncColumns()` + `payment_settings_is_synced_idx`, soft-ref only (no hard FK), same columns/enums/defaults
- [ ] 2.3 `packages/sync-contract/sync.config.ts`: register `paymentSettings: { scopeColumn: "merchantId" }`
- [ ] 2.4 Run `bun run generate:sync` — verify zero warnings (no JSON-field, no drift, no missing scope); inspect `generated/<date>/sync-contract.json` includes the table
- [ ] 2.5 API migration: `drizzle-kit generate` in `apps/api`; verify additive-only (single CREATE TABLE + indexes)
- [ ] 2.6 Local migration: regenerate the 0000 baseline in `apps/pos-app` (`drizzle-kit generate`); verify old baseline file is fully replaced (no second 000x file); stale copies in `gen/android` assets are cleaned by `scripts/dev`

## 3. API — repo + sync wiring

- [ ] 3.1 Add `payment_settings` repository in `apps/api` (merchant-scoped get/upsert), mirroring an existing simple repo
- [ ] 3.2 Register the table in the API sync service push/pull processing (pattern of commit `1fc4fd3`)
- [ ] 3.3 API tests: repo upsert + sync round-trip for the new table (`bun test apps/api/...` scoped)

## 4. App — settings store & repo

- [ ] 4.1 Create `lib/payment-settings/` repo: `getPaymentSettings()`, `upsertPaymentSettings({ payload?, statisEnabled?, dinamisEnabled? })` against the local drizzle DB (create-if-absent single row for active merchant), marking `isSynced = false` on write
- [ ] 4.2 Repo tests: insert-on-first-write, toggle update, payload replace

## 5. App — Settings UI + walkthrough

- [ ] 5.1 Rewrite `pages/setting/components/section-payment-methods.tsx`: Tunai always-on row (no toggle), QRIS Statis/Dinamis toggles bound to repo, remove Simpan/Batal dead buttons, delete `lib/data/payment-methods.ts`
- [ ] 5.2 Toggle-without-payload opens the walkthrough instead of flipping; with payload, flips persist immediately
- [ ] 5.3 Create walkthrough components (reuse `wizard-shell` step pattern): Step 1 Explain, Step 2 Scan (native pick → canvas → jsqr → validate, plain-language errors, retry loop), Step 3 Confirm (parsed name/city/merchant ID; Ya, Simpan / Bukan, Ulangi)
- [ ] 5.4 "Ganti QRIS" row when payload exists → walkthrough starting at Step 2, flags untouched until confirm
- [ ] 5.5 Walkthrough logs investigation prefix `[JS] [SETTINGS:QRIS_SCAN_*]` per APP-LOGGING-DOCS.md; update the doc + `LOG_FILTER` in `logs/capture-adb-logcat.sh`

## 6. App — payment screen & sale loop

- [ ] 6.1 `lib/sales/types.ts`: `PayMethod = "cash" | "qris_static" | "qris_dynamic"`; remove `PaymentDetails.ewallet`
- [ ] 6.2 `payment-method.tsx`: new method chips (Tunai/QRIS Statis/QRIS Dinamis) filtered by enabled set from `payment_settings`; remove kartu + ewallet UI and the ewallet picker
- [ ] 6.3 QR panel component: Statis renders payload as-is; Dinamis renders `toDynamic(payload, total)`; render failure falls back to raw payload text; manual "Sudah Dibayar" (paid = total, change = 0)
- [ ] 6.4 `sale-session.ts` + `payment/index.tsx`: QRIS confirm path sets method + paid = total; remove ewallet plumbing
- [ ] 6.5 Receipt labels: Tunai / QRIS Statis / QRIS Dinamis; `orders.payment_method` persists new values
- [ ] 6.6 Update `sale-session` tests: new methods, paid=total for QRIS, ewallet cases removed; `bun test` scoped green

## 7. Verify

- [ ] 7.1 `bun x ultracite check` clean; `bun run typecheck` (or scoped tsc) clean
- [ ] 7.2 Full scoped test pass: `bun test apps/pos-app/src/lib/qris apps/pos-app/src/lib/sales apps/pos-app/src/lib/payment-settings` + API sync tests
- [ ] 7.3 Device run (`bun app:dev`, option 2 — data clear required by baseline refresh): Settings → enable QRIS Statis → walkthrough happy path → payment screen shows QR → confirm sale → receipt label correct
- [ ] 7.4 Edge cases on device: scan non-QRIS image, scan dynamic QRIS (rejection copy), offline toggle + QRIS sale, QRIS disabled → chips hidden, cancel walkthrough → nothing saved
