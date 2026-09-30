# Design

## Context

- One device per outlet is the deployment reality (user-confirmed), so all orders in a shift window are created on the closing device — expected cash computes completely from the local DB; cross-device sync lag cannot skew reconciliation.
- Orders are always paid at commit (`status: completed|cancelled`, no unpaid state), so `createdAt` is the payment time. No deferred-payment edge exists.
- The active staff session (`currentUser()` in `~/lib/auth/session`) provides `openedByStaffId` / `closedByStaffId`.
- QRIS money settles to a bank account, never the drawer — excluded from expected cash, shown as informational total.

## Goals / Non-Goals

**Goals:** gate sales on open shift; open/close/setoran flow; live StatusPlaque; `closedByStaffId` handover accountability; schema + baseline regen.

**Non-Goals:** shift history list & analytics (deferred to Laporan/Dashboard work), role-based gates (deferred), multi-register/multi-drawer per outlet (`registerId` stays null), float denomination breakdown, mid-shift cash in/out (drop/pump) entries.

## Decisions

### D1: Schema change — `closedByStaffId`

Add `text("closed_by_staff_id")` (nullable, soft-ref pattern like `openedByStaffId` — plain text, no FK constraint since `staff` rows sync independently) to `cash_shifts` in the sync contract, regenerate both baselines, push the column to Turso production. Precedent: `2026-09-28-extend-pos-domain-tables` (adding columns to synced tables + baseline refresh + dev data clear).

### D2: Gate placement — POS route, not checkout

When no open shift exists for the outlet, the POS route renders the open-shift panel (float input + "Buka Shift" confirm) in place of the sale UI. Non-sale routes stay untouched; the gate is a route-level render branch, cheap to test. Checkout code needs no precondition check of its own (unreachable without an open shift) but may assert defensively.

### D3: Shift state as plain queries, no store

Open-shift lookup = query `cash_shifts WHERE outletId = current AND status='open' AND deletedAt IS NULL LIMIT 1`, re-run on route mount / after mutations (createResource pattern used elsewhere). No new global store — the DB is the source of truth; reboot persistence falls out for free.

### D4: Expected cash computation

```
expected = initialFloatMinorUnits
         + Σ totalMinorUnits
             WHERE outletId = ?
               AND paymentMethod = 'cash'
               AND status = 'completed'
               AND deletedAt IS NULL
               AND createdAt >= openedAt AND createdAt < closedAt
```

Computed live for the plaque (window: `openedAt..now`) and re-computed + persisted to `expectedCashMinorUnits` at close. The existing `orders_outlet_created_idx` covers the range scan. Informational QRIS total = same query with `paymentMethod IN ('qris_static','qris_dynamic')` (the legacy `'qris'` enum value maps there too if legacy rows exist).

### D5: Close flow

Screen order: setoran summary (float, cash sales, expected, QRIS info) → count input → live signed difference (KURANG/LEBIH/pas) → optional note → confirm. Confirm updates the row (`closedAt`, `closedByStaffId`, `actual`, persisted `expected`, `difference`, `status='closed'`), enqueues sync, discards any in-progress cart (with warning), and shows the post-close setoran screen; POS returns to the gate.

### D6: Money handling & UI conventions

Integer minor units everywhere in storage; Rupiah formatting via existing `formatRupiah`. Numeric input follows existing checkout cash-input patterns. Logs use `[DOMAIN:ACTION]` prefixes (`SHIFT:OPENED`, `SHIFT:CLOSED`, `SHIFT:GATE_BLOCKED`) and get documented in `openspec/DOCUMENTED-LOG-PREFIX.md`.

## Risks / Trade-offs

- **Schema regen clears dev data** — accepted (precedent; prod is a column ADD, non-destructive).
- **Two open rows for one outlet** (future multi-device) — v1 ignores; query treats any open row as Buka. Deferred with registerId.
- **Cancelled-after-close orders** — a completed cash order cancelled after its shift closed would retroactively invalidate the persisted `expected`; the persisted snapshot preserves what the cashier actually reconciled against, which is the correct audit behavior.
- **Clock changes** — window bounds use `createdAt` strings (device clock); same trust model as order numbers, accepted for v1.
## Open Questions

None blocking — handover (`closedByStaffId`) was the last open decision and is resolved (option a).
