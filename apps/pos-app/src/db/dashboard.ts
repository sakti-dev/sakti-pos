import { categories, orderItems, orders, products } from "@repo/database";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import {
  formatInBusinessTimezone,
  getBusinessWeekStart,
  toUtcRangeForBusinessDate,
} from "~/lib/date-time";
import { currentOutletId, currentOutletTimezone } from "~/store/outlet";
import { db } from "./index";

export interface DashboardSummary {
  avgOrderValue: number;
  orderCount: number;
  totalRevenue: number;
}

export interface PaymentBreakdown {
  cashCount: number;
  cashTotal: number;
  qrisCount: number;
  qrisTotal: number;
}

export interface HourlyRow {
  hour: number;
  revenue: number;
}

export interface DailyRow {
  date: string;
  revenue: number;
}

export interface WeeklyRow {
  revenue: number;
  weekStart: string;
}

export interface MonthlyRow {
  month: string;
  revenue: number;
}

export interface TopProductRow {
  productName: string;
  quantity: number;
  revenue: number;
}

export interface CategoryRevenueRow {
  categoryName: string;
  revenue: number;
}

function addOutletCondition(conditions: unknown[], outletId: string | null) {
  if (outletId) {
    conditions.push(eq(orders.outletId, outletId));
  }
}

async function getCompletedOrders(
  dateFrom: string,
  dateTo: string,
  timezone = currentOutletTimezone()
): Promise<
  {
    createdAt: string;
    paymentMethod: "cash" | "qris";
    totalMinorUnits: number;
  }[]
> {
  const fromRange = toUtcRangeForBusinessDate(dateFrom, timezone);
  const toRange = toUtcRangeForBusinessDate(dateTo, timezone);

  const outletId = currentOutletId();
  const conditions = [
    gte(orders.createdAt, fromRange.startUtc),
    lt(orders.createdAt, toRange.endExclusiveUtc),
    eq(orders.status, "completed"),
    isNull(orders.deletedAt),
  ];
  addOutletCondition(conditions, outletId);

  return await db
    .select({
      createdAt: orders.createdAt,
      paymentMethod: orders.paymentMethod,
      totalMinorUnits: orders.totalMinorUnits,
    })
    .from(orders)
    .where(and(...conditions))
    .orderBy(orders.createdAt);
}

export async function getDashboardSummary(
  dateFrom: string,
  dateTo: string
): Promise<DashboardSummary> {
  const timezone = currentOutletTimezone();
  const fromRange = toUtcRangeForBusinessDate(dateFrom, timezone);
  const toRange = toUtcRangeForBusinessDate(dateTo, timezone);

  const outletId = currentOutletId();
  const conditions = [
    gte(orders.createdAt, fromRange.startUtc),
    lt(orders.createdAt, toRange.endExclusiveUtc),
    eq(orders.status, "completed"),
    isNull(orders.deletedAt),
  ];
  addOutletCondition(conditions, outletId);

  const rows = await db
    .select({
      orderCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.totalMinorUnits}), 0)`,
    })
    .from(orders)
    .where(and(...conditions));

  const row = rows[0];
  return {
    orderCount: row?.orderCount ?? 0,
    totalRevenue: row?.totalRevenue ?? 0,
    avgOrderValue:
      row && row.orderCount > 0
        ? Math.round(row.totalRevenue / row.orderCount)
        : 0,
  };
}

export async function getPaymentBreakdown(
  dateFrom: string,
  dateTo: string
): Promise<PaymentBreakdown> {
  const timezone = currentOutletTimezone();
  const fromRange = toUtcRangeForBusinessDate(dateFrom, timezone);
  const toRange = toUtcRangeForBusinessDate(dateTo, timezone);

  const outletId = currentOutletId();
  const conditions = [
    gte(orders.createdAt, fromRange.startUtc),
    lt(orders.createdAt, toRange.endExclusiveUtc),
    eq(orders.status, "completed"),
    isNull(orders.deletedAt),
  ];
  addOutletCondition(conditions, outletId);

  const rows = await db
    .select({
      cashCount: sql<number>`CAST(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN 1 ELSE 0 END) AS INTEGER)`,
      cashTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.totalMinorUnits} ELSE 0 END), 0)`,
      qrisCount: sql<number>`CAST(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN 1 ELSE 0 END) AS INTEGER)`,
      qrisTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN ${orders.totalMinorUnits} ELSE 0 END), 0)`,
    })
    .from(orders)
    .where(and(...conditions));

  const row = rows[0];
  return {
    cashCount: row?.cashCount ?? 0,
    cashTotal: row?.cashTotal ?? 0,
    qrisCount: row?.qrisCount ?? 0,
    qrisTotal: row?.qrisTotal ?? 0,
  };
}

export async function getHourlyBreakdown(
  dateFrom: string,
  dateTo: string
): Promise<HourlyRow[]> {
  const timezone = currentOutletTimezone();
  const rows = await getCompletedOrders(dateFrom, dateTo, timezone);

  const map = new Map<number, number>();
  for (const row of rows) {
    const hour = Number.parseInt(
      formatInBusinessTimezone(row.createdAt, timezone, "HH"),
      10
    );
    map.set(hour, (map.get(hour) ?? 0) + row.totalMinorUnits);
  }

  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    revenue: map.get(i) ?? 0,
  }));
}

export async function getDailyBreakdown(
  dateFrom: string,
  dateTo: string
): Promise<DailyRow[]> {
  const timezone = currentOutletTimezone();
  const rows = await getCompletedOrders(dateFrom, dateTo, timezone);

  const map = new Map<string, number>();
  for (const row of rows) {
    const date = formatInBusinessTimezone(
      row.createdAt,
      timezone,
      "YYYY-MM-DD"
    );
    map.set(date, (map.get(date) ?? 0) + row.totalMinorUnits);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));
}

export async function getWeeklyBreakdown(
  dateFrom: string,
  dateTo: string
): Promise<WeeklyRow[]> {
  const timezone = currentOutletTimezone();
  const rows = await getCompletedOrders(dateFrom, dateTo, timezone);

  const map = new Map<string, number>();
  for (const row of rows) {
    const localDate = formatInBusinessTimezone(
      row.createdAt,
      timezone,
      "YYYY-MM-DD"
    );
    const weekStart = getBusinessWeekStart(localDate, timezone);
    map.set(weekStart, (map.get(weekStart) ?? 0) + row.totalMinorUnits);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, revenue]) => ({ weekStart, revenue }));
}

export async function getMonthlyBreakdown(
  dateFrom: string,
  dateTo: string
): Promise<MonthlyRow[]> {
  const timezone = currentOutletTimezone();
  const rows = await getCompletedOrders(dateFrom, dateTo, timezone);

  const map = new Map<string, number>();
  for (const row of rows) {
    const month = formatInBusinessTimezone(row.createdAt, timezone, "YYYY-MM");
    map.set(month, (map.get(month) ?? 0) + row.totalMinorUnits);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));
}

export async function getTopProducts(
  dateFrom: string,
  dateTo: string,
  limit = 10
): Promise<TopProductRow[]> {
  const timezone = currentOutletTimezone();
  const fromRange = toUtcRangeForBusinessDate(dateFrom, timezone);
  const toRange = toUtcRangeForBusinessDate(dateTo, timezone);
  const outletId = currentOutletId();
  const conditions = [
    gte(orders.createdAt, fromRange.startUtc),
    lt(orders.createdAt, toRange.endExclusiveUtc),
    eq(orders.status, "completed"),
    isNull(orders.deletedAt),
    isNull(orderItems.deletedAt),
  ];
  if (outletId) {
    conditions.push(eq(orderItems.outletId, outletId));
  }

  const rows = await db
    .select({
      productName: orderItems.productName,
      quantity: sql<number>`CAST(SUM(${orderItems.quantity}) AS INTEGER)`,
      revenue: sql<number>`COALESCE(SUM(${orderItems.subtotalMinorUnits}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(...conditions))
    .groupBy(orderItems.productName)
    .orderBy(sql`SUM(${orderItems.subtotalMinorUnits}) DESC`)
    .limit(limit);

  return rows;
}

export async function getSalesByCategory(
  dateFrom: string,
  dateTo: string
): Promise<CategoryRevenueRow[]> {
  const timezone = currentOutletTimezone();
  const fromRange = toUtcRangeForBusinessDate(dateFrom, timezone);
  const toRange = toUtcRangeForBusinessDate(dateTo, timezone);
  const outletId = currentOutletId();
  const conditions = [
    gte(orders.createdAt, fromRange.startUtc),
    lt(orders.createdAt, toRange.endExclusiveUtc),
    eq(orders.status, "completed"),
    isNull(orders.deletedAt),
    isNull(orderItems.deletedAt),
    isNull(products.deletedAt),
    isNull(categories.deletedAt),
  ];
  if (outletId) {
    conditions.push(eq(orderItems.outletId, outletId));
  }

  const rows = await db
    .select({
      categoryName: categories.name,
      revenue: sql<number>`COALESCE(SUM(${orderItems.subtotalMinorUnits}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .groupBy(categories.name)
    .orderBy(sql`SUM(${orderItems.subtotalMinorUnits}) DESC`);

  return rows;
}
