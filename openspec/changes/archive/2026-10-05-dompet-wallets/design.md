# Design

## Context

Money today lives only in `cash_shifts` (float + order-window scan at close) and `orders.paymentMethod`. The proposal adds `wallets` + `wallet_transactions` as the single money source of truth and rewires shift math onto them. Constraints that shape the design: baresync row-level LWW sync with outbox (`writeTransaction` + `enqueueChange`), all money as integer `*MinorUnits`, text enums instead of CHECK constraints, soft-delete convention, and one drawer per outlet (`registerId` null) in v1.

## Goals / Non-Goals

**Goals:**

- One authoritative ledger for every rupiah movement; balances derivable and auditable.
- Checkout, shift close, and manual movements all flow through the same transactional money helpers.
- Shift money UI (plaque, close flow) reads the wallet ledger — no duplicated order-scan math.
- Multi-device-safe seeding and append-only ledger (no sync conflicts on ledger rows).

**Non-Goals:**

- E-wallet/debit payment methods, QRIS T+1 settlement tracking, split payments, merchant-level wallets, permissions beyond existing staff auth, register-specific drawers.

## Decisions

### D1: Stored balance column, last-write-wins (not derived-on-read)
`currentBalanceMinorUnits` is a synced column updated in the same transaction as its ledger row — mirrors `inventory_stocks`. Alternative (derive from `SUM(wallet_transactions)` at read) avoids LWW drift but diverges from the inventory pattern and pays aggregation on every read. Two devices selling the same wallet concurrently can lose one increment on the balance; the ledger rows never conflict (unique UUIDs), and reconciliation is the self-healing loop. Accept, and log balance updates for diagnosis.

### D2: Server-side startup seeding (revised — was client-side deterministic seeds)
Default wallets are ensured **server-side** by an authenticated startup handshake (`POST /api/startup`, per outlet scope) that the client calls on every session establishment. Rationale: outlets are server-born (cloud onboarding), so the invariant "every outlet has its default wallets" belongs where outlets originate. Client-side seeding was implemented first and produced four fragile code paths (boot-vs-login timing, silent catches, a reactive gate) — all deleted in favor of one server funnel.

Shape:
- **Step registry** — ordered, named, idempotent ensures, each one transactional existence-check + insert: `ensure_default_wallets` (Laci Kas always), `ensure_qris_wallet` (reads the merchant's synced payment settings). The response reports which steps did work; server logs them (`[STARTUP]`) for support evidence. Cheap steps stay stateless (run every call); a per-scope ledger (`startup_steps`) is the documented escape hatch only for expensive future steps.
- **Client policy** — first run for a device+outlet (localStorage flag `sakti:startup:done:{outletId}`, written only on success, cleared by reinstall): blocking with a single retry, then proceed degraded with a logged warning. Subsequent runs: fire-and-forget in the background, failures log-only. The endpoint is idempotent, so a background call racing active use is safe.
- **Offline window** — a brand-new outlet has no Laci Kas until the first handshake. Negligible: login itself requires the network and the handshake runs in the login flow; checkout resolves-no-wallet → skips the deposit with a loud log (existing behavior).
- **Repair channel** — future seeds/backfills ship as new registry steps; every already-deployed app version picks them up on its next login. No app release, no migration coordination.
- Client keeps only reads; `ensureOutletWallets`, `seedWalletsForActiveOutlet`, the seed gate, and the QRIS-toggle hook are deleted. Deterministic IDs are gone — the server is the single seeder.

### D3: Full merge of shift math onto the ledger (user decision A)
`getShiftWindowTotals` and expected-in-drawer derive from `wallet_transactions` / the Laci Kas balance instead of scanning orders. Shift rows keep `expectedCashMinorUnits`/`actualCashMinorUnits`/`differenceMinorUnits` as the immutable per-shift report snapshot — same schema, new derivation. The home plaque reads wallet balances directly.

### D4: Shift open reconciles the wallet to the declared float (revised — was "no wallet event")
The float input is the **total cash in the drawer at open**. `openShift` therefore reconciles the Laci Kas wallet to the declared float inside the open transaction (one `reconciliation` entry, `notes: "Modal awal shift"`, skipped when the declared float already matches the balance). Rationale: the original "no wallet event" decision left fresh installs blind — a 200k float declared on a zero wallet made expected-in-drawer 15k instead of 215k. Steady state (drawer left as counted yesterday, same float declared) is a no-op; a different declaration means the physical drawer changed, so reconciling is honest. The open screen shows the recorded balance and warns when the declared float differs.

### D5: Close = reconciliation + optional setoran, one transaction
`closeShift` keeps its existing row update and adds, in the same `writeTransaction`: a `reconciliation` ledger entry applying `differenceMinorUnits` to Laci Kas, and when setoran is enabled a linked `transfer_out`/`transfer_in` pair (referenceId = the shift ID) to the chosen destination wallet. Setoran UI defaults off; amount ≤ physical count. Destination picker reuses the wallet create sheet when the outlet has no second wallet.

### D6: Fixed checkout mapping, resolved-and-stamped
cash → outlet's `isDefault` cash wallet; `qris_static`/`qris_dynamic` → outlet's QRIS wallet. Checkout resolves the wallet inside the order transaction, inserts one `sale` ledger row with `amountMinorUnits = total − change` and `referenceId = orderId`, increments the balance, and stamps `walletId` on the order row (new nullable orders column, paired-schema migration). If the mapped wallet is missing (e.g. cleared data), `ensureOutletWallets` re-seeds deterministically before resolution — checkout can never fail for a missing default.

### D7: Transfers as one atomic paired write
`executeWalletTransfer` validates (distinct wallets, positive amount, sufficient source balance) then writes both ledger rows + both balance deltas in one `writeTransaction`. Hard-reject overdraw to keep the ledger honest (warn-only rejected as too forgiving for money).

### D8: UI composition — hub is not the ledger
Dompet hub: total, quick actions, wallet rows, `Aktivitas Terakhir` = latest 5 entries (`LIMIT 5`, flat, no day headers), link to Riwayat. Riwayat page: wallet filter chips, flat keyset-paginated query (50/page, `created_at` DESC cursor) with day grouping rendered client-side and sticky day headers (Hari ini / Kemarin / `D MMM` fallback). One data source, two views. Manual-entry detail opens a read sheet; sale entries are read-only.

### D9: Schema conventions
`wallets`: `type` text enum `['cash','bank','qris']`, `accountNumber` nullable, `isDefault` boolean, `currentBalanceMinorUnits` integer notNull default 0, `deletedAt` + standard sync columns. `wallet_transactions`: append-only (never updated), `type` text enum `['sale','cash_in','cash_out','transfer_in','transfer_out','reconciliation']`, `amountMinorUnits` absolute positive, `category` nullable, `referenceId` nullable, `createdByStaffId` soft-ref staff. Indexes: `(outlet_id, created_at)`, `(wallet_id, created_at)`, `is_synced` per convention. Paired schemas + `bun run generate:sync`; no hand-written SQL.

### D10: Money helpers live in one module
`apps/pos-app/src/db/wallets.ts` owns all reads/writes (balances, ledger, movements, transfer, reconcile, ensure-seeds) using the `inventory.ts` patterns: `writeTransaction`, `enqueueChange`, `createLogger({ domain: "WALLET" })`. Checkout and shift-close import from it — no inline SQL at call sites.

## Risks / Trade-offs

- [LWW drift on balances with simultaneous multi-device sales] → ledger is complete; reconciliation sets truth; next sync converges; drift logged.
- [Ledger growth (1+ rows/sale)] → keyset pagination + `(wallet_id, created_at)` index; hub preview capped at 5 rows; SQLite handles 100k+ rows trivially.
- [Checkout regression risk in the money path] → deposit helpers unit-tested; checkout deposit covered by orders test suite; keep the deposit call at the tail of the existing transaction so order failure ⇒ no wallet write.
- [Startup handshake unreachable on first run] → single retry then proceed degraded with a logged warning; stateless steps self-heal on the next successful call.
- [Close-flow complexity grows for cashiers] → setoran defaults off; counting-only close is byte-for-byte today's flow plus one background reconciliation write.
- [QRIS money shown as spendable despite T+1 settlement] → accepted for v1; the `category`/`notes` fields and transfer flows leave room for settlement tracking later.

## Migration Plan

1. Paired schema + migration via `generate:sync` (dev Turso `db:push` as established); wallets + wallet_transactions registered in `sync.config.ts`, the server sync registry, and the device-embedded contract.
2. `/startup` deploy backfills existing outlets on their next login — no data migration script.
3. Rollback = revert commits; new tables are additive and ignored by the old code. The one destructive-ish step is the new nullable `orders.walletId` column — additive, safe.

## Open Questions

None — all forks (A/B merge depth, balance storage, setoran default, mapping rule) were resolved with the user during exploration.
