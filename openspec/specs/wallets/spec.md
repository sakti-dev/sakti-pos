# Wallets

## Purpose

Wallets (dompet): per-outlet money holders (Tunai, Bank, QRIS) with a stored balance and an append-only ledger of every movement — sales, cash in/out, transfers, reconciliation — so the merchant can see and audit every rupiah.

## Requirements

### Requirement: Wallet Entities and Balance Storage

The system SHALL maintain a synced `wallets` table scoped by `outletId` with: `name`, `type` (text enum `['cash','bank','qris']`), `accountNumber` (nullable, bank only), `isDefault` (boolean, one default per type per outlet), `currentBalanceMinorUnits` (integer notNull, default `0`), and the standard sync columns including soft delete. All money SHALL be integer minor units. A wallet SHALL be deactivated (soft delete), never hard-deleted, so ledger references remain resolvable.

#### Scenario: Create a bank wallet

- **WHEN** the user creates a wallet named "Bank BCA" of type bank with account number 1234567890
- **THEN** the wallet persists with zero balance and syncs across the merchant's devices

#### Scenario: Deactivated wallet keeps its ledger

- **WHEN** a wallet with a non-zero balance is deactivated
- **THEN** the app warns before deactivating, hides the wallet from pickers and cards, and all historical ledger entries remain viewable

### Requirement: Server-Side Startup Seeding

The system SHALL provide an authenticated startup handshake (`POST /api/startup`, called per outlet scope on session establishment) that idempotently ensures the outlet's default wallets server-side: the Laci Kas cash wallet always, and the QRIS wallet when the merchant's payment settings enable QRIS. Startup steps SHALL be registered, named, idempotent, and transactional, and the response SHALL report which steps did work. The client SHALL call the handshake on every session establishment — blocking on a device's first run for the outlet, in the background on subsequent runs — and SHALL NOT seed wallets locally.

#### Scenario: Fresh install seeds wallets before home

- **WHEN** a device logs in for the first time after a clean install
- **THEN** the startup handshake runs before the home screen renders and the outlet has a Laci Kas wallet

#### Scenario: QRIS enabled creates the wallet on startup

- **WHEN** the merchant's payment settings enable QRIS
- **THEN** the startup handshake ensures a QRIS-type wallet exists for the outlet

#### Scenario: Idempotent re-runs

- **WHEN** the startup handshake runs twice for the same outlet
- **THEN** the second run creates no duplicate wallets and reports the steps as no-ops

#### Scenario: Background on subsequent logins

- **WHEN** a device that has already completed startup for the outlet logs in again
- **THEN** the handshake runs in the background without blocking the app or surfacing errors

#### Scenario: Server-created wallets sync to all devices

- **WHEN** the startup handshake creates a wallet
- **THEN** the wallet syncs to every device of the merchant through the sync scope

### Requirement: Append-Only Money Ledger

The system SHALL maintain a synced `wallet_transactions` table as the append-only ledger of wallet money movements with: `walletId` (outlet-scoped wallet reference), `outletId`, `type` (text enum `['sale','cash_in','cash_out','transfer_in','transfer_out','reconciliation']`), `amountMinorUnits` (integer — absolute positive for sale/cash_in/cash_out/transfer_in/transfer_out, signed for `reconciliation` where negative means the count came up short), `category` (nullable text), `referenceId` (nullable — order ID for sales, transfer pair ID for transfers, shift ID for shift-close reconciliation), `notes` (nullable), `createdByStaffId` (soft-ref to staff), and the standard sync columns. Ledger rows SHALL never be updated or deleted after write.

#### Scenario: Every balance change has a ledger row

- **WHEN** any operation changes a wallet balance
- **THEN** exactly one ledger row records the type, absolute amount, actor, and reference of that change

#### Scenario: Transfer produces a linked pair

- **WHEN** a transfer of Rp 400.000 moves from Laci Kas to Bank BCA
- **THEN** a `transfer_out` row on Laci Kas and a `transfer_in` row on Bank BCA share one `referenceId` linking the pair

### Requirement: Balance Update Rules

The system SHALL store wallet balances directly and update them in the same local transaction as the ledger write: sales, cash in, and transfer in increment; cash out and transfer out decrement; reconciliation sets. Concurrent multi-device writes to the same wallet balance SHALL use last-write-wins convergence (consistent with inventory balances); the append-only ledger SHALL remain the recovery source and reconciliation SHALL be the self-healing mechanism.

#### Scenario: Movement applies delta atomically

- **WHEN** a cash out of Rp 80.000 is recorded on Laci Kas
- **THEN** the balance decreases by 80.000 in the same transaction that inserts the ledger row, and both sync together

#### Scenario: Balance drift self-heals at reconciliation

- **WHEN** two devices concurrently sell from the same wallet and one increment is lost to last-write-wins
- **THEN** the next physical count (reconciliation) sets the balance to the counted amount and the ledger retains both sale rows

### Requirement: Sale Deposits at Checkout

Checkout SHALL deposit the order total into the wallet resolved by payment method: cash orders into the outlet's default cash wallet, `qris_static`/`qris_dynamic` orders into the outlet's QRIS wallet. The change handed back is funded by the customer's over-tender, so the wallet gains exactly the order total. The deposit SHALL insert one `sale` ledger row and increment the balance inside the same transaction as the order write, and the order row SHALL be stamped with the resolved wallet ID. No e-wallet or debit mapping exists.

#### Scenario: Cash sale deposits net amount

- **WHEN** a customer pays a Rp 50.000 cash order with Rp 100.000
- **THEN** the default cash wallet gains exactly Rp 50.000 and the order row records that wallet

#### Scenario: QRIS sale deposits into QRIS wallet

- **WHEN** a Rp 850.000 order is paid via `qris_static`
- **THEN** the outlet's QRIS wallet gains Rp 850.000 in the checkout transaction

#### Scenario: Offline sale still deposits

- **WHEN** an order completes while offline
- **THEN** the wallet deposit and ledger row are written locally and sync with everything else

### Requirement: Manual Money Movements

The system SHALL let the user record Uang Masuk (cash in) and Uang Keluar (cash out) against a chosen wallet with a positive amount, an optional category (Operasional / Supplier / Modal for masuk; Operasional / Supplier / Lainnya for keluar), and optional notes, attributed to the active staff. Masuk increments and Keluar decrements the wallet balance with a matching ledger row.

#### Scenario: Record operational expense

- **WHEN** the user records a cash out of Rp 80.000 from Laci Kas categorized Operasional with note "Beli gas"
- **THEN** Laci Kas decreases by 80.000 and the ledger row shows KELUAR with the category and note

#### Scenario: Amount must be positive

- **WHEN** the user submits a movement with zero or negative amount
- **THEN** the save is rejected

### Requirement: Wallet Transfers

The system SHALL move money between two wallets of the same outlet as one atomic operation writing a linked `transfer_out`/`transfer_in` ledger pair and applying both balance deltas in a single local transaction. The source and destination wallets SHALL be different and the amount SHALL be a positive integer; the source balance SHALL NOT go below zero.

#### Scenario: Transfer between wallets

- **WHEN** the user transfers Rp 400.000 from Laci Kas to Bank BCA
- **THEN** Laci Kas decreases and Bank BCA increases by 400.000 atomically, with both ledger rows sharing one reference ID

#### Scenario: Same-wallet transfer rejected

- **WHEN** the user selects the same wallet as source and destination
- **THEN** the transfer is rejected before write

#### Scenario: Overdraw rejected

- **WHEN** the transfer amount exceeds the source wallet's current balance
- **THEN** the transfer is rejected and no ledger rows are written

### Requirement: Wallet Reconciliation

The system SHALL set a wallet's balance to a physical/system-counted value in one operation, writing a `reconciliation` ledger row carrying the signed variance (negative when the count is below the stored balance, positive when above, zero when exact), attributed to the active staff and optionally referencing the closing shift.

#### Scenario: Count short records negative variance

- **WHEN** Laci Kas holds 500.000 and the user counts 495.000
- **THEN** the balance is set to 495.000 and the reconciliation row records −5.000

#### Scenario: Count over records positive variance

- **WHEN** Laci Kas holds 500.000 and the user counts 510.000
- **THEN** the balance is set to 510.000 and the reconciliation row records +10.000

#### Scenario: Count exact writes a zero-amount record

- **WHEN** the counted value equals the stored balance
- **THEN** the reconciliation row records 0 and the balance is unchanged

### Requirement: Dompet Hub Screen

The Dompet screen SHALL be balance-first: total across active wallets, quick actions (Masuk, Keluar, Transfer), one row per active wallet with its balance, and a compact "Aktivitas Terakhir" preview of the most recent few ledger entries without day headers. A "Riwayat lengkap" link SHALL open the full ledger page. Sales-sourced entries SHALL be read-only.

#### Scenario: Hub shows balances and recent activity

- **WHEN** the merchant has Laci Kas 450.000 and QRIS 1.250.000 with three transactions today
- **THEN** the hub shows the 1.700.000 total, both wallets, the three recent entries, and the riwayat link

#### Scenario: Zero wallets beyond defaults

- **WHEN** only the seeded Laci Kas and QRIS wallets exist
- **THEN** the hub still renders fully with the two wallets and their live balances

### Requirement: Riwayat Ledger Screen

The system SHALL provide a full wallet ledger page with: a wallet filter (Semua or a single wallet), entries grouped by day with sticky day headers (Hari ini, Kemarin, then explicit dates), newest first, and paginated loading (50 entries per page with Muat lagi). Each entry SHALL show its type badge (PENJUALAN, MASUK, KELUAR, TRANSFER, OPNAME), direction-signed amount, wallet, category/notes when present, and time; transfers SHALL show the counterparty wallet.

#### Scenario: Paginated history grows on demand

- **WHEN** the ledger holds 500 entries and the user taps Muat lagi after the first page
- **THEN** the next 50 entries append below with day grouping intact

#### Scenario: Filter to one wallet

- **WHEN** the user filters to QRIS
- **THEN** only entries whose wallet is the QRIS wallet are shown, grouped by day

### Requirement: Kelola Dompet Management

The settings SHALL provide wallet management: create (name, type Tunai/Bank, account number for bank, optional default flag), edit, set default, and deactivate. Deactivation SHALL be blocked on the last active cash wallet of an outlet and SHALL warn when the balance is non-zero. The default cash wallet SHALL always exist for checkout.

#### Scenario: Add a bank wallet and make it default

- **WHEN** the user creates "Bank BCA" with account number and marks it default
- **THEN** the wallet appears in Kelola Dompet and in transfer destination pickers

#### Scenario: Last cash wallet cannot be deactivated

- **WHEN** the user tries to deactivate the only active Tunai wallet
- **THEN** the app blocks the action and explains a cash wallet is required
