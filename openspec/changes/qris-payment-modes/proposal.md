## Why

The payment surface is a mock. Settings → Metode Pembayaran renders a hardcoded array (`apps/pos-app/src/lib/data/payment-methods.ts`) with dead toggles and a save button that has no handler. The payment screen (`/transactions/payment`) keeps its own independent hardcoded method list (`cash | qris | card | ewallet`) that ignores Settings entirely, and the sync contract has no config table — only the `orders.payment_method` record column.

The merchant wants a Tunai + QRIS-only cashier: remove Kartu and E-Wallet, split QRIS into **QRIS Statis** (show the printed static QR; cashier confirms) and **QRIS Dinamis Custom** (generate a dynamic QRIS per sale from the merchant's static QRIS with the total embedded, following [verssache/qris-dinamis](https://github.com/verssache/qris-dinamis), MIT). One scan of the merchant's static QRIS powers both modes.

This implements `docs/plans/2026-09-28-qris-payment-design.md`.

## What Changes

1. **New synced table `payment_settings`** (one row per merchant, scope `merchantId`): `qrisStaticPayload` (decoded EMVCo string), `qrisStatisEnabled`, `qrisDinamisEnabled`, standard baresync machinery on both paired schemas. Registered in `sync.config.ts`, contract regenerated, 0000 baseline migration refreshed, API repo + sync-service wiring (mirrors the `1fc4fd3` pattern).
2. **QRIS core library** `apps/pos-app/src/lib/qris/` — pure TS port of the qris-dinamis core (TLV parser, CRC16-CCITT, static→dynamic converter, validator) with MIT attribution. New deps: `qrcode` (render), `jsqr` (decode from camera/gallery via existing native pick pipeline).
3. **Settings → Metode Pembayaran becomes functional** — Tunai always-on row, QRIS Statis/Dinamis toggles persisted to `payment_settings`, dead Simpan/Batal removed, "Ganti QRIS" replace entry.
4. **QRIS walkthrough** (reuses `wizard-shell.tsx` step pattern) — tapping a QRIS toggle with no payload saved opens: Explain → Scan (camera/gallery, jsqr decode, validation with plain-language errors) → Confirm parsed merchant identity → save + enable. Cancel saves nothing.
5. **Payment screen** — `PayMethod = "cash" | "qris_static" | "qris_dynamic"`; Kartu + E-Wallet UI and `PaymentDetails.ewallet` removed; method chips reflect Settings' enabled set; QRIS panel renders QR (Dinamis = `toDynamic(payload, total)`); "Sudah Dibayar" manual confirm (paid = total, no change); receipt labels Tunai / QRIS Statis / QRIS Dinamis; `orders.payment_method` persists the new values.

## Capabilities

### New Capabilities
- `qris`: QRIS payload handling — EMVCo TLV parse, static-QRIS validation, static→dynamic conversion with amount embedding, QR rendering on the payment screen, paid-in-full manual confirmation.
- `payment-settings`: synced merchant payment configuration — the `payment_settings` table, single-row-per-merchant upsert semantics, scan-time payload capture.

### Modified Capabilities
- `settings`: payment methods section becomes functional — real toggles (QRIS modes), QRIS payload required before enabling, guided walkthrough on first enable, "Ganti QRIS" replacement flow.
- `orders`: `payment_method` allowed values become `cash | qris_static | qris_dynamic`.

## Impact

- **Schema files:** `packages/sync-contract/src/{api,local}-synced-schema.ts` (+1 table each, mirrored)
- **Contract config:** `packages/sync-contract/sync.config.ts` (+1 registration)
- **Contract artifacts:** `generated/<date>/` regenerated; local 0000 baseline migration refreshed (dev-stage pattern — requires device data clear during development); API migration generated
- **API:** new payment-settings repo + sync-service registration (`apps/api`)
- **App:** `lib/qris/` (new), `lib/data/payment-methods.ts` (deleted), `pages/setting/components/section-payment-methods.tsx` (rewritten), QRIS walkthrough components (new), `pages/transactions/payment/` (method set + QR panel), `lib/sales/types.ts` + `sale-session.ts`, receipt labels
- **Deps:** `+qrcode`, `+jsqr` (`apps/pos-app`)
- **No changes** to the 10 core synced tables or the other 8 domain tables — additive only
