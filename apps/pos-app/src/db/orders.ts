import {
	categories,
	orderItems,
	orders,
	products,
	users,
} from "@repo/database";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import { and, desc, eq, gte, like, lt, type SQL, sql } from "drizzle-orm";
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
		price: number;
		product_id: number;
		product_name: string;
		qty: number;
	}[];
	paymentMethod: "cash" | "qris";
	total: number;
	userId: number;
}): Promise<string> {
	const today = dayjs().format("YYYY-MM-DD");
	const orderNumber = await getNextOrderNumber(today);

	const now = dayjs().toISOString();

	const insertOrder: SqlStatement = {
		sql: `INSERT INTO orders (order_number, user_id, total, payment_method, amount_paid, change_amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
		params: [
			orderNumber,
			data.userId,
			data.total,
			data.paymentMethod,
			data.amountPaid,
			data.changeAmount,
			now,
			now,
		],
	};

	const itemStatements: SqlStatement[] = data.items.map((item) => ({
		sql: "INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, created_at) VALUES (LAST_INSERT_ROWID(), ?, ?, ?, ?, ?, ?)",
		params: [
			item.product_id,
			item.product_name,
			item.qty,
			item.price,
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
		.where(like(orders.orderNumber, `${prefix}%`))
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
	const rows = await db
		.select({
			categoryId: products.categoryId,
			categoryIsActive: categories.isActive,
			categoryName: categories.name,
			createdAt: products.createdAt,
			id: products.id,
			imageUrl: products.imageUrl,
			isActive: products.isActive,
			name: products.name,
			price: products.price,
			sortOrder: products.sortOrder,
			updatedAt: products.updatedAt,
		})
		.from(products)
		.innerJoin(categories, eq(products.categoryId, categories.id))
		.where(and(eq(products.isActive, true), eq(categories.isActive, true)))
		.orderBy(categories.name, products.name, products.id);

	const grouped = new Map<string, ProductWithCategory[]>();
	for (const row of rows) {
		const list = grouped.get(row.categoryName) ?? [];
		list.push({
			categoryId: row.categoryId,
			categoryName: row.categoryName,
			createdAt: row.createdAt,
			id: row.id,
			imageUrl: row.imageUrl,
			isActive: row.isActive,
			name: row.name,
			price: row.price,
			sortOrder: row.sortOrder,
			updatedAt: row.updatedAt,
		});
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
	id: number;
	orderNumber: string;
	paymentMethod: "cash" | "qris";
	status: "completed" | "cancelled";
	total: number;
	userId: number | null;
	userName: string;
}

export interface OrderItemRow {
	id: number;
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
	const conditions: SQL[] = [];
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
			total: orders.total,
			userId: orders.userId,
			userName: users.name,
		})
		.from(orders)
		.innerJoin(users, eq(orders.userId, users.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(orders.createdAt));

	return rows.map((r) => ({
		...r,
		paymentMethod: r.paymentMethod as "cash" | "qris",
		status: r.status as "completed" | "cancelled",
	}));
}

export async function getOrderItems(orderId: number): Promise<OrderItemRow[]> {
	return await db
		.select({
			id: orderItems.id,
			productName: orderItems.productName,
			quantity: orderItems.quantity,
			subtotal: orderItems.subtotal,
			unitPrice: orderItems.unitPrice,
		})
		.from(orderItems)
		.where(eq(orderItems.orderId, orderId));
}

export async function cancelOrder(orderId: number): Promise<void> {
	await db
		.update(orders)
		.set({ status: "cancelled", updatedAt: dayjs().toISOString() })
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

	const rows = await db
		.select({
			cashTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.total} ELSE 0 END), 0)`,
			orderCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
			qrisTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN ${orders.total} ELSE 0 END), 0)`,
			totalRevenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
		})
		.from(orders)
		.where(
			and(
				gte(orders.createdAt, date),
				lt(orders.createdAt, nextDayStr),
				eq(orders.status, "completed"),
			),
		);

	return (
		rows[0] ?? { cashTotal: 0, orderCount: 0, qrisTotal: 0, totalRevenue: 0 }
	);
}
