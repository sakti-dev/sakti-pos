import dayjs from "dayjs";
import {
  and,
  desc,
  eq,
  gte,
  isNull,
  like,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  formatUtcTimestamp,
  getBusinessDateFromInstant,
  toUtcRangeForBusinessDate,
} from "~/lib/date-time";
import { getSyncClient } from "~/lib/sync";
import {
  currentMerchantId,
  currentOutletId,
  currentOutletTimezone,
  currentRegisterId,
} from "~/store/outlet";
import { db, TABLE } from "./index";
import type { Product } from "./menu";

export async function createOrder(data: {
  amountPaidMinorUnits: number | null;
  createdAt?: string;
  items: {
    originalPriceMinorUnits?: number;
    priceMinorUnits: number;
    product_id: string;
    product_name: string;
    qty: number;
  }[];
  paymentMethod: "cash" | "qris";
  staffId: string;
  totalMinorUnits: number;
  changeAmountMinorUnits: number | null;
  timezone?: string;
}): Promise<string> {
  const timezone = data.timezone ?? currentOutletTimezone();
  const createdAt = data.createdAt ?? formatUtcTimestamp();
  const businessDate = getBusinessDateFromInstant(createdAt, timezone);
  const orderNumber = await getNextOrderNumber(businessDate);
  const outletId = currentOutletId();
  const registerId = currentRegisterId();
  const orderId = crypto.randomUUID();

  const orderItemsWithIds = data.items.map((item) => ({
    id: crypto.randomUUID(),
    item,
  }));

  await getSyncClient().writeTransaction(db, async (tx) => {
    await tx.insert(TABLE.orders).values({
      id: orderId,
      orderNumber,
      staffId: data.staffId,
      registerId: registerId ?? undefined,
      outletId: outletId ?? "",
      totalMinorUnits: data.totalMinorUnits,
      paymentMethod: data.paymentMethod,
      amountPaidMinorUnits: data.amountPaidMinorUnits,
      changeAmountMinorUnits: data.changeAmountMinorUnits,
      status: "completed",
      isSynced: false,
      createdAt,
      updatedAt: createdAt,
    });

    for (const { id, item } of orderItemsWithIds) {
      await tx.insert(TABLE.orderItems).values({
        id,
        orderId,
        outletId: outletId ?? "",
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.qty,
        unitPriceMinorUnits: item.priceMinorUnits,
        originalPriceMinorUnits: item.originalPriceMinorUnits ?? undefined,
        subtotalMinorUnits: item.qty * item.priceMinorUnits,
        isSynced: false,
        createdAt,
        updatedAt: createdAt,
      });
    }

    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: orderId,
      table: TABLE.orders,
    });

    for (const { id } of orderItemsWithIds) {
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: id,
        table: TABLE.orderItems,
      });
    }
  });

  return orderNumber;
}

async function getNextOrderNumber(date: string): Promise<string> {
  const prefix = `${date}-`;
  const rows = await db
    .select({ orderNumber: TABLE.orders.orderNumber })
    .from(TABLE.orders)
    .where(
      and(
        like(TABLE.orders.orderNumber, `${prefix}%`),
        isNull(TABLE.orders.deletedAt)
      )
    )
    .orderBy(
      sql`LENGTH(${TABLE.orders.orderNumber})`,
      TABLE.orders.orderNumber
    );

  const maxNum = rows.reduce((max, row) => {
    const suffix = row.orderNumber.slice(prefix.length);
    const n = Number.parseInt(suffix, 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);

  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

export type ProductWithCategory = Product & { categoryName: string };

export async function getActiveProductsByCategory(): Promise<
  { categoryName: string; products: ProductWithCategory[] }[]
> {
  const merchantId = currentMerchantId();
  const conditions = [
    eq(TABLE.products.isActive, true),
    eq(TABLE.categories.isActive, true),
    isNull(TABLE.products.deletedAt),
    isNull(TABLE.categories.deletedAt),
  ];
  if (merchantId) {
    conditions.push(eq(TABLE.products.merchantId, merchantId));
  }

  const rows = await db
    .select({
      categoryId: TABLE.products.categoryId,
      categoryName: TABLE.categories.name,
      createdAt: TABLE.products.createdAt,
      deletedAt: TABLE.products.deletedAt,
      id: TABLE.products.id,
      imageAssetId: TABLE.products.imageAssetId,
      isActive: TABLE.products.isActive,
      isSynced: TABLE.products.isSynced,
      merchantId: TABLE.products.merchantId,
      name: TABLE.products.name,
      priceMinorUnits: TABLE.products.priceMinorUnits,
      sortOrder: TABLE.products.sortOrder,
      updatedAt: TABLE.products.updatedAt,
    })
    .from(TABLE.products)
    .innerJoin(
      TABLE.categories,
      eq(TABLE.products.categoryId, TABLE.categories.id)
    )
    .where(and(...conditions))
    .orderBy(TABLE.categories.name, TABLE.products.name, TABLE.products.id);

  const grouped = new Map<string, ProductWithCategory[]>();
  for (const row of rows) {
    const list = grouped.get(row.categoryName) ?? [];
    list.push(row);
    grouped.set(row.categoryName, list);
  }

  return Array.from(grouped.entries()).map(([categoryName, prods]) => ({
    categoryName,
    products: prods,
  }));
}

export interface OrderRow {
  amountPaidMinorUnits: number | null;
  changeAmountMinorUnits: number | null;
  createdAt: string;
  id: string;
  orderNumber: string;
  paymentMethod: "cash" | "qris";
  staffId: string | null;
  staffName: string;
  status: "completed" | "cancelled";
  totalMinorUnits: number;
}

export interface OrderItemRow {
  id: string;
  productName: string;
  quantity: number;
  subtotalMinorUnits: number;
  unitPriceMinorUnits: number;
}

export type OrderWithItems = OrderRow & { items: OrderItemRow[] };

export async function getOrders(
  filter: {
    dateFrom?: string;
    dateTo?: string;
    status?: "completed" | "cancelled";
  },
  timezone = currentOutletTimezone()
): Promise<OrderRow[]> {
  const conditions: SQL[] = [isNull(TABLE.orders.deletedAt)];
  const outletId = currentOutletId();
  if (outletId) {
    conditions.push(eq(TABLE.orders.outletId, outletId));
  }
  if (filter.status) {
    conditions.push(eq(TABLE.orders.status, filter.status));
  }
  if (filter.dateFrom) {
    const range = toUtcRangeForBusinessDate(filter.dateFrom, timezone);
    conditions.push(gte(TABLE.orders.createdAt, range.startUtc));
  }
  if (filter.dateTo) {
    const range = toUtcRangeForBusinessDate(filter.dateTo, timezone);
    conditions.push(lt(TABLE.orders.createdAt, range.endExclusiveUtc));
  }

  const rows = await db
    .select({
      amountPaidMinorUnits: TABLE.orders.amountPaidMinorUnits,
      changeAmountMinorUnits: TABLE.orders.changeAmountMinorUnits,
      createdAt: TABLE.orders.createdAt,
      id: TABLE.orders.id,
      orderNumber: TABLE.orders.orderNumber,
      paymentMethod: TABLE.orders.paymentMethod,
      status: TABLE.orders.status,
      staffId: TABLE.orders.staffId,
      staffName: TABLE.staff.name,
      totalMinorUnits: TABLE.orders.totalMinorUnits,
    })
    .from(TABLE.orders)
    .innerJoin(TABLE.staff, eq(TABLE.orders.staffId, TABLE.staff.id))
    .where(and(...conditions))
    .orderBy(desc(TABLE.orders.createdAt));

  return rows.map((r) => ({
    ...r,
    paymentMethod: r.paymentMethod as "cash" | "qris",
    status: r.status as "completed" | "cancelled",
  }));
}

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  return await db
    .select({
      id: TABLE.orderItems.id,
      productName: TABLE.orderItems.productName,
      quantity: TABLE.orderItems.quantity,
      subtotalMinorUnits: TABLE.orderItems.subtotalMinorUnits,
      unitPriceMinorUnits: TABLE.orderItems.unitPriceMinorUnits,
    })
    .from(TABLE.orderItems)
    .where(
      and(
        eq(TABLE.orderItems.orderId, orderId),
        isNull(TABLE.orderItems.deletedAt)
      )
    );
}

export async function cancelOrder(orderId: string): Promise<void> {
  await getSyncClient().writeTransaction(db, async (tx) => {
    await getSyncClient().writeLocalChange(tx, {
      operation: "update",
      rowId: orderId,
      table: TABLE.orders,
      write: (writeTx) =>
        writeTx
          .update(TABLE.orders)
          .set({
            status: "cancelled",
            updatedAt: dayjs().toISOString(),
            isSynced: false,
          })
          .where(eq(TABLE.orders.id, orderId)),
    });
  });
}

export interface DailySummary {
  cashTotal: number;
  orderCount: number;
  qrisTotal: number;
  totalRevenue: number;
}

export async function getDailySummary(
  date: string,
  timezone = currentOutletTimezone()
): Promise<DailySummary> {
  const range = toUtcRangeForBusinessDate(date, timezone);

  const outletId = currentOutletId();
  const conditions = [
    gte(TABLE.orders.createdAt, range.startUtc),
    lt(TABLE.orders.createdAt, range.endExclusiveUtc),
    eq(TABLE.orders.status, "completed"),
    isNull(TABLE.orders.deletedAt),
  ];
  if (outletId) {
    conditions.push(eq(TABLE.orders.outletId, outletId));
  }

  const rows = await db
    .select({
      cashTotal: sql<number>`COALESCE(SUM(CASE WHEN ${TABLE.orders.paymentMethod} = 'cash' THEN ${TABLE.orders.totalMinorUnits} ELSE 0 END), 0)`,
      orderCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      qrisTotal: sql<number>`COALESCE(SUM(CASE WHEN ${TABLE.orders.paymentMethod} = 'qris' THEN ${TABLE.orders.totalMinorUnits} ELSE 0 END), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(${TABLE.orders.totalMinorUnits}), 0)`,
    })
    .from(TABLE.orders)
    .where(and(...conditions));

  return (
    rows[0] ?? { cashTotal: 0, orderCount: 0, qrisTotal: 0, totalRevenue: 0 }
  );
}
