# Product Form Cards Redesign — Design

Date: 2026-10-04
Status: Approved (user confirmed wireframe + two decisions)

## Goal

Restructure the Tambah/Edit Produk form (`apps/pos-app/src/pages/catalog/product-form.tsx`)
from flat sections into four labeled cards, and replace the implicit
"Stok Minimum (opsional) = mulai pantau stok" convention with an explicit
Tidak Terbatas / Terbatas radio.

## Layout

Same `SubPageShell`, four `Card` sections (existing `components/ui/card.tsx`),
stacked vertically. Internal widgets are reused unchanged:

1. **Detail Produk** — foto (120px upload), nama, kategori (PickerField),
   harga (NumberField).
2. **Varian** — `AttachmentField` (modifier groups) unchanged.
3. **Stok** — new radio + conditional fields (below).
4. **Resep** — `RecipeField` unchanged + existing helper text.

Actions (Batal / Simpan) stay at the bottom.

## Stok Card State Model

Radio maps 1:1 to the inventory_stocks row-exists tracking convention.
No schema change.

| State | On save |
|---|---|
| New + Tidak terbatas (default) | nothing (today's behavior) |
| New + Terbatas | seed balance via `setStockCount(tx, "product", id, initial)` → `setLowStockThreshold(id, threshold)` |
| Edit + Terbatas | threshold only; Stok saat ini is read-only + "Atur via Opname" link to the stocktake screen |
| Edit, switch → Terbatas | same as New + Terbatas (no live balance row exists) |
| Edit, switch → Tidak terbatas | `stopTracking` (soft-delete; history preserved, inline hint shown) |

Key decisions (user-approved):

- Terbatas reveals **Stok saat ini** (default 0, seeds the balance) **and**
  **Stok minimum** (alert threshold).
- In edit mode Stok saat ini is **read-only** with an "Atur via Opname"
  link — balances only change via opname/receipt/adjustment so the audit
  trail stays clean.

Implementation notes:

- `setStockCount` (db/inventory.ts:320) already creates the balance row when
  absent — it is the single seed path; no separate `startTracking` call.
- Order matters: seed **before** `setLowStockThreshold` (it throws when the
  item is untracked).
- Edit-mode stock display comes from `getProductStock` (already loaded).
- Stop-tracking shows a hint that history stays in Riwayat, no confirm dialog.

## Save Pipeline

`handleSave` keeps the current order: product upsert → modifier groups →
stock steps (mode-dependent) → recipe rows. Stock-step failures remain
non-blocking (existing convention: toast/log via POS domain logger as today,
`applyThreshold` already swallows). Prefer existing logged paths
(`INVENTORY:TRACKING_STARTED/STOPPED`); if the seed needs a new prefix,
update `openspec/APP-LOGGING-DOCS.md` and `LOG_FILTER` in
`logs/capture-adb-logcat.sh` in the same change.

## Validation

Terbatas requires numeric Stok saat ini ≥ 0 and Stok minimum ≥ 0; invalid
input toasts (existing pattern). Empty Stok saat ini defaults to 0.

## Radio UI

Use Kobalte RadioGroup if present in the vendored `@kobalte/core`; otherwise
a segmented two-button toggle matching existing button styles. Decision made
during implementation.

## Testing

Extract the mode→save-steps decision into a small pure function
(inputs: mode, isTracked, initialQty, threshold → ordered list of stock db
calls) and unit-test it in the existing `__test__` pattern. Form-level
behavior (read-only edit display, radio default from tracked state) is
covered by the pure-function tests plus manual verification.

## Manual Verification

1. Create product as Tidak terbatas → no inventory_stocks row.
2. Create product as Terbatas with stok 24 / minimum 5 → tracked row,
   balance 24; retail tab shows status from 24 vs 5.
3. Edit tracked product → Stok saat ini read-only, link opens stocktake.
4. Switch Terbatas → Tidak terbatas → row soft-deleted.
5. Logs: `bun run app:log` shows `INVENTORY:TRACKING_STARTED` /
   `TRACKING_STOPPED`, sync push 200.
