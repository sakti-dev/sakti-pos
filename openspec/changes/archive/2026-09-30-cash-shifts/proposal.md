# Proposal

## Why

The `cash_shifts` table and spec have existed since the schema-extension work, but there is zero implementation — the home dashboard's Buka/Tutup status and drawer float are hardcoded mocks (`home/lib/data.ts`), so the till is unaccounted for: cash orders flow into the drawer with no open/close boundary, no reconciliation, and no attribution of short/over to a staff member and time window.

## What Changes

- **Schema**: add `closedByStaffId` (text nullable, soft-ref to `staff`) to `cash_shifts` so shift handover (opener ≠ closer) is accountable; regenerate sync-contract baselines.
- **Shift gate**: POS transactions require an open shift. Without one, the POS route shows a "Buka Shift" screen (initial float input) instead of the sale UI.
- **Open shift**: insert `cash_shifts` row (outlet-scoped, `openedByStaffId` = current staff session, initial float, `status: 'open'`).
- **Close shift (setoran)**: close screen computes expected cash = float + Σ completed cash orders in the shift window (QRIS and cancelled excluded, non-cash totals shown informationally); cashier enters the physical count; signed difference is recorded with an optional note; closer identity is stamped.
- **StatusPlaque live**: home Buka/Tutup pill queries `cash_shifts` for the outlet; while open it shows live float + cash sales (replaces mock `Rp 450rb`).
- **Cart guard**: closing a shift with a cart in progress warns and discards the cart (cart is UI state only).
- Roles: any authenticated staff may open/close in v1 (role gates deferred).
- Shift history list is deferred to the Laporan/Dashboard work; v1 ends at the post-close setoran summary screen.

## Capabilities

### New Capabilities

- `cash-shift-ux`: the shift lifecycle as the cashier experiences it — open gate, live status, close/setoran flow, cart guard.

### Modified Capabilities

- `cash-shifts`: `closedByStaffId` added to the table (handover accountability); requirements covering the gate, expected-cash computation, and the setoran close flow.

## Impact

- `packages/sync-contract`: `cash_shifts` schema column + baseline regen (precedent: `2026-09-28-extend-pos-domain-tables`); dev data clear expected.
- `apps/pos-app`: POS route gate, open/close screens, StatusPlaque query, orders aggregate query (`outletId + createdAt + paymentMethod='cash' + status='completed'`, index already present).
- `apps/api`: schema push to Turso production (24 tables → column addition).
- No breaking changes to existing flows; sale flow gains a precondition only.
