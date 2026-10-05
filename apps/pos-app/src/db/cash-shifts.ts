import dayjs from "dayjs";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import { currentOutletId, currentUser } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";
import {
  applyWalletReconciliation,
  applyWalletTransfer,
  getWalletStrip,
  type WalletStripRow,
} from "./wallets";

const logger = createLogger({ domain: "SHIFT", module: "cash-shifts" });

export type CashShiftRow = typeof TABLE.cashShifts.$inferSelect;

/** Wallet fields the shift-window aggregate needs. */
export interface ShiftWalletRef {
  readonly currentBalanceMinorUnits: number;
  readonly id: string;
  readonly type: "cash" | "qris";
}

/** Sale-ledger fields for the window aggregate (wallet-scoped). */
export interface WalletSaleWindowRow {
  readonly amountMinorUnits: number;
  readonly walletId: string;
}

export function computeDifferenceMinorUnits(
  actualMinorUnits: number,
  expectedMinorUnits: number
): number {
  return actualMinorUnits - expectedMinorUnits;
}

/**
 * Window sales split by wallet: cash (drawer-report) and QRIS
 * (informational). Only `sale` ledger rows count — manual movements and
 * transfers are not sales.
 */
export function sumWindowSalesByWallet(
  rows: readonly WalletSaleWindowRow[],
  cashWalletId: string | undefined,
  qrisWalletId: string | undefined
): { cashMinorUnits: number; qrisMinorUnits: number } {
  let cash = 0;
  let qris = 0;
  for (const row of rows) {
    if (cashWalletId && row.walletId === cashWalletId) {
      cash += row.amountMinorUnits;
    } else if (qrisWalletId && row.walletId === qrisWalletId) {
      qris += row.amountMinorUnits;
    }
  }
  return { cashMinorUnits: cash, qrisMinorUnits: qris };
}

/** Active default cash + qris wallets for an outlet (id + balance). */
async function shiftWalletRefs(outletId: string): Promise<{
  cash: ShiftWalletRef | undefined;
  qris: ShiftWalletRef | undefined;
}> {
  const rows = await db
    .select({
      id: TABLE.wallets.id,
      currentBalanceMinorUnits: TABLE.wallets.currentBalanceMinorUnits,
      type: TABLE.wallets.type,
      isDefault: TABLE.wallets.isDefault,
    })
    .from(TABLE.wallets)
    .where(
      and(eq(TABLE.wallets.outletId, outletId), isNull(TABLE.wallets.deletedAt))
    );
  const cashRow =
    rows.find((row) => row.type === "cash" && row.isDefault) ??
    rows.find((row) => row.type === "cash");
  const qrisRow = rows.find((row) => row.type === "qris");
  return {
    cash: cashRow
      ? {
          id: cashRow.id,
          currentBalanceMinorUnits: cashRow.currentBalanceMinorUnits,
          type: "cash",
        }
      : undefined,
    qris: qrisRow
      ? {
          id: qrisRow.id,
          currentBalanceMinorUnits: qrisRow.currentBalanceMinorUnits,
          type: "qris",
        }
      : undefined,
  };
}

/** Sale ledger rows in [fromIso, toIso) for the outlet. */
async function salesInWindow(
  outletId: string,
  fromIso: string,
  toIso: string
): Promise<WalletSaleWindowRow[]> {
  return await db
    .select({
      amountMinorUnits: TABLE.walletTransactions.amountMinorUnits,
      walletId: TABLE.walletTransactions.walletId,
    })
    .from(TABLE.walletTransactions)
    .where(
      and(
        eq(TABLE.walletTransactions.outletId, outletId),
        eq(TABLE.walletTransactions.type, "sale"),
        gte(TABLE.walletTransactions.createdAt, fromIso),
        lt(TABLE.walletTransactions.createdAt, toIso)
      )
    );
}

/** The outlet's open shift, or null when the drawer is closed. */
export async function getOpenShift(
  outletId = currentOutletId()
): Promise<CashShiftRow | null> {
  if (!outletId) {
    return null;
  }
  const rows = await db
    .select()
    .from(TABLE.cashShifts)
    .where(
      and(
        eq(TABLE.cashShifts.outletId, outletId),
        eq(TABLE.cashShifts.status, "open"),
        isNull(TABLE.cashShifts.deletedAt)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Live drawer snapshot for the home plaque: open shift + the Laci Kas
 * wallet balance (the authoritative drawer total) + the wallet strip.
 */
export async function getDrawerSnapshot(): Promise<{
  expectedInDrawerMinorUnits: number;
  shift: CashShiftRow | null;
  wallets: WalletStripRow[];
}> {
  const shift = await getOpenShift();
  const wallets = await getWalletStrip();
  if (!shift) {
    return { expectedInDrawerMinorUnits: 0, shift: null, wallets };
  }
  const { cash } = await shiftWalletRefs(shift.outletId);
  return {
    expectedInDrawerMinorUnits: cash?.currentBalanceMinorUnits ?? 0,
    shift,
    wallets,
  };
}

/**
 * Live totals for a shift's window [openedAt, now): cash sales and
 * informational QRIS sales come from the sale ledger; expected-in-drawer
 * is the Laci Kas wallet balance.
 */
export async function getShiftWindowTotals(
  shift: Pick<CashShiftRow, "initialFloatMinorUnits" | "openedAt" | "outletId">
): Promise<{
  cashMinorUnits: number;
  expectedInDrawerMinorUnits: number;
  qrisMinorUnits: number;
}> {
  const toIso = dayjs().toISOString();
  let walletRefs: Awaited<ReturnType<typeof shiftWalletRefs>>;
  let sales: WalletSaleWindowRow[];
  try {
    walletRefs = await shiftWalletRefs(shift.outletId);
    sales = await salesInWindow(shift.outletId, shift.openedAt, toIso);
  } catch (error) {
    logger.error("WINDOW_QUERY_FAILED", String(error), {
      fromIso: shift.openedAt,
      outletId: shift.outletId,
      toIso,
    });
    throw error;
  }
  const { cashMinorUnits, qrisMinorUnits } = sumWindowSalesByWallet(
    sales,
    walletRefs.cash?.id,
    walletRefs.qris?.id
  );
  logger.info("WINDOW_TOTALS", {
    cashMinorUnits,
    expectedInDrawerMinorUnits: walletRefs.cash?.currentBalanceMinorUnits ?? 0,
    fromIso: shift.openedAt,
    outletId: shift.outletId,
    qrisMinorUnits,
    rows: sales.length,
    toIso,
  });
  return {
    cashMinorUnits,
    expectedInDrawerMinorUnits: walletRefs.cash?.currentBalanceMinorUnits ?? 0,
    qrisMinorUnits,
  };
}

/**
 * Open a shift: float + opener, `status: 'open'`, outbox-enqueued. The
 * declared float is the total cash in the drawer at open — the Laci Kas
 * wallet is reconciled to it (fresh install: 0 → float; steady state:
 * usually a no-op), so wallet balance = drawer truth from the start.
 */
export async function openShift(
  initialFloatMinorUnits: number
): Promise<CashShiftRow> {
  const outletId = currentOutletId();
  const staff = currentUser();
  if (!outletId) {
    throw new Error("openShift: no active outlet");
  }
  if (!staff) {
    throw new Error("openShift: no authenticated staff");
  }
  if (!Number.isInteger(initialFloatMinorUnits) || initialFloatMinorUnits < 0) {
    throw new Error(
      "openShift: float must be a non-negative integer (minor units)"
    );
  }

  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(TABLE.cashShifts)
      .values({
        id: crypto.randomUUID(),
        outletId,
        openedByStaffId: staff.id,
        openedAt: now,
        initialFloatMinorUnits,
        status: "open",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.cashShifts,
    });

    const [cashWallet] = await tx
      .select()
      .from(TABLE.wallets)
      .where(
        and(
          eq(TABLE.wallets.outletId, outletId),
          eq(TABLE.wallets.type, "cash"),
          isNull(TABLE.wallets.deletedAt)
        )
      )
      .limit(1);
    if (cashWallet) {
      const variance =
        initialFloatMinorUnits - cashWallet.currentBalanceMinorUnits;
      if (variance !== 0) {
        await applyWalletReconciliation(tx, {
          countedMinorUnits: initialFloatMinorUnits,
          notes: "Modal awal shift",
          referenceId: row.id,
          walletId: cashWallet.id,
        });
      }
    } else {
      logger.warn("SHIFT:OPEN_WALLET_MISSING", { outletId, shiftId: row.id });
    }

    logger.info("SHIFT:OPENED", {
      floatMinorUnits: initialFloatMinorUnits,
      shiftId: row.id,
      staffId: staff.id,
    });
    return row;
  });
}

/** Setoran: money moved out of the drawer at close, into another wallet. */
export interface CloseSetoranInput {
  readonly amountMinorUnits: number;
  readonly toWalletId: string;
}

/**
 * Close a shift. Expected cash is the Laci Kas wallet balance read INSIDE
 * the write transaction. The close additionally writes wallet ledger
 * events: a reconciliation applying the counted variance to Laci Kas, and
 * — when setoran is provided — a linked transfer pair moving the money out.
 */
export async function closeShift(input: {
  actualCashMinorUnits: number;
  note?: string;
  setoran?: CloseSetoranInput;
  shiftId: string;
}): Promise<CashShiftRow> {
  const staff = currentUser();
  if (!staff) {
    throw new Error("closeShift: no authenticated staff");
  }
  if (
    !Number.isInteger(input.actualCashMinorUnits) ||
    input.actualCashMinorUnits < 0
  ) {
    throw new Error(
      "closeShift: actual must be a non-negative integer (minor units)"
    );
  }
  if (input.setoran) {
    if (
      !Number.isInteger(input.setoran.amountMinorUnits) ||
      input.setoran.amountMinorUnits <= 0
    ) {
      throw new Error("closeShift: setoran must be a positive integer");
    }
    if (input.setoran.amountMinorUnits > input.actualCashMinorUnits) {
      throw new Error("closeShift: setoran cannot exceed the counted cash");
    }
  }

  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [shift] = await tx
      .select()
      .from(TABLE.cashShifts)
      .where(eq(TABLE.cashShifts.id, input.shiftId))
      .limit(1);
    if (!shift || shift.status !== "open") {
      throw new Error("closeShift: shift not found or already closed");
    }
    const closedAt = dayjs().toISOString();

    /* Expected = the Laci Kas balance right now (authoritative drawer total). */
    const outletId = shift.outletId;
    const [cashWallet] = await tx
      .select()
      .from(TABLE.wallets)
      .where(
        and(
          eq(TABLE.wallets.outletId, outletId),
          eq(TABLE.wallets.type, "cash"),
          isNull(TABLE.wallets.deletedAt)
        )
      )
      .limit(1);
    const expected = cashWallet?.currentBalanceMinorUnits ?? 0;

    const [row] = await tx
      .update(TABLE.cashShifts)
      .set({
        actualCashMinorUnits: input.actualCashMinorUnits,
        closedAt,
        closedByStaffId: staff.id,
        differenceMinorUnits: computeDifferenceMinorUnits(
          input.actualCashMinorUnits,
          expected
        ),
        expectedCashMinorUnits: expected,
        note: input.note?.trim() ? input.note.trim() : null,
        status: "closed",
        updatedAt: closedAt,
      })
      .where(eq(TABLE.cashShifts.id, shift.id))
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: TABLE.cashShifts,
    });

    /* Wallet events: reconcile the drawer to the physical count, then
       optionally move the setoran out — same transaction, one story. */
    if (cashWallet) {
      await applyWalletReconciliation(tx, {
        walletId: cashWallet.id,
        countedMinorUnits: input.actualCashMinorUnits,
        referenceId: shift.id,
        notes: input.note?.trim() ? input.note.trim() : null,
      });
      if (input.setoran) {
        await applyWalletTransfer(tx, {
          fromWalletId: cashWallet.id,
          toWalletId: input.setoran.toWalletId,
          amountMinorUnits: input.setoran.amountMinorUnits,
          notes: `Setoran tutup shift ${shift.id}`,
        });
      }
    } else {
      logger.warn("SHIFT:CLOSE_WALLET_MISSING", {
        outletId,
        shiftId: shift.id,
      });
    }

    logger.info("SHIFT:CLOSED", {
      actualMinorUnits: input.actualCashMinorUnits,
      differenceMinorUnits: row.differenceMinorUnits,
      expectedMinorUnits: expected,
      setoranAmountMinorUnits: input.setoran?.amountMinorUnits ?? null,
      shiftId: row.id,
      staffId: staff.id,
    });
    return row;
  });
}
