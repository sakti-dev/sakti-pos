# Tasks

## 1. Schema and Seeds

- [x] 1.1 Add `wallets` + `wallet_transactions` to `packages/sync-contract` local synced schema per design D9 (text enums, `*MinorUnits`, soft delete, indexes) and run `bun run generate:sync`; verify drizzle migration files generate for both sides and `bun run typecheck` passes
- [x] 1.2 Add matching tables to the API synced schema and server migration path; verify `bun test` in `apps/api` passes
- [x] 1.3 Add nullable `walletId` column to `orders` (paired schema, regenerate); verify migration applies to dev Turso via db:push and app boots
- [x] 1.4 (SUPERSEDED by group 8 — client-side seeding replaced by server-side /startup; see design D2 revision)

## 2. Money Data Layer

- [x] 2.1 Implement `getWalletsWithBalance` + `getWalletLedger` (keyset pagination, wallet filter) with unit tests for filtering and page boundaries; verify `bun test apps/pos-app/src/db/__test__/wallets.test.ts`
- [x] 2.2 Implement `executeWalletTransaction` (masuk/keluar/reconciliation): one ledger row + balance delta in one `writeTransaction`, staff attribution, validation (positive amount, wallet exists/active, reconciliation sets balance), `WALLET` logger prefixes; unit tests cover increment, decrement, set-to-count, rejection cases
- [x] 2.3 Implement `executeWalletTransfer` (atomic transfer_out/transfer_in pair, shared referenceId, distinct-wallet + sufficient-balance validation); unit tests cover success pair, same-wallet rejection, overdraw rejection
- [x] 2.4 Update `openspec/APP-LOGGING-DOCS.md` with the new `WALLET`/`SHIFT` wallet log prefixes and extend `LOG_FILTER` in `logs/capture-adb-logcat.sh`; verify documented prefixes match the code

## 3. Checkout Integration

- [x] 3.1 Resolve checkout wallet (cash → default cash, `qris_static`/`qris_dynamic` → QRIS wallet) via `ensureOutletWallets` + default lookup, stamp `orders.walletId`; unit test covers mapping for all payment methods and missing-wallet reseed; verify orders test suite passes
- [x] 3.2 Write the `sale` ledger row (`amountMinorUnits = total − change`, `referenceId = orderId`) + balance increment inside the existing checkout transaction; unit test verifies net-of-change deposit, offline write, and that order failure rolls back the wallet write; verify `bun test apps/pos-app/src/db/__test__/`

## 4. Shift Integration (Full Merge)

- [x] 4.1 Rework `getShiftWindowTotals` + expected-in-drawer to read from the Laci Kas balance and `wallet_transactions` window (cash, QRIS informational); update `cash-shifts.test.ts` expectations to ledger-derived totals; verify suite passes
- [x] 4.2 Extend `closeShift` to write the `reconciliation` entry applying the counted variance to Laci Kas in the close transaction, referencing the shift; unit test covers short/over/exact counts; verify `cash-shifts.test.ts`
- [x] 4.3 Add optional setoran to `closeShift` (destination wallet + amount ≤ count → linked transfer pair, referenceId = shiftId); unit test covers setoran on, setoran off, over-count rejection; verify `cash-shifts.test.ts`

## 5. Dompet UI

- [x] 5.1 Build the Dompet hub page (total, wallet rows, quick actions, `Aktivitas Terakhir` LIMIT 5 flat preview, Riwayat link) at `pages/transactions/dompet/`; verify it renders with seeded wallets and live balances on device
- [x] 5.2 Build the Riwayat page (wallet filter chips, day-grouped sticky headers with Hari ini/Kemarin/date fallback, 50/page Muat lagi, type badges, transfer counterparty); verify paging and grouping with 60+ seeded entries
- [x] 5.3 Build Uang Masuk / Uang Keluar sheets (amount, wallet picker defaulting to Laci Kas, category chips per design, notes) wired to `executeWalletTransaction`; verify balances update live and entries appear in Riwayat
- [x] 5.4 Build the Transfer sheet (from/to pickers, distinct-wallet and overdraw validation, notes) wired to `executeWalletTransfer`; verify rejection states show inline errors
- [x] 5.5 Add Kelola Dompet to Settings: list, create/edit sheet (name, type Tunai/Bank, account number, default), deactivate guard (last active Tunai blocked; non-zero balance warns); verify guard and default switching on device
- [x] 5.6 Update the home StatusPlaque/shift-card to the wallet strip (Laci Kas, QRIS, total from balances); verify plaque numbers match the Dompet hub on device

## 6. Tutup Shift Setoran Flow

- [x] 6.1 Add the optional setoran section to `shift-close.tsx` (default-off toggle, amount ≤ count validation, destination picker with inline wallet creation, "Tersisa di laci" live readout) wired to the extended `closeShift`; verify close with and without setoran on device
- [x] 6.2 Update the setoran summary screen to show reconciliation variance and setoran destination when used; verify summary after a setoran close

## 7. Verification

- [x] 7.1 Run full suites: `bun test` in `apps/pos-app` and `apps/api`, `bunx tsc --noEmit`, `bun x ultracite check`; fix findings
- [x] 7.2 Device end-to-end pass with `logs/capture-adb-logcat.sh` running: open shift → cash sale + QRIS sale (balances move net-of-change) → uang keluar → transfer → close with setoran → riwayat shows all entries; confirm `[WALLET:*]`/`[SHIFT:*]` prefixes appear in `logs/app.log`

## 8. Server-Side Startup Seeding (revision — design D2)

- [x] 8.1 Add `POST /api/startup` (authenticated, per-outlet scope): idempotent step registry — `ensure_default_wallets` (Laci Kas) + `ensure_qris_wallet` (reads synced payment settings) — transactional, console.log step evidence, response `{ ok, applied }`; register in `app.ts`; API tests cover seed, idempotent re-run, QRIS-conditional, access control; verify `bun test apps/api`
- [x] 8.2 Client `runStartup()` in the auth provider: first run per device+outlet (localStorage flag written on success only) blocking with one retry then degraded; subsequent runs fire-and-forget in background; verify auth flow tests pass
- [x] 8.3 Delete client seeding: `WalletSeedGate`, `ensureOutletWallets`, `seedWalletsForActiveOutlet`, deterministic-ID helpers, QRIS-toggle hook in `payment-settings.ts`; `resolveSaleWallet` becomes read-only (logged skip when missing); update wallets/orders/payment-settings tests; verify pos-app suites green
- [x] 8.4 Document `[STARTUP]` server log lines in `openspec/DOCUMENTED-LOG-PREFIX.md` and add `STARTUP` to `LOG_FILTER` in `logs/capture-adb-logcat.sh`; verify prefixes match code
