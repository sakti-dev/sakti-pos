# Tasks

## 1. Schema

- [x] 1.1 Add `closedByStaffId` (`text`, nullable, soft-ref to `staff` — no FK) to `cash_shifts` in `packages/sync-contract`, regenerate both baselines (dev data clear expected)
- [x] 1.2 Push the column to Turso production (`nata-pos-main`) and verify with a `turso db shell` PRAGMA check

## 2. Data layer

- [x] 2.1 Shift repository in pos-app: `getOpenShift(outletId)`, `openShift({outletId, openedByStaffId, initialFloatMinorUnits})`, `closeShift({id, closedByStaffId, actualCashMinorUnits, note})` — insert/update via baresync outbox
- [x] 2.2 Expected-cash aggregate: `sumCashSales(outletId, fromIso, toIso)` (cash, completed, not deleted) + `sumQrisSales(...)` informational — covered by unit tests including cancelled/QRIS exclusion and window boundaries
- [x] 2.3 At close, compute + persist `expectedCashMinorUnits` and signed `differenceMinorUnits` inside the same update

## 3. Gate + open flow

- [x] 3.1 POS route gate: no open shift → render open-shift panel (float input, "Buka Shift") instead of sale UI; non-sale routes untouched; log `SHIFT:GATE_BLOCKED`
- [x] 3.2 Open flow: validate float (≥ 0, integer minor units), insert row, log `SHIFT:OPENED`, transition to sale UI
- [x] 3.3 Reboot persistence: relaunch mid-shift keeps POS usable without re-opening (device smoke)

## 4. Live status

- [x] 4.1 StatusPlaque: query open shift; `Buka`/`Tutup` real; while open show live float + cash sales (recompute on order commit), replacing mock `registerStatus`

## 5. Close flow (setoran)

- [x] 5.1 Close screen: float, cash sales, expected, QRIS informational total; count input; live signed difference (KURANG/LEBIH/pas); optional note
- [x] 5.2 Cart guard: warn + discard in-progress cart on close confirm
- [x] 5.3 Confirm: stamp `closedAt` + `closedByStaffId`, persist expected/actual/difference, `status='closed'`, enqueue sync, log `SHIFT:CLOSED`; show setoran summary; POS returns to gate
- [x] 5.4 Entry point for close: from the POS (shift status control)

## 6. Docs & verification

- [x] 6.1 Document `SHIFT:OPENED` / `SHIFT:CLOSED` / `SHIFT:GATE_BLOCKED` in `openspec/DOCUMENTED-LOG-PREFIX.md`
- [x] 6.2 Unit tests green (pos-app + api), typecheck + ultracite clean
- [x] 6.3 Device verification on Redmi Pad 2 (dev): gate → open with float → cash + QRIS orders → plaque updates → close with deliberate short → setoran shows −selisih → gate returns; reboot mid-shift survives
- [ ] 6.4 Prod schema applied (1.2) and a prod build smoke: open shift works against production API
