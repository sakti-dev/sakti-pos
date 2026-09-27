import dayjs from "dayjs";
import { and, desc, eq, gte, isNull, like } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import {
  currentOutletId,
  currentOutletTimezone,
  currentRegisterId,
} from "~/lib/auth/session";
import type { OrderRepository } from "~/lib/sales/order-repository";
import type { CompletedOrder } from "~/lib/sales/types";
import { db, TABLE } from "./index";

export type OrderRow = typeof TABLE.orders.$inferSelect;
export type OrderItemRow = typeof TABLE.orderItems.$inferSelect;

/**
 * Persist a committed sale: one `orders` row + one `order_items` row per
 * line, in a single write transaction with sync enqueues. Money converts to
 * minor units at this seam (whole Rupiah in the sale loop).
 */
export async function persistOrder(order: CompletedOrder): Promise<OrderRow> {
  const outletId = currentOutletId();
  if (!outletId) {
    throw new Error("persistOrder: no active outlet");
  }

  const now = dayjs().toISOString();
  const registerId = currentRegisterId();

  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [orderRow] = await tx
      .insert(TABLE.orders)
      .values({
        id: crypto.randomUUID(),
        outletId,
        ...(registerId ? { registerId } : {}),
        orderNumber: order.id,
        totalMinorUnits: order.total * 100,
        paymentMethod: order.payment.method,
        amountPaidMinorUnits: order.paid * 100,
        changeAmountMinorUnits: order.change * 100,
        status: "completed",
        createdAt: order.createdAt
          ? new Date(order.createdAt).toISOString()
          : now,
        updatedAt: now,
      })
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: orderRow.id,
      table: TABLE.orders,
    });

    for (const line of order.lines) {
      const [itemRow] = await tx
        .insert(TABLE.orderItems)
        .values({
          orderId: orderRow.id,
          outletId,
          productId: line.productId,
          productName: line.name,
          quantity: line.qty,
          unitPriceMinorUnits: line.price * 100,
          subtotalMinorUnits: line.price * line.qty * 100,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: itemRow.id,
        table: TABLE.orderItems,
      });
    }

    return orderRow;
  });
}

export interface OrderWithItems {
  readonly items: readonly OrderItemRow[];
  readonly order: OrderRow;
}

export async function listOrders(limit = 50): Promise<OrderRow[]> {
  const outletId = currentOutletId();
  const conditions = [isNull(TABLE.orders.deletedAt)];
  if (outletId) {
    conditions.push(eq(TABLE.orders.outletId, outletId));
  }
  return await db
    .select()
    .from(TABLE.orders)
    .where(and(...conditions))
    .orderBy(desc(TABLE.orders.createdAt))
    .limit(limit);
}

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  return await db
    .select()
    .from(TABLE.orderItems)
    .where(eq(TABLE.orderItems.orderId, orderId));
}

/**
 * Repository adapter persisting committed orders to the synced database.
 * `commit` is the path that matters in production; `get`/`list` map rows
 * back to the in-memory shape (category/image snapshots degrade).
 */
/** Business date (YYYY-MM-DD) in the outlet's configured timezone. */
export function businessDate(now: Date = new Date()): string {
  const tz = currentOutletTimezone();
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA").format(now);
  }
}

/**
 * Next order number `YYYY-MM-DD-NNN` per spec orders R4: max existing
 * suffix for today's business date, incremented (001 when none).
 */
export async function nextOrderNumber(): Promise<string> {
  const date = businessDate();
  const rows = await db
    .select({ orderNumber: TABLE.orders.orderNumber })
    .from(TABLE.orders)
    .where(like(TABLE.orders.orderNumber, `${date}-%`));
  let max = 0;
  for (const row of rows) {
    const suffix = Number.parseInt(row.orderNumber.slice(date.length + 1), 10);
    if (Number.isInteger(suffix) && suffix > max) {
      max = suffix;
    }
  }
  return `${date}-${String(max + 1).padStart(3, "0")}`;
}

export class DrizzleOrderRepository implements OrderRepository {
  async commit(order: CompletedOrder): Promise<void> {
    await persistOrder(order);
  }

  async nextOrderNumber(): Promise<string> {
    return await nextOrderNumber();
  }

  async get(id: string): Promise<CompletedOrder | undefined> {
    const [row] = await db
      .select()
      .from(TABLE.orders)
      .where(eq(TABLE.orders.id, id));
    if (!row) {
      return;
    }
    const items = await getOrderItems(id);
    return rowToCompletedOrder(row, items);
  }

  async list(): Promise<readonly CompletedOrder[]> {
    const rows = await listOrders(100);
    const result: CompletedOrder[] = [];
    for (const row of rows) {
      const items = await getOrderItems(row.id);
      result.push(rowToCompletedOrder(row, items));
    }
    return result;
  }
}

function toPayMethod(value: string): CompletedOrder["payment"]["method"] {
  if (value === "qris_static" || value === "qris_dynamic") {
    return value;
  }
  if (value === "qris") {
    return "qris_static";
  }
  return "cash";
}

function rowToCompletedOrder(
  row: OrderRow,
  items: readonly OrderItemRow[]
): CompletedOrder {
  const total = row.totalMinorUnits / 100;
  const paid = (row.amountPaidMinorUnits ?? row.totalMinorUnits) / 100;
  const lines = items.map((item) => ({
    category: "",
    imageAssetId: null,
    name: item.productName,
    price: item.unitPriceMinorUnits / 100,
    productId: item.productId ?? item.id,
    qty: item.quantity,
  }));
  return {
    change: (row.changeAmountMinorUnits ?? 0) / 100,
    createdAt: new Date(row.createdAt).getTime(),
    id: row.orderNumber,
    lines,
    paid,
    payment: { method: toPayMethod(row.paymentMethod) },
    subtotal: items.reduce((s, i) => s + i.subtotalMinorUnits / 100, 0),
    tax: Math.max(
      0,
      total - items.reduce((s, i) => s + i.subtotalMinorUnits / 100, 0)
    ),
    taxRate: 0,
    total,
  };
}

/** Recent orders with their items in two queries (no N+1 IPC). */
export async function listRecentOrderEntries(
  limit = 50
): Promise<readonly OrderWithItems[]> {
  const rows = await listOrders(limit);
  if (rows.length === 0) {
    return [];
  }
  const outletId = currentOutletId();
  const conditions = [isNull(TABLE.orderItems.deletedAt)];
  if (outletId) {
    conditions.push(eq(TABLE.orderItems.outletId, outletId));
  }
  const allItems = await db
    .select()
    .from(TABLE.orderItems)
    .where(and(...conditions));
  const byOrder = new Map<string, OrderItemRow[]>();
  for (const item of allItems) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }
  return rows.map((order) => ({
    items: byOrder.get(order.id) ?? [],
    order,
  }));
}

export interface TodayOrderStats {
  readonly byMethod: Readonly<Record<string, number>>;
  readonly count: number;
  readonly totalMinorUnits: number;
}

/** Today's completed-order totals for the active outlet. */
export async function getTodayOrderStats(): Promise<TodayOrderStats> {
  const outletId = currentOutletId();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

  const conditions: ReturnType<typeof eq>[] = [
    isNull(TABLE.orders.deletedAt),
    eq(TABLE.orders.status, "completed"),
    gte(TABLE.orders.createdAt, startIso),
  ];
  if (outletId) {
    conditions.push(eq(TABLE.orders.outletId, outletId));
  }
  const rows = await db
    .select({
      paymentMethod: TABLE.orders.paymentMethod,
      total: TABLE.orders.totalMinorUnits,
    })
    .from(TABLE.orders)
    .where(and(...conditions));

  const byMethod: Record<string, number> = {};
  let totalMinorUnits = 0;
  for (const row of rows) {
    byMethod[row.paymentMethod] = (byMethod[row.paymentMethod] ?? 0) + 1;
    totalMinorUnits += row.total;
  }
  return { byMethod, count: rows.length, totalMinorUnits };
}
