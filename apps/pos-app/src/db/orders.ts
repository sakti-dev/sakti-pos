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
	currentMerchantId,
	currentOutletId,
	currentRegisterId,
} from "~/store/outlet";
import { db } from "./index";
import type { Product } from "./menu";

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
}): Promise<string> {
	const today = dayjs().format("YYYY-MM-DD");
	const orderNumber = await getNextOrderNumber(today);

	const now = dayjs().toISOString();
	const outletId = currentOutletId();
	const registerId = currentRegisterId();

	const insertOrder: SqlStatement = {
		sql: `INSERT INTO orders (order_number, staff_id, register_id, outlet_id, total, payment_method, amount_paid, change_amount, status, created_at, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, 0)`,
		params: [
			orderNumber,
			data.staffId,
			registerId ?? null,
			outletId ?? null,
			data.total,
			data.paymentMethod,
			data.amountPaid,
			data.changeAmount,
			now,
			now,
		],
	};

	const itemStatements: SqlStatement[] = data.items.map((item) => ({
		sql: "INSERT INTO order_items (order_id, outlet_id, product_id, product_name, quantity, unit_price, original_price, subtotal, created_at, is_synced) VALUES (LAST_INSERT_ROWID(), ?, ?, ?, ?, ?, ?, ?, 0)",
		params: [
			outletId ?? null,
			item.product_id,
			item.product_name,
			item.qty,
			item.price,
			item.originalPrice ?? null,
			item.qty * item.price,
			now,
		],
	}));

	await invoke<BatchResult>("run_sql_batch", {
		statements: [insertOrder, ...itemStatements],
	});

	return orderNumber;
}

async function getNextOrderNumber(date: string): Promise<string> {
	const prefix = `${date}-`;
	const rows = await db
		.select({ orderNumber: orders.orderNumber })
		.from(orders)
		.where(
			and(like(orders.orderNumber, `${prefix}%`), isNull(orders.deletedAt)),
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
	status: "completed" | "cancelled";
	staffId: string | null;
	staffName: string;
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

export async function getOrders(filter: {
	dateFrom?: string;
	dateTo?: string;
	status?: "completed" | "cancelled";
}): Promise<OrderRow[]> {
	const conditions: SQL[] = [isNull(orders.deletedAt)];
	const outletId = currentOutletId();
	if (outletId) conditions.push(eq(orders.outletId, outletId));
	if (filter.status) {
		conditions.push(eq(orders.status, filter.status));
	}
	if (filter.dateFrom) {
		conditions.push(gte(orders.createdAt, filter.dateFrom));
	}
	if (filter.dateTo) {
		const nextDayStr = dayjs(filter.dateTo).add(1, "day").format("YYYY-MM-DD");
		conditions.push(lt(orders.createdAt, nextDayStr));
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
}

export interface DailySummary {
	cashTotal: number;
	orderCount: number;
	qrisTotal: number;
	totalRevenue: number;
}

export async function getDailySummary(date: string): Promise<DailySummary> {
	const nextDayStr = dayjs(date).add(1, "day").format("YYYY-MM-DD");

	const outletId = currentOutletId();
	const conditions = [
		gte(orders.createdAt, date),
		lt(orders.createdAt, nextDayStr),
		eq(orders.status, "completed"),
		isNull(orders.deletedAt),
	];
	if (outletId) conditions.push(eq(orders.outletId, outletId));

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
