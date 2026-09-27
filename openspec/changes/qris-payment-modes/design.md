## Context

Payment method configuration today exists nowhere: the Settings section is a static array (`lib/data/payment-methods.ts`), the payment screen hardcodes its own list, and the sync contract has no config table. The merchant's decision: Tunai + two QRIS modes only. QRIS Dinamis is derived client-side from the merchant's registered static QRIS — no payment gateway integration; the app never verifies a QRIS payment server-side, the cashier confirms visually.

The static→dynamic derivation follows [verssache/qris-dinamis](https://github.com/verssache/qris-dinamis) (MIT): parse the EMVCo TLV string, flip Point of Initiation (tag 01) from `11` to `12`, inject Transaction Amount (tag 54) before Country Code (tag 58), rebuild the string, recompute CRC16-CCITT (poly 0x1021, init 0xFFFF). The core is ~260 lines of pure TS.

Design grounding: `docs/plans/2026-09-28-qris-payment-design.md` (session-approved) and `openspec/DATABASE-DESIGN.md` (baresync table conventions).

## Goals / Non-Goals

**Goals:**
- One synced `payment_settings` row per merchant holding the decoded static QRIS payload + two enable flags
- QRIS core as pure, dependency-free, tested functions
- First-enable walkthrough: Explain → Scan → Confirm, with validation gating at every step
- Payment screen renders the enabled set only; QRIS Dinamis embeds the cart total; both QRIS modes confirm manually with paid = total
- Remove Kartu and E-Wallet everywhere (screen, types, receipt)

**Non-Goals:**
- No payment-gateway/ acquirer integration, no server-side payment verification or notification webhooks
- No QRIS fee/tip injection (tags 55–57) — amount only
- No printing the QRIS on receipts (printer integration unchanged)
- No multi-QRIS support (one payload per merchant; replace via walkthrough)
- No re-enabling Kartu/E-Wallet through config — removed from the type system; returning them is a future schema change
- No refund flows for QRIS

## Decisions

### D1: Single-row `payment_settings` over per-method rows (Approach A)

One row per merchant with typed columns (`qrisStaticPayload` text, two boolean flags). Alternative: a `payment_methods` table with one row per method and a JSON config column — rejected: untyped payload, more sync churn for 3 fixed methods, and cash doesn't need a row at all. If methods grow (Kartu returns), that's an explicit schema change, which is the repo's normal cadence.

### D2: Store the decoded payload string, not the QR image

The asset pipeline is for photos; a QRIS is a ~200-char text payload. Storing the string keeps the row tiny, works offline, and lets both modes render a fresh QR locally (`qrcode` lib) — Statis as-is, Dinamis after conversion. No asset sync dependency for payments.

### D3: Decode via jsqr on a canvas, capture via existing native pick

Camera/gallery capture reuses the existing pick pipeline (`lib/assets/`); the picked image loads via `convertFileSrc(path)` into a canvas and `jsqr` extracts the QRIS string. No new native code, no new permissions surface.

### D4: Validation gates (walkthrough Step 2)

A scanned code is accepted only if: it decodes as a QR, the CRC16 verifies, tag 00 = `01`, and tag 01 = `11` (static). A dynamic QRIS (tag 01 = `12`) is rejected with an explanation — Dinamis must be derived per-sale, never scanned. Failures stay on Step 2 with plain-language Indonesian errors.

### D5: QRIS confirm = manual "Sudah Dibayar", paid = total

No amount entry, no change calculation. `CompletedOrder.paid = total`, `change = 0`. The cashier watches the customer's scanner/app; this matches the offline-first reality (no acquirer API to poll). Same rule for both QRIS modes; Statis simply doesn't embed the amount.

### D6: `PayMethod` values are persisted verbatim

`orders.payment_method` (TEXT) stores `cash | qris_static | qris_dynamic`. No enum constraint in the schema, no legacy-value migration — the old `qris`/`card`/`ewallet` values only exist on dev devices, and dev-stage data clears are the established pattern (the 0000 baseline refresh in this change requires one anyway).

### D7: 0000 baseline refresh, not an 0001 migration

Dev-stage only, consistent with June's changes: the local migration baseline is regenerated after the contract changes. The June session already paid down the operational cost of this pattern (stale-asset accumulation now cleaned by `scripts/dev`). Production data does not exist yet.

## Risks / Trade-offs

- **Fraud risk (accepted):** manual confirmation means a cashier can mark an unpaid sale as paid. Mitigation is procedural (cashier watches the scan), not technical — identical to accepting cash without a detector.
- **jsqr decode quality** on crumpled/dark printed QRIS: camera capture usually beats gallery screenshots; retry loop on Step 2 is cheap. Fallback: none needed — rescan.
- **QRIS payload validity:** we validate structure, not merchant registration (no Bank Indonesia directory lookup — out of scope, offline-first).

## Migration Plan

1. Add table to both synced schemas → register in `sync.config.ts` → `bun run generate:sync` (clean: no warnings, no drift)
2. API: `drizzle-kit generate` migration
3. Local: regenerate 0000 baseline (`drizzle-kit generate` in pos-app), delete the stale baseline copy from `gen/android` assets (script now handles this)
4. Dev device data clear before first run after this change (option 2 in `scripts/dev`)
