# QRIS Payment Modes & Payment Settings — Design

**Date:** 2026-09-28
**Status:** Approved in session (no implementation code written)
**Scope:** Payment method set, synced merchant payment settings, QRIS core library, Settings walkthrough, payment screen & sale loop
**Decisions locked:** Approach A (single `payment_settings` row per merchant), scan-from-camera/gallery input, show-QR + manual confirm flow, fully wired Settings, guided walkthrough on first enable

---

## Context

The payment surface today is a mock: Settings → Metode Pembayaran renders a hardcoded array (`apps/pos-app/src/lib/data/payment-methods.ts`) with dead toggles and a save button with no handler. The payment screen (`/transactions/payment`) keeps its own independent hardcoded method list (`cash | qris | card | ewallet`, `payment-method.tsx:87-98`) that ignores Settings entirely. There is no persistence for any of it — the sync contract has only `orders.payment_method` (a column recording what was used per order), no config table.

The merchant wants a Tunai + QRIS-only cashier. QRIS splits into two modes:

- **QRIS Statis** — the printed static QR from the merchant's QRIS registration, shown as-is; customer scans and pays; cashier confirms manually.
- **QRIS Dinamis Custom** — generated per sale from the merchant's static QRIS with the cart total embedded (EMVCo tag 54, point-of-initiation 11→12, CRC16-CCITT recomputed), following the approach of [verssache/qris-dinamis](https://github.com/verssache/qris-dinamis) (MIT — core logic ported with attribution).

Kartu (card) and E-Wallet are removed from both surfaces.

## Hard baresync constraints

(verified from `vendor/baresync/.../diagnostics.ts`, same as 2026-06-20 design)

- Single text PK `id`, UUIDv7 `.$defaultFn(() => uuidv7())`
- Scope column registered in `sync.config.ts` — **`payment_settings` uses `merchantId`**
- `...apiSyncColumns()` / `...localSyncColumns()` machinery
- Composite index `(scope, syncUpdatedAt)` on API; `is_synced` index on local
- Mirrored business columns (snake_case-compared) in both schema files
- Column types limited to `text`, `integer`, `real`, `blob`; no `.check()`, no JSON-mode text

## Data model

New synced table `payment_settings`, one row per merchant, added to both
`packages/sync-contract/src/local-synced-schema.ts` and `api-synced-schema.ts`:

| column | type | notes |
| --- | --- | --- |
| `id` | text PK | uuidv7 |
| `merchant_id` | text NOT NULL | FK → merchants.id, scope column |
| `qris_static_payload` | text NULL | decoded EMVCo string of the merchant's QRIS Statis |
| `qris_statis_enabled` | integer bool NOT NULL default 0 | |
| `qris_dinamis_enabled` | integer bool NOT NULL default 0 | |
| sync columns | | `...localSyncColumns()` / `...apiSyncColumns()` |

Indexes: `payment_settings_is_synced_idx` (local), `(merchant_id, sync_updated_at)` (API).
Tunai (cash) is always available and deliberately not stored.

Contract regenerated → 0000 baseline refresh (dev-stage pattern used by the June changes) → migrations on both sides. API side gains a repo + sync-service wiring, mirroring the pattern from commit `1fc4fd3`.

## QRIS core library

`apps/pos-app/src/lib/qris/` — pure TypeScript, zero deps, ported from qris-dinamis with MIT attribution headers:

- `parseTLV` / `parseQRIS` — EMVCo TLV parser, nested tags 26–51 & 62, extracts merchant name (59), city (60), merchant IDs from account info children
- `validateStaticQRIS` — CRC16 verifies, tag 00 = `01`, tag 01 = `11` (static); dynamic QRIS (tag 01 = `12`) is rejected with a specific reason
- `toDynamic(payload, amount)` — tag 01 `11`→`12`, inject tag 54 amount before tag 58, rebuild, recompute CRC16-CCITT (poly 0x1021, init 0xFFFF)
- `calculateCRC16`

New app deps: `qrcode` (render payload → canvas/dataURL) and `jsqr` (decode ImageData from picked image). Camera/gallery capture uses the existing native pick pipeline; `convertFileSrc(path)` → canvas → jsqr.

## Settings — Metode Pembayaran (now functional)

- Tunai row: always on, no toggle
- QRIS Statis / QRIS Dinamis toggles: read + write `payment_settings`
- Toggles cannot be enabled while `qris_static_payload` is NULL — tapping opens the walkthrough instead
- **"Ganti QRIS"** row (visible when payload exists) re-opens the walkthrough at Step 2; existing toggles untouched
- Save is immediate on toggle/walkthrough completion (no dead Simpan/Batal row; the mock buttons are removed)

## QRIS walkthrough (first enable)

Reuses the step-wizard pattern from `pages/onboarding/components/wizard-shell.tsx`, presented as a full-screen modal flow:

1. **Explain** — what QRIS Statis is, that one scan powers both modes, that Dinamis embeds the sale total automatically
2. **Scan** — camera or gallery pick → jsqr decode → `validateStaticQRIS`; plain-language failure feedback (not a QR / CRC invalid / already dynamic) and stays on step until valid
3. **Confirm** — parsed Merchant Name, City, Merchant ID → "Apakah ini QRIS Anda?" → **Ya, Simpan** persists payload + enables the originally-tapped toggle; **Bukan, Ulangi** → back to Step 2

Cancel anywhere: nothing saved, toggles unchanged.

## Payment screen & sale loop

- `PayMethod = "cash" | "qris_static" | "qris_dynamic"` (`lib/sales/types.ts`, `payment-method.tsx`); kartu + ewallet UI, `PaymentDetails.ewallet`, and the ewallet picker are removed
- Method chips render from Settings' enabled set (cash always present); QRIS modes hidden while disabled or payload missing
- QRIS panel: **Statis** renders `qris_static_payload` as-is; **Dinamis** renders `toDynamic(payload, total)`; customer scans, cashier taps **Sudah Dibayar** — paid = total, no change, no amount entry
- Receipt method labels: Tunai / QRIS Statis / QRIS Dinamis
- `orders.payment_method` persists `cash | qris_static | qris_dynamic` (TEXT column — no schema change needed)
- `sale-session.ts`: default stays `cash`; `PaymentDetails` loses `ewallet`, gains nothing (method alone distinguishes)

## Edge cases

- No payload → QRIS toggles un-enable-able (walkthrough intercepts), payment screen shows cash only
- Scan of dynamic QRIS → rejected with explanation (Dinamis must be derived, not scanned)
- Invalid/CRC-broken QR → decode error surfaced on Step 2, retry
- QR render failure → panel falls back to showing the raw payload text
- Offline: settings row is a normal synced row — QRIS works fully offline (all local); sync resolves later

## Testing

- `lib/qris/__test__/` — TLV parse round-trip, CRC16 known vectors, static→dynamic conversion on a real QRIS sample (assert tag 01 = 12, tag 54 = amount, CRC verifies), validator rejections
- `sale-session` tests updated: new methods, `paid = total` for QRIS, no ewallet field
- Settings repo test: upsert single row per merchant, toggle persistence
- Payment screen test: chip set reflects enabled methods; QR panel renders for QRIS modes

## Attribution

QRIS core ported from `verssache/qris-dinamis` (MIT, © 2020). License notice retained in `lib/qris/` source headers and noted in the repo's third-party notices if one exists.
