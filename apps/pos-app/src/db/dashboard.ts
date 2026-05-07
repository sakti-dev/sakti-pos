import { categories, orderItems, orders, products } from "@repo/database";
import dayjs from "dayjs";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { currentShopId } from "~/lib/shop";
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
	weekStart: string;
	revenue: number;
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

function getNextDayStr(dateTo: string): string {
	return dayjs(dateTo).add(1, "day").format("YYYY-MM-DD");
}

export async function getDashboardSummary(
	dateFrom: string,
	dateTo: string,
): Promise<DashboardSummary> {
	const nextDayStr = getNextDayStr(dateTo);

	const shopId = currentShopId();
	const conditions = [
		gte(orders.createdAt, dateFrom),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
	];
	if (shopId) conditions.push(eq(orders.shopId, shopId));

	const rows = await db
		.select({
			orderCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
			totalRevenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
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
	dateTo: string,
): Promise<PaymentBreakdown> {
	const nextDayStr = getNextDayStr(dateTo);

	const shopId = currentShopId();
	const conditions = [
		gte(orders.createdAt, dateFrom),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
	];
	if (shopId) conditions.push(eq(orders.shopId, shopId));

	const rows = await db
		.select({
			cashCount: sql<number>`CAST(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN 1 ELSE 0 END) AS INTEGER)`,
			cashTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.total} ELSE 0 END), 0)`,
			qrisCount: sql<number>`CAST(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN 1 ELSE 0 END) AS INTEGER)`,
			qrisTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN ${orders.total} ELSE 0 END), 0)`,
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
	dateTo: string,
): Promise<HourlyRow[]> {
	const nextDayStr = getNextDayStr(dateTo);

	const shopId = currentShopId();
	const conditions = [
		gte(orders.createdAt, dateFrom),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
	];
	if (shopId) conditions.push(eq(orders.shopId, shopId));

	const rows = await db
		.select({
			hour: sql<number>`CAST(strftime('%H', ${orders.createdAt}) AS INTEGER)`,
			revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
		})
		.from(orders)
		.where(and(...conditions))
		.groupBy(sql`strftime('%H', ${orders.createdAt})`)
		.orderBy(sql`strftime('%H', ${orders.createdAt})`);

	const map = new Map<number, number>();
	for (const r of rows) {
		map.set(r.hour, r.revenue);
	}

	return Array.from({ length: 24 }, (_, i) => ({
		hour: i,
		revenue: map.get(i) ?? 0,
	}));
}

export async function getDailyBreakdown(
	dateFrom: string,
	dateTo: string,
): Promise<DailyRow[]> {
	const nextDayStr = getNextDayStr(dateTo);

	const shopId = currentShopId();
	const conditions = [
		gte(orders.createdAt, dateFrom),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
	];
	if (shopId) conditions.push(eq(orders.shopId, shopId));

	const rows = await db
		.select({
			date: sql<string>`strftime('%Y-%m-%d', ${orders.createdAt})`,
			revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
		})
		.from(orders)
		.where(and(...conditions))
		.groupBy(sql`strftime('%Y-%m-%d', ${orders.createdAt})`)
		.orderBy(sql`strftime('%Y-%m-%d', ${orders.createdAt})`);

	return rows;
}

export async function getWeeklyBreakdown(
	dateFrom: string,
	dateTo: string,
): Promise<WeeklyRow[]> {
	const nextDayStr = getNextDayStr(dateTo);

	const shopId = currentShopId();
	const conditions = [
		gte(orders.createdAt, dateFrom),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
	];
	if (shopId) conditions.push(eq(orders.shopId, shopId));

	const rows = await db
		.select({
			weekStart: sql<string>`strftime('%Y-%m-%d', ${orders.createdAt}, '-6 days', 'weekday 1')`,
			revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
		})
		.from(orders)
		.where(and(...conditions))
		.groupBy(sql`strftime('%Y-%W', ${orders.createdAt})`)
		.orderBy(sql`strftime('%Y-%W', ${orders.createdAt})`);

	return rows;
}

export async function getMonthlyBreakdown(
	dateFrom: string,
	dateTo: string,
): Promise<MonthlyRow[]> {
	const nextDayStr = getNextDayStr(dateTo);

	const shopId = currentShopId();
	const conditions = [
		gte(orders.createdAt, dateFrom),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
	];
	if (shopId) conditions.push(eq(orders.shopId, shopId));

	const rows = await db
		.select({
			month: sql<string>`strftime('%Y-%m', ${orders.createdAt})`,
			revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
		})
		.from(orders)
		.where(and(...conditions))
		.groupBy(sql`strftime('%Y-%m', ${orders.createdAt})`)
		.orderBy(sql`strftime('%Y-%m', ${orders.createdAt})`);

	return rows;
}

export async function getTopProducts(
	dateFrom: string,
	dateTo: string,
	limit = 10,
): Promise<TopProductRow[]> {
	const nextDayStr = getNextDayStr(dateTo);

	const shopId = currentShopId();
	const conditions = [
		gte(orders.createdAt, dateFrom),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
		isNull(orderItems.deletedAt),
	];
	if (shopId) conditions.push(eq(orders.shopId, shopId));

	const rows = await db
		.select({
			productName: orderItems.productName,
			quantity: sql<number>`CAST(SUM(${orderItems.quantity}) AS INTEGER)`,
			revenue: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(...conditions))
		.groupBy(orderItems.productName)
		.orderBy(sql`SUM(${orderItems.subtotal}) DESC`)
		.limit(limit);

	return rows;
}

export async function getSalesByCategory(
	dateFrom: string,
	dateTo: string,
): Promise<CategoryRevenueRow[]> {
	const nextDayStr = getNextDayStr(dateTo);

	const shopId = currentShopId();
	const conditions = [
		gte(orders.createdAt, dateFrom),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
		isNull(orderItems.deletedAt),
		isNull(products.deletedAt),
		isNull(categories.deletedAt),
	];
	if (shopId) conditions.push(eq(orders.shopId, shopId));

	const rows = await db
		.select({
			categoryName: categories.name,
			revenue: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.innerJoin(products, eq(orderItems.productId, products.id))
		.innerJoin(categories, eq(products.categoryId, categories.id))
		.where(and(...conditions))
		.groupBy(categories.name)
		.orderBy(sql`SUM(${orderItems.subtotal}) DESC`);

	return rows;
}
