import dayjs from "dayjs";
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { getSyncClient } from "~/lib/api/sync";
import { currentOutletId, currentUser } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";

/** The drizzle transaction handle writeTransaction hands to callbacks. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const walletLogger = createLogger({
  domain: "WALLET",
  module: "wallets",
});

export type WalletRow = typeof TABLE.wallets.$inferSelect;
export type WalletTransactionRow = typeof TABLE.walletTransactions.$inferSelect;

export type WalletType = WalletRow["type"];
export type WalletTransactionType = WalletTransactionRow["type"];

function requireOutletId(): string {
  const outletId = currentOutletId();
  if (!outletId) {
    throw new Error("wallets: no active outlet");
  }
  return outletId;
}

export function requireStaffId(): string {
  const staff = currentUser();
  if (!staff) {
    throw new Error("wallets: no active staff session");
  }
  return staff.id;
}

/* ── Reads ─────────────────────────────────────────────────────── */

/** Active (non-deleted) wallets with current balances, seed defaults first. */
export async function getWalletsWithBalance(): Promise<WalletRow[]> {
  const rows = await db
    .select()
    .from(TABLE.wallets)
    .where(
      and(
        eq(TABLE.wallets.outletId, requireOutletId()),
        isNull(TABLE.wallets.deletedAt)
      )
    )
    .orderBy(asc(TABLE.wallets.createdAt));
  const typeOrder: Record<WalletType, number> = {
    cash: 0,
    qris: 1,
    bank: 2,
  };
  return [...rows].sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      typeOrder[a.type] - typeOrder[b.type]
  );
}

/** The wallet that receives cash sale deposits ( outlet's default cash wallet). */
export async function getDefaultCashWallet(): Promise<WalletRow | undefined> {
  const wallets = await getWalletsWithBalance();
  return wallets.find((row) => row.type === "cash" && row.isDefault);
}

/* ── Ledger reads ──────────────────────────────────────────────── */

export interface WalletLedgerEntry {
  /** Absolute except `reconciliation`, which is signed (negative = short). */
  readonly amountMinorUnits: number;
  readonly category: string | null;
  readonly createdAt: string;
  readonly createdByStaffId: string;
  readonly id: string;
  readonly notes: string | null;
  readonly referenceId: string | null;
  readonly type: WalletTransactionType;
  readonly walletId: string;
  readonly walletName: string;
  readonly walletType: WalletType;
}

export interface WalletLedgerCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface WalletLedgerPage {
  readonly entries: WalletLedgerEntry[];
  readonly nextCursor: WalletLedgerCursor | null;
}

export const LEDGER_PAGE_SIZE = 50;

/**
 * Keyset-paginated ledger feed, newest first. Pass `cursor` from the previous
 * page's `nextCursor` to fetch the next page.
 */
export async function getWalletLedger(
  options: {
    walletId?: string;
    cursor?: WalletLedgerCursor;
    limit?: number;
  } = {}
): Promise<WalletLedgerPage> {
  const limit = options.limit ?? LEDGER_PAGE_SIZE;
  const conditions = [
    eq(TABLE.walletTransactions.outletId, requireOutletId()),
    isNull(TABLE.walletTransactions.deletedAt),
  ];
  if (options.walletId) {
    conditions.push(eq(TABLE.walletTransactions.walletId, options.walletId));
  }
  if (options.cursor) {
    conditions.push(
      or(
        lt(TABLE.walletTransactions.createdAt, options.cursor.createdAt),
        and(
          eq(TABLE.walletTransactions.createdAt, options.cursor.createdAt),
          lt(TABLE.walletTransactions.id, options.cursor.id)
        )
      )!
    );
  }

  const rows = await db
    .select({
      id: TABLE.walletTransactions.id,
      walletId: TABLE.walletTransactions.walletId,
      walletName: TABLE.wallets.name,
      walletType: TABLE.wallets.type,
      type: TABLE.walletTransactions.type,
      amountMinorUnits: TABLE.walletTransactions.amountMinorUnits,
      category: TABLE.walletTransactions.category,
      notes: TABLE.walletTransactions.notes,
      referenceId: TABLE.walletTransactions.referenceId,
      createdByStaffId: TABLE.walletTransactions.createdByStaffId,
      createdAt: TABLE.walletTransactions.createdAt,
    })
    .from(TABLE.walletTransactions)
    .innerJoin(
      TABLE.wallets,
      eq(TABLE.walletTransactions.walletId, TABLE.wallets.id)
    )
    .where(and(...conditions))
    .orderBy(
      desc(TABLE.walletTransactions.createdAt),
      desc(TABLE.walletTransactions.id)
    )
    .limit(limit + 1);

  const entries: WalletLedgerEntry[] = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = entries.at(-1);
  return {
    entries,
    nextCursor:
      hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

/** Active default wallets for balance displays (plaque strip, pickers). */
export interface WalletStripRow {
  readonly balanceMinorUnits: number;
  readonly name: string;
  readonly type: WalletType;
}

export async function getWalletStrip(): Promise<WalletStripRow[]> {
  const wallets = await getWalletsWithBalance();
  return wallets.map((wallet) => ({
    balanceMinorUnits: wallet.currentBalanceMinorUnits,
    name: wallet.name,
    type: wallet.type,
  }));
}

/* ── Money movements ───────────────────────────────────────────── */

/** Ledger direction for display: every type is fixed except reconciliation. */
export function ledgerDirection(type: WalletTransactionType): "in" | "out" {
  if (
    type === "sale" ||
    type === "cash_in" ||
    type === "transfer_in" ||
    type === "reconciliation"
  ) {
    return "in";
  }
  return "out";
}

export interface WalletMovementInput {
  readonly amountMinorUnits: number;
  readonly category?: string | null;
  readonly notes?: string | null;
  readonly referenceId?: string | null;
  readonly type: "cash_in" | "cash_out";
  readonly walletId: string;
}

export interface WalletReconcileInput {
  /** Physical/system count — the balance is SET to this. */
  readonly countedMinorUnits: number;
  readonly notes?: string | null;
  /** Closing shift id when reconciling as part of Tutup Shift. */
  readonly referenceId?: string | null;
  readonly walletId: string;
}

const CATEGORIES = {
  cash_in: ["operasional", "modal", "lainnya"],
  cash_out: ["operasional", "supplier", "lainnya"],
} as const;

export type MovementCategory = (typeof CATEGORIES)["cash_in"];

async function getWalletForUpdate(
  tx: DbTx,
  walletId: string
): Promise<WalletRow> {
  const outletId = requireOutletId();
  const [wallet] = await tx
    .select()
    .from(TABLE.wallets)
    .where(eq(TABLE.wallets.id, walletId))
    .limit(1);
  if (!wallet || wallet.outletId !== outletId || wallet.deletedAt !== null) {
    throw new Error(`wallets: wallet not found or inactive: ${walletId}`);
  }
  return wallet;
}

function requirePositiveAmount(amountMinorUnits: number): void {
  if (!Number.isInteger(amountMinorUnits) || amountMinorUnits <= 0) {
    throw new Error(
      `wallets: amount must be a positive integer (minor units), got ${amountMinorUnits}`
    );
  }
}

/** Core movement write — composes inside a caller-owned transaction. */
export async function applyWalletMovement(
  tx: DbTx,
  input: WalletMovementInput
): Promise<WalletTransactionRow> {
  requirePositiveAmount(input.amountMinorUnits);
  if (input.type === "cash_in" || input.type === "cash_out") {
    const allowed: readonly string[] = CATEGORIES[input.type];
    if (
      input.category !== undefined &&
      input.category !== null &&
      !allowed.includes(input.category)
    ) {
      throw new Error(
        `wallets: invalid ${input.type} category: ${input.category}`
      );
    }
  }
  const wallet = await getWalletForUpdate(tx, input.walletId);
  const staffId = requireStaffId();
  const now = dayjs().toISOString();
  const delta =
    input.type === "cash_in" ? input.amountMinorUnits : -input.amountMinorUnits;

  const [ledgerRow] = await tx
    .insert(TABLE.walletTransactions)
    .values({
      id: uuidv7(),
      outletId: wallet.outletId,
      walletId: wallet.id,
      type: input.type,
      amountMinorUnits: input.amountMinorUnits,
      category: input.category ?? null,
      referenceId: input.referenceId ?? null,
      notes: input.notes ?? null,
      createdByStaffId: staffId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await getSyncClient().enqueueChange(tx, {
    operation: "insert",
    rowId: ledgerRow.id,
    table: TABLE.walletTransactions,
  });

  const newBalance = wallet.currentBalanceMinorUnits + delta;
  await tx
    .update(TABLE.wallets)
    .set({
      currentBalanceMinorUnits: newBalance,
      updatedAt: now,
      isSynced: false,
    })
    .where(eq(TABLE.wallets.id, wallet.id));
  await getSyncClient().enqueueChange(tx, {
    operation: "update",
    rowId: wallet.id,
    table: TABLE.wallets,
  });

  walletLogger.info("wallet_movement", {
    wallet_id: wallet.id,
    type: input.type,
    amount: input.amountMinorUnits,
    balance_after: newBalance,
    category: input.category ?? null,
  });
  return ledgerRow;
}

/** Standalone movement (Uang Masuk / Uang Keluar) owning its transaction. */
export async function recordWalletMovement(
  input: WalletMovementInput
): Promise<WalletTransactionRow> {
  return await getSyncClient().writeTransaction(db, async (tx) =>
    applyWalletMovement(tx, input)
  );
}

/** Core reconciliation write — composes inside a caller-owned transaction. */
export async function applyWalletReconciliation(
  tx: DbTx,
  input: WalletReconcileInput
): Promise<WalletTransactionRow> {
  if (
    !Number.isInteger(input.countedMinorUnits) ||
    input.countedMinorUnits < 0
  ) {
    throw new Error(
      `wallets: counted amount must be a non-negative integer (minor units), got ${input.countedMinorUnits}`
    );
  }
  const wallet = await getWalletForUpdate(tx, input.walletId);
  const staffId = requireStaffId();
  const now = dayjs().toISOString();
  const variance = input.countedMinorUnits - wallet.currentBalanceMinorUnits;

  const [ledgerRow] = await tx
    .insert(TABLE.walletTransactions)
    .values({
      id: uuidv7(),
      outletId: wallet.outletId,
      walletId: wallet.id,
      type: "reconciliation",
      amountMinorUnits: variance,
      category: null,
      referenceId: input.referenceId ?? null,
      notes: input.notes ?? null,
      createdByStaffId: staffId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await getSyncClient().enqueueChange(tx, {
    operation: "insert",
    rowId: ledgerRow.id,
    table: TABLE.walletTransactions,
  });

  if (variance !== 0) {
    await tx
      .update(TABLE.wallets)
      .set({
        currentBalanceMinorUnits: input.countedMinorUnits,
        updatedAt: now,
        isSynced: false,
      })
      .where(eq(TABLE.wallets.id, wallet.id));
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: wallet.id,
      table: TABLE.wallets,
    });
  }

  walletLogger.info("wallet_reconciled", {
    wallet_id: wallet.id,
    balance_before: wallet.currentBalanceMinorUnits,
    counted: input.countedMinorUnits,
    variance,
    shift_id: input.referenceId ?? null,
  });
  return ledgerRow;
}

/** Standalone opname owning its transaction. */
export async function reconcileWallet(
  input: WalletReconcileInput
): Promise<WalletTransactionRow> {
  return await getSyncClient().writeTransaction(db, async (tx) =>
    applyWalletReconciliation(tx, input)
  );
}

export interface WalletTransferInput {
  readonly amountMinorUnits: number;
  readonly fromWalletId: string;
  readonly notes?: string | null;
  readonly toWalletId: string;
}

export interface WalletTransferResult {
  readonly fromBalanceMinorUnits: number;
  readonly referenceId: string;
  readonly toBalanceMinorUnits: number;
}

/** Core transfer write — composes inside a caller-owned transaction. */
export async function applyWalletTransfer(
  tx: DbTx,
  input: WalletTransferInput
): Promise<WalletTransferResult> {
  requirePositiveAmount(input.amountMinorUnits);
  if (input.fromWalletId === input.toWalletId) {
    throw new Error("wallets: transfer source and destination must differ");
  }
  const from = await getWalletForUpdate(tx, input.fromWalletId);
  const to = await getWalletForUpdate(tx, input.toWalletId);
  if (from.currentBalanceMinorUnits < input.amountMinorUnits) {
    throw new Error(
      `wallets: insufficient balance in ${from.name} (has ${from.currentBalanceMinorUnits}, needs ${input.amountMinorUnits})`
    );
  }
  const staffId = requireStaffId();
  const now = dayjs().toISOString();
  const referenceId = uuidv7();

  const ledgerValues = (
    direction: "transfer_out" | "transfer_in",
    walletId: string
  ) => ({
    id: uuidv7(),
    outletId: from.outletId,
    walletId,
    type: direction,
    amountMinorUnits: input.amountMinorUnits,
    category: null,
    referenceId,
    notes: input.notes ?? null,
    createdByStaffId: staffId,
    createdAt: now,
    updatedAt: now,
  });

  const outRow = ledgerValues("transfer_out", from.id);
  const inRow = ledgerValues("transfer_in", to.id);
  await tx.insert(TABLE.walletTransactions).values(outRow);
  await tx.insert(TABLE.walletTransactions).values(inRow);
  await getSyncClient().enqueueChange(tx, {
    operation: "insert",
    rowId: outRow.id,
    table: TABLE.walletTransactions,
  });
  await getSyncClient().enqueueChange(tx, {
    operation: "insert",
    rowId: inRow.id,
    table: TABLE.walletTransactions,
  });

  const fromBalance = from.currentBalanceMinorUnits - input.amountMinorUnits;
  const toBalance = to.currentBalanceMinorUnits + input.amountMinorUnits;
  for (const wallet of [from, to]) {
    await tx
      .update(TABLE.wallets)
      .set({
        currentBalanceMinorUnits:
          wallet.id === from.id ? fromBalance : toBalance,
        updatedAt: now,
        isSynced: false,
      })
      .where(eq(TABLE.wallets.id, wallet.id));
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: wallet.id,
      table: TABLE.wallets,
    });
  }

  walletLogger.info("wallet_transferred", {
    reference_id: referenceId,
    from_wallet_id: from.id,
    to_wallet_id: to.id,
    amount: input.amountMinorUnits,
    from_balance_after: fromBalance,
    to_balance_after: toBalance,
  });
  return {
    referenceId,
    fromBalanceMinorUnits: fromBalance,
    toBalanceMinorUnits: toBalance,
  };
}

/** Standalone transfer owning its transaction. */
export async function executeWalletTransfer(
  input: WalletTransferInput
): Promise<WalletTransferResult> {
  return await getSyncClient().writeTransaction(db, async (tx) =>
    applyWalletTransfer(tx, input)
  );
}

/* ── Checkout deposits ─────────────────────────────────────────── */

/**
 * Resolve the wallet a sale deposits into: cash → the outlet's default cash
 * wallet; qris_static/qris_dynamic → the QRIS wallet. Read-only — default
 * wallets are the server's startup concern; a miss skips the deposit with
 * a loud log (the sale itself is never blocked).
 */
export async function resolveSaleWallet(
  paymentMethod: string
): Promise<WalletRow | undefined> {
  const wallets = await getWalletsWithBalance();
  const wallet =
    paymentMethod === "cash"
      ? (wallets.find((row) => row.type === "cash" && row.isDefault) ??
        wallets.find((row) => row.type === "cash"))
      : wallets.find((row) => row.type === "qris");
  if (!wallet) {
    walletLogger.warn("wallet_resolve_missed", {
      payment_method: paymentMethod,
    });
  }
  return wallet;
}

export interface SaleDepositInput {
  readonly createdAt: string;
  /** Order total net of change handed back, in minor units. */
  readonly netAmountMinorUnits: number;
  readonly orderId: string;
  readonly staffId: string;
  readonly wallet: WalletRow;
}

/**
 * Core sale-deposit write — composes inside the checkout transaction
 * (call it at the tail so order failure rolls the wallet write back).
 * Zero-total sales skip silently.
 */
export async function applySaleDeposit(
  tx: DbTx,
  input: SaleDepositInput
): Promise<WalletTransactionRow | undefined> {
  if (input.netAmountMinorUnits <= 0) {
    walletLogger.info("wallet_deposit_skipped", {
      wallet_id: input.wallet.id,
      order_id: input.orderId,
      net_amount: input.netAmountMinorUnits,
    });
    return;
  }

  const [ledgerRow] = await tx
    .insert(TABLE.walletTransactions)
    .values({
      id: uuidv7(),
      outletId: input.wallet.outletId,
      walletId: input.wallet.id,
      type: "sale",
      amountMinorUnits: input.netAmountMinorUnits,
      category: null,
      referenceId: input.orderId,
      notes: null,
      createdByStaffId: input.staffId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .returning();
  await getSyncClient().enqueueChange(tx, {
    operation: "insert",
    rowId: ledgerRow.id,
    table: TABLE.walletTransactions,
  });

  const newBalance =
    input.wallet.currentBalanceMinorUnits + input.netAmountMinorUnits;
  await tx
    .update(TABLE.wallets)
    .set({
      currentBalanceMinorUnits: newBalance,
      updatedAt: input.createdAt,
      isSynced: false,
    })
    .where(eq(TABLE.wallets.id, input.wallet.id));
  await getSyncClient().enqueueChange(tx, {
    operation: "update",
    rowId: input.wallet.id,
    table: TABLE.wallets,
  });

  walletLogger.info("wallet_sale_deposit", {
    wallet_id: input.wallet.id,
    order_id: input.orderId,
    amount: input.netAmountMinorUnits,
    balance_after: newBalance,
  });
  return ledgerRow;
}

/* ── Wallet management (Kelola Dompet) ─────────────────────────── */

export interface SaveWalletInput {
  readonly accountNumber?: string | null;
  readonly id?: string;
  readonly isDefault: boolean;
  readonly name: string;
  readonly type: WalletType;
}

function requireActiveOutletId(): string {
  const outletId = currentOutletId();
  if (!outletId) {
    throw new Error("wallets: no active outlet");
  }
  return outletId;
}

/** Create or edit a wallet (name/type/account/default) + enqueue sync. */
export async function saveWallet(input: SaveWalletInput): Promise<WalletRow> {
  if (!input.name.trim()) {
    throw new Error("wallets: name is required");
  }
  const outletId = requireActiveOutletId();
  const now = dayjs().toISOString();

  return await getSyncClient().writeTransaction(db, async (tx) => {
    let row: WalletRow;
    if (input.id) {
      const [updated] = await tx
        .update(TABLE.wallets)
        .set({
          accountNumber: input.accountNumber ?? null,
          isDefault: input.isDefault,
          name: input.name.trim(),
          type: input.type,
          updatedAt: now,
          isSynced: false,
        })
        .where(eq(TABLE.wallets.id, input.id))
        .returning();
      if (!updated) {
        throw new Error(`wallets: wallet not found: ${input.id}`);
      }
      row = updated;
      await getSyncClient().enqueueChange(tx, {
        operation: "update",
        rowId: row.id,
        table: TABLE.wallets,
      });
    } else {
      const [inserted] = await tx
        .insert(TABLE.wallets)
        .values({
          id: uuidv7(),
          outletId,
          name: input.name.trim(),
          type: input.type,
          accountNumber: input.accountNumber ?? null,
          isDefault: input.isDefault,
          currentBalanceMinorUnits: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      row = inserted;
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: row.id,
        table: TABLE.wallets,
      });
    }

    /* One default per type: unset the type's other defaults. */
    if (input.isDefault) {
      const siblings = await tx
        .select({ id: TABLE.wallets.id })
        .from(TABLE.wallets)
        .where(
          and(
            eq(TABLE.wallets.outletId, outletId),
            eq(TABLE.wallets.type, input.type)
          )
        );
      for (const sibling of siblings) {
        if (sibling.id === row.id) {
          continue;
        }
        await tx
          .update(TABLE.wallets)
          .set({ isDefault: false, updatedAt: now, isSynced: false })
          .where(eq(TABLE.wallets.id, sibling.id));
        await getSyncClient().enqueueChange(tx, {
          operation: "update",
          rowId: sibling.id,
          table: TABLE.wallets,
        });
      }
    }

    walletLogger.info("wallet_saved", {
      wallet_id: row.id,
      wallet_type: row.type,
      is_default: row.isDefault,
      created: !input.id,
    });
    return row;
  });
}

/**
 * Soft-delete a wallet. Blocked on the outlet's last active cash wallet —
 * checkout needs a default cash wallet to exist.
 */
export async function deactivateWallet(walletId: string): Promise<void> {
  const outletId = requireActiveOutletId();
  const now = dayjs().toISOString();

  await getSyncClient().writeTransaction(db, async (tx) => {
    const active = await tx
      .select({
        deletedAt: TABLE.wallets.deletedAt,
        id: TABLE.wallets.id,
        type: TABLE.wallets.type,
      })
      .from(TABLE.wallets)
      .where(eq(TABLE.wallets.outletId, outletId));
    const target = active.find((row) => row.id === walletId);
    if (!target || target.deletedAt !== null) {
      throw new Error("wallets: wallet not found or already inactive");
    }
    const activeCash = active.filter(
      (row) => row.type === "cash" && row.deletedAt === null
    );
    if (target.type === "cash" && activeCash.length <= 1) {
      throw new Error(
        "wallets: the last active cash wallet cannot be deactivated"
      );
    }
    await tx
      .update(TABLE.wallets)
      .set({ deletedAt: now, updatedAt: now, isSynced: false })
      .where(eq(TABLE.wallets.id, walletId));
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: walletId,
      table: TABLE.wallets,
    });
    walletLogger.info("wallet_deactivated", { wallet_id: walletId });
  });
}

/** id → name for every wallet (including deactivated, for ledger history). */
export async function getWalletNameMap(): Promise<Map<string, string>> {
  const outletId = requireActiveOutletId();
  const rows = await db
    .select({ id: TABLE.wallets.id, name: TABLE.wallets.name })
    .from(TABLE.wallets)
    .where(eq(TABLE.wallets.outletId, outletId));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * Counterparty names for transfer pairs on a ledger page: referenceId →
 * the OTHER wallet's name.
 */
export async function getTransferCounterparties(
  pairs: ReadonlyArray<{ referenceId: string; walletId: string }>
): Promise<Map<string, string>> {
  if (pairs.length === 0) {
    return new Map();
  }
  const outletId = requireActiveOutletId();
  const refIds = [...new Set(pairs.map((p) => p.referenceId))];
  const names = await getWalletNameMap();
  const rows = await db
    .select({
      referenceId: TABLE.walletTransactions.referenceId,
      walletId: TABLE.walletTransactions.walletId,
    })
    .from(TABLE.walletTransactions)
    .where(eq(TABLE.walletTransactions.outletId, outletId));
  const result = new Map<string, string>();
  for (const row of rows) {
    if (!(row.referenceId && refIds.includes(row.referenceId))) {
      continue;
    }
    for (const pair of pairs) {
      if (
        pair.referenceId === row.referenceId &&
        row.walletId !== pair.walletId
      ) {
        const name = names.get(row.walletId);
        if (name) {
          result.set(pair.referenceId, name);
        }
      }
    }
  }
  return result;
}
