import {
  categories,
  orderItems,
  orders,
  products,
  staff,
} from "@repo/database";
import { invoke } from "@tauri-apps/api/core";
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
import {
  currentMerchantId,
  currentOutletId,
  currentOutletTimezone,
  currentRegisterId,
} from "~/store/outlet";
import { db } from "./index";
import type { Product } from "./menu";
import { recordLocalChange } from "./sync-outbox";

interface SqlStatement {
  params: unknown[];
  sql: string;
}

interface BatchResult {
  last_insert_id: number;
  rows_affected: number;
}

export async function createOrder(data: {
  amountPaid: number | null;
  changeAmount: number | null;
  createdAt?: string;
  items: {
    originalPrice?: number;
    price: number;
    product_id: string;
    product_name: string;
    qty: number;
  }[];
  paymentMethod: "cash" | "qris";
  staffId: string;
  total: number;
  timezone?: string;
}): Promise<string> {
  const timezone = data.timezone ?? currentOutletTimezone();
  const createdAt = data.createdAt ?? formatUtcTimestamp();
  const businessDate = getBusinessDateFromInstant(createdAt, timezone);
  const orderNumber = await getNextOrderNumber(businessDate);
  const outletId = currentOutletId();
  const registerId = currentRegisterId();
  const orderId = crypto.randomUUID();

  const insertOrder: SqlStatement = {
    sql: `INSERT INTO orders (id, order_number, staff_id, register_id, outlet_id, total, payment_method, amount_paid, change_amount, status, created_at, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, 0)`,
    params: [
      orderId,
      orderNumber,
      data.staffId,
      registerId ?? null,
      outletId ?? null,
      data.total,
      data.paymentMethod,
      data.amountPaid,
      data.changeAmount,
      createdAt,
      createdAt,
    ],
  };

  const orderItemsWithIds = data.items.map((item) => ({
    id: crypto.randomUUID(),
    item,
  }));

  const itemStatements: SqlStatement[] = orderItemsWithIds.map(
    ({ id, item }) => ({
      sql: "INSERT INTO order_items (id, order_id, outlet_id, product_id, product_name, quantity, unit_price, original_price, subtotal, created_at, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
      params: [
        id,
        orderId,
        outletId ?? null,
        item.product_id,
        item.product_name,
        item.qty,
        item.price,
        item.originalPrice ?? null,
        item.qty * item.price,
        createdAt,
        createdAt,
      ],
    })
  );

  const scopeId = outletId ?? "";
  const outboxChangedAt = createdAt;
  const outboxStatements: SqlStatement[] = [
    {
      sql: "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_id, scope_type, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      params: [
        crypto.randomUUID(),
        "orders",
        orderId,
        "insert",
        scopeId,
        "outlet",
        outboxChangedAt,
      ],
    },
    ...orderItemsWithIds.map(({ id }) => ({
      sql: "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_id, scope_type, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      params: [
        crypto.randomUUID(),
        "order_items",
        id,
        "insert",
        scopeId,
        "outlet",
        outboxChangedAt,
      ],
    })),
  ];

  await invoke<BatchResult>("run_sql_batch", {
    statements: [insertOrder, ...itemStatements, ...outboxStatements],
  });

  return orderNumber;
}

async function getNextOrderNumber(date: string): Promise<string> {
  const prefix = `${date}-`;
  const rows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(
      and(like(orders.orderNumber, `${prefix}%`), isNull(orders.deletedAt))
    )
    .orderBy(sql`LENGTH(${orders.orderNumber})`, orders.orderNumber);

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
    eq(products.isActive, true),
    eq(categories.isActive, true),
    isNull(products.deletedAt),
    isNull(categories.deletedAt),
  ];
  if (merchantId) {
    conditions.push(eq(products.merchantId, merchantId));
  }

  const rows = await db
    .select({
      categoryId: products.categoryId,
      categoryName: categories.name,
      createdAt: products.createdAt,
      deletedAt: products.deletedAt,
      id: products.id,
      imageAssetId: products.imageAssetId,
      imageUrl: products.imageUrl,
      isActive: products.isActive,
      isSynced: products.isSynced,
      merchantId: products.merchantId,
      name: products.name,
      price: products.price,
      sortOrder: products.sortOrder,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(categories.name, products.name, products.id);

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
  amountPaid: number | null;
  changeAmount: number | null;
  createdAt: string;
  id: string;
  orderNumber: string;
  paymentMethod: "cash" | "qris";
  staffId: string | null;
  staffName: string;
  status: "completed" | "cancelled";
  total: number;
}

export interface OrderItemRow {
  id: string;
  productName: string;
  quantity: number;
  subtotal: number;
  unitPrice: number;
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
  const conditions: SQL[] = [isNull(orders.deletedAt)];
  const outletId = currentOutletId();
  if (outletId) {
    conditions.push(eq(orders.outletId, outletId));
  }
  if (filter.status) {
    conditions.push(eq(orders.status, filter.status));
  }
  if (filter.dateFrom) {
    const range = toUtcRangeForBusinessDate(filter.dateFrom, timezone);
    conditions.push(gte(orders.createdAt, range.startUtc));
  }
  if (filter.dateTo) {
    const range = toUtcRangeForBusinessDate(filter.dateTo, timezone);
    conditions.push(lt(orders.createdAt, range.endExclusiveUtc));
  }

  const rows = await db
    .select({
      amountPaid: orders.amountPaid,
      changeAmount: orders.changeAmount,
      createdAt: orders.createdAt,
      id: orders.id,
      orderNumber: orders.orderNumber,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      staffId: orders.staffId,
      staffName: staff.name,
      total: orders.total,
    })
    .from(orders)
    .innerJoin(staff, eq(orders.staffId, staff.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt));

  return rows.map((r) => ({
    ...r,
    paymentMethod: r.paymentMethod as "cash" | "qris",
    status: r.status as "completed" | "cancelled",
  }));
}

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  return await db
    .select({
      id: orderItems.id,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      subtotal: orderItems.subtotal,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
}

export async function cancelOrder(orderId: string): Promise<void> {
  await db
    .update(orders)
    .set({
      status: "cancelled",
      updatedAt: dayjs().toISOString(),
      isSynced: false,
    })
    .where(eq(orders.id, orderId));
  await recordLocalChange({
    operation: "update",
    rowId: orderId,
    scopeId: currentOutletId() ?? "",
    scopeType: "outlet",
    tableName: "orders",
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
    gte(orders.createdAt, range.startUtc),
    lt(orders.createdAt, range.endExclusiveUtc),
    eq(orders.status, "completed"),
    isNull(orders.deletedAt),
  ];
  if (outletId) {
    conditions.push(eq(orders.outletId, outletId));
  }

  const rows = await db
    .select({
      cashTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.total} ELSE 0 END), 0)`,
      orderCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      qrisTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN ${orders.total} ELSE 0 END), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
    })
    .from(orders)
    .where(and(...conditions));

  return (
    rows[0] ?? { cashTotal: 0, orderCount: 0, qrisTotal: 0, totalRevenue: 0 }
  );
}
