import dayjs from "dayjs";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import { currentOutletId, currentUser } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";

const logger = createLogger({ domain: "SHIFT", module: "cash-shifts" });

export type CashShiftRow = typeof TABLE.cashShifts.$inferSelect;

/** Order fields the shift-window aggregate needs (subset of OrderRow). */
export interface OrderWindowRow {
  readonly createdAt: string;
  readonly deletedAt: string | null;
  readonly paymentMethod: string;
  readonly status: string;
  readonly totalMinorUnits: number;
}

const QRIS_METHODS = new Set(["qris", "qris_static", "qris_dynamic"]);

/**
 * Cash sale eligible for drawer expectation: completed, not deleted, paid
 * in cash, created inside the shift window [openedAt, closedAt).
 */
export function isCashSaleInShift(
  order: OrderWindowRow,
  openedAtIso: string,
  closedAtIso: string
): boolean {
  return (
    order.paymentMethod === "cash" &&
    order.status === "completed" &&
    order.deletedAt === null &&
    order.createdAt >= openedAtIso &&
    order.createdAt < closedAtIso
  );
}

/** QRIS sale in the same window — informational only (never drawer money). */
export function isQrisSaleInShift(
  order: OrderWindowRow,
  openedAtIso: string,
  closedAtIso: string
): boolean {
  return (
    QRIS_METHODS.has(order.paymentMethod) &&
    order.status === "completed" &&
    order.deletedAt === null &&
    order.createdAt >= openedAtIso &&
    order.createdAt < closedAtIso
  );
}

export function computeExpectedCash(
  initialFloatMinorUnits: number,
  orders: readonly OrderWindowRow[],
  openedAtIso: string,
  closedAtIso: string
): number {
  let sum = initialFloatMinorUnits;
  for (const order of orders) {
    if (isCashSaleInShift(order, openedAtIso, closedAtIso)) {
      sum += order.totalMinorUnits;
    }
  }
  return sum;
}

export function computeDifferenceMinorUnits(
  actualMinorUnits: number,
  expectedMinorUnits: number
): number {
  return actualMinorUnits - expectedMinorUnits;
}

/** Orders for the outlet created in [fromIso, toIso) — the SQL narrows by the outlet+created index; predicates above do the rest. */
async function ordersInWindow(
  outletId: string,
  fromIso: string,
  toIso: string
): Promise<OrderWindowRow[]> {
  return await db
    .select({
      createdAt: TABLE.orders.createdAt,
      deletedAt: TABLE.orders.deletedAt,
      paymentMethod: TABLE.orders.paymentMethod,
      status: TABLE.orders.status,
      totalMinorUnits: TABLE.orders.totalMinorUnits,
    })
    .from(TABLE.orders)
    .where(
      and(
        eq(TABLE.orders.outletId, outletId),
        gte(TABLE.orders.createdAt, fromIso),
        lt(TABLE.orders.createdAt, toIso)
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
 * Live drawer snapshot for the home plaque: open shift + the money that
 * should be in the drawer right now (float + completed cash sales).
 */
export async function getDrawerSnapshot(): Promise<{
  expectedInDrawerMinorUnits: number;
  shift: CashShiftRow | null;
}> {
  const shift = await getOpenShift();
  if (!shift) {
    return { expectedInDrawerMinorUnits: 0, shift: null };
  }
  const orders = await ordersInWindow(
    shift.outletId,
    shift.openedAt,
    dayjs().toISOString()
  );
  return {
    expectedInDrawerMinorUnits: computeExpectedCash(
      shift.initialFloatMinorUnits,
      orders,
      shift.openedAt,
      dayjs().toISOString()
    ),
    shift,
  };
}

/**
 * Live totals for a shift's window [openedAt, now): drawer-eligible cash
 * and the informational QRIS total.
 */
export async function getShiftWindowTotals(
  shift: Pick<CashShiftRow, "initialFloatMinorUnits" | "openedAt" | "outletId">
): Promise<{
  cashMinorUnits: number;
  expectedInDrawerMinorUnits: number;
  qrisMinorUnits: number;
}> {
  const toIso = dayjs().toISOString();
  const orders = await ordersInWindow(shift.outletId, shift.openedAt, toIso);
  let cash = 0;
  let qris = 0;
  for (const order of orders) {
    if (isCashSaleInShift(order, shift.openedAt, toIso)) {
      cash += order.totalMinorUnits;
    } else if (isQrisSaleInShift(order, shift.openedAt, toIso)) {
      qris += order.totalMinorUnits;
    }
  }
  return {
    cashMinorUnits: cash,
    expectedInDrawerMinorUnits: cash + shift.initialFloatMinorUnits,
    qrisMinorUnits: qris,
  };
}

/** Open a shift: float + opener, `status: 'open'`, outbox-enqueued. */
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
    logger.info("SHIFT:OPENED", {
      floatMinorUnits: initialFloatMinorUnits,
      shiftId: row.id,
      staffId: staff.id,
    });
    return row;
  });
}

/**
 * Close a shift (setoran). Expected cash is computed from the shift row
 * and its order window INSIDE the write transaction, then persisted with
 * the count, signed difference, closer identity, and status.
 */
export async function closeShift(input: {
  actualCashMinorUnits: number;
  note?: string;
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
    const orders = await tx
      .select({
        createdAt: TABLE.orders.createdAt,
        deletedAt: TABLE.orders.deletedAt,
        paymentMethod: TABLE.orders.paymentMethod,
        status: TABLE.orders.status,
        totalMinorUnits: TABLE.orders.totalMinorUnits,
      })
      .from(TABLE.orders)
      .where(
        and(
          eq(TABLE.orders.outletId, shift.outletId),
          gte(TABLE.orders.createdAt, shift.openedAt),
          lt(TABLE.orders.createdAt, closedAt)
        )
      );
    const expected = computeExpectedCash(
      shift.initialFloatMinorUnits,
      orders,
      shift.openedAt,
      closedAt
    );
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
    logger.info("SHIFT:CLOSED", {
      actualMinorUnits: input.actualCashMinorUnits,
      differenceMinorUnits: row.differenceMinorUnits,
      expectedMinorUnits: expected,
      shiftId: row.id,
      staffId: staff.id,
    });
    return row;
  });
}
