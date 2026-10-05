# Proposal

## Why

The app tracks cash only as shift math (float + order scan), so money that moves outside sales — belanja operasional, modal, transfers between drawers and bank — is invisible. Merchants need a wallet (dompet) view of every rupiah: cash in the Laci Kas, QRIS settlement money, and bank balances, with a ledger of why each balance changed.

## What Changes

- Add two synced tables: `wallets` (per-outlet balance holders: Tunai / Bank / QRIS) and `wallet_transactions` (append-only money ledger: sale, cash_in, cash_out, transfer_in/out, reconciliation).
- Seed a default `Laci Kas` (cash) wallet per outlet deterministically at outlet creation; auto-create the QRIS wallet when the merchant first enables QRIS (deterministic IDs so multi-device sync converges).
- Checkout deposits sale money into wallets automatically: cash → default Tunai wallet, qris_static/qris_dynamic → QRIS wallet; the order row is stamped with the resolved `walletId`; the balance delta is the order total **after** change is given back. No e-wallet or debit support.
- **Rewire shift money math to the wallet ledger**: expected-in-drawer comes from the Laci Kas balance, shift window totals read `wallet_transactions` instead of scanning orders, and shift close writes a `reconciliation` ledger entry (variance) plus an optional `setoran` transfer to another wallet (default off).
- New money-movement actions: Uang Masuk, Uang Keluar, Transfer (atomic paired ledger entries), and Opname/reconciliation — each with staff attribution and optional category/notes.
- New UI: Dompet hub (balance-first, activity preview), full Riwayat page (day-grouped, wallet filter, paginated), Uang Masuk/Keluar/Transfer sheets, Kelola Dompet management (add/edit/deactivate/default), wallet strip on the home plaque, setoran step in Tutup Shift.
- Wallet balances are stored directly (synced column, last-write-wins like inventory balances) with the append-only ledger as the recovery source; reconciliation is the self-healing loop.

## Capabilities

### New Capabilities

- `wallets`: wallet entities, money ledger, balance rules, seeds, sale deposits, manual in/out, transfers, reconciliation, and the Dompet UI (hub, riwayat, movement sheets, kelola dompet).

### Modified Capabilities

- `cash-shifts`: expected-cash derivation switches from order-window scan to the Laci Kas wallet balance / wallet ledger; shift close additionally writes reconciliation and setoran ledger entries.
- `cash-shift-ux`: home plaque shows the live wallet strip (Laci Kas + QRIS + total); the Tutup Shift flow gains an optional setoran section (destination wallet + amount, default off).

## Impact

- **Schema (paired)**: `packages/sync-contract` local + API schemas gain `wallets` + `wallet_transactions`; regenerate via `bun run generate:sync` (drizzle migration both sides). No CHECK constraints on enums (baresync convention); money columns are integer `*MinorUnits`.
- **App data layer**: new `apps/pos-app/src/db/wallets.ts` (balances, ledger, movement/transfer/reconciliation helpers in `writeTransaction`); checkout path in sale-session/checkout writes the sale ledger row + balance increment in the existing order transaction; `cash-shifts.ts` window totals + close flow reworked.
- **App UI**: `pages/transactions/dompet/` (hub, riwayat, movement/transfer sheets), `pages/setting` Kelola Dompet, home `StatusPlaque`/shift-card wallet strip, `transactions/cash-register/shift-close.tsx` setoran section.
- **Seeding**: outlet creation seeds the default cash wallet (deterministic ID); QRIS enablement seeds the QRIS wallet (deterministic ID).
- **Docs**: new `[POS:WALLET_*]` / `[SHIFT:WALLET_*]` log prefixes documented in `openspec/APP-LOGGING-DOCS.md` and captured by `logs/capture-adb-logcat.sh`.
- **Out of scope**: e-wallet (GoPay/OVO) and debit payment support, QRIS settlement (T+1) tracking, split payments, merchant-level (cross-outlet) wallets, setoran auto-default.
