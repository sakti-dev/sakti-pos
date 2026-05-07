import {
	categories,
	orderItems,
	orders,
	outletProducts,
	outlets,
	products,
	staff,
	userMerchants,
} from "@repo/database/api-schema";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";

const ALL_SYNC_TABLE_NAMES = [
	"categories",
	"products",
	"outlet_products",
	"staff",
	"orders",
	"order_items",
];

export async function verifyOutletAccess(
	sessionUserId: string,
	requestedOutletId: string,
): Promise<boolean> {
	const [outlet] = await db
		.select({ merchantId: outlets.merchantId })
		.from(outlets)
		.where(eq(outlets.id, requestedOutletId))
		.limit(1);

	if (!outlet) return false;

	const [membership] = await db
		.select({ id: userMerchants.id })
		.from(userMerchants)
		.where(
			and(
				eq(userMerchants.userId, sessionUserId),
				eq(userMerchants.merchantId, outlet.merchantId),
			),
		)
		.limit(1);

	return !!membership;
}

type TransactionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function handlePush(
	outletId: string,
	merchantId: string,
	data: Record<string, unknown[]>,
) {
	const serverWins: { table: string; ids: string[] }[] = [];

	await db.transaction(async (tx) => {
		for (const [tableName, rows] of Object.entries(data)) {
			if (!rows || rows.length === 0) continue;

			const wins: string[] = [];

			for (const row of rows as Record<string, unknown>[]) {
				let serverWin: string | null = null;

				switch (tableName) {
					case "categories":
						serverWin = await upsertMerchantRow(
							tx,
							categories,
							row,
							merchantId,
						);
						break;
					case "products":
						serverWin = await upsertMerchantRow(tx, products, row, merchantId);
						break;
					case "outlet_products":
						serverWin = await upsertOutletRow(
							tx,
							outletProducts,
							row,
							outletId,
						);
						break;
					case "staff":
						serverWin = await upsertStaffRow(tx, row, merchantId);
						break;
					case "orders":
						serverWin = await upsertOutletRow(tx, orders, row, outletId);
						break;
					case "order_items":
						serverWin = await upsertOrderItem(tx, row, outletId);
						break;
				}

				if (serverWin) wins.push(serverWin);
			}

			if (wins.length > 0) {
				serverWins.push({ table: tableName, ids: wins });
			}
		}
	});

	return { serverWins, serverTime: new Date().toISOString() };
}

async function upsertMerchantRow(
	tx: TransactionTx,
	table: typeof categories | typeof products,
	row: Record<string, unknown>,
	merchantId: string,
): Promise<string | null> {
	const existing = await tx
		.select()
		.from(table)
		.where(eq(table.id, row.id as string))
		.limit(1);

	if (existing.length > 0) {
		const serverUpdated = new Date(
			(existing[0] as Record<string, unknown>).updatedAt as string,
		).getTime();
		const clientUpdated = new Date(row.updatedAt as string).getTime();

		if (clientUpdated >= serverUpdated) {
			await tx
				.update(table)
				.set(row)
				.where(eq(table.id, row.id as string));
			return null;
		}
		return row.id as string;
	}

	await tx.insert(table).values({ ...row, merchantId } as never);
	return null;
}

async function upsertOutletRow(
	tx: TransactionTx,
	table: typeof outletProducts | typeof orders,
	row: Record<string, unknown>,
	outletId: string,
): Promise<string | null> {
	const existing = await tx
		.select()
		.from(table)
		.where(eq(table.id, row.id as string))
		.limit(1);

	if (existing.length > 0) {
		const serverUpdated = new Date(
			(existing[0] as Record<string, unknown>).updatedAt as string,
		).getTime();
		const clientUpdated = new Date(row.updatedAt as string).getTime();

		if (clientUpdated >= serverUpdated) {
			await tx
				.update(table)
				.set(row)
				.where(eq(table.id, row.id as string));
			return null;
		}
		return row.id as string;
	}

	await tx.insert(table).values({ ...row, outletId } as never);
	return null;
}

async function upsertStaffRow(
	tx: TransactionTx,
	row: Record<string, unknown>,
	merchantId: string,
): Promise<string | null> {
	const existing = await tx
		.select()
		.from(staff)
		.where(eq(staff.id, row.id as string))
		.limit(1);

	if (existing.length > 0) {
		const serverUpdated = new Date(
			(existing[0] as Record<string, unknown>).updatedAt as string,
		).getTime();
		const clientUpdated = new Date(row.updatedAt as string).getTime();

		if (clientUpdated >= serverUpdated) {
			await tx
				.update(staff)
				.set(row)
				.where(eq(staff.id, row.id as string));
			return null;
		}
		return row.id as string;
	}

	await tx.insert(staff).values({ ...row, merchantId } as never);
	return null;
}

async function upsertOrderItem(
	tx: TransactionTx,
	row: Record<string, unknown>,
	outletId: string,
): Promise<string | null> {
	const existing = await tx
		.select()
		.from(orderItems)
		.where(eq(orderItems.id, row.id as string))
		.limit(1);

	if (existing.length > 0) {
		const serverCreated = new Date(
			(existing[0] as Record<string, unknown>).createdAt as string,
		).getTime();
		const clientCreated = new Date(row.createdAt as string).getTime();

		if (clientCreated >= serverCreated) {
			await tx
				.update(orderItems)
				.set(row)
				.where(eq(orderItems.id, row.id as string));
			return null;
		}
		return row.id as string;
	}

	await tx.insert(orderItems).values({ ...row, outletId } as never);
	return null;
}

export async function handlePull(
	outletId: string,
	merchantId: string,
	tables: string[],
	since: string,
) {
	const result: Record<string, unknown[]> = {};

	for (const tableName of tables) {
		switch (tableName) {
			case "categories": {
				result.categories = await db
					.select()
					.from(categories)
					.where(
						and(
							eq(categories.merchantId, merchantId),
							gt(categories.updatedAt, since),
						),
					);
				break;
			}
			case "products": {
				result.products = await db
					.select()
					.from(products)
					.where(
						and(
							eq(products.merchantId, merchantId),
							gt(products.updatedAt, since),
						),
					);
				break;
			}
			case "outlet_products": {
				result.outlet_products = await db
					.select()
					.from(outletProducts)
					.where(
						and(
							eq(outletProducts.outletId, outletId),
							gt(outletProducts.updatedAt, since),
						),
					);
				break;
			}
			case "staff": {
				result.staff = await db
					.select()
					.from(staff)
					.where(
						and(eq(staff.merchantId, merchantId), gt(staff.updatedAt, since)),
					);
				break;
			}
			case "orders": {
				result.orders = await db
					.select()
					.from(orders)
					.where(
						and(eq(orders.outletId, outletId), gt(orders.updatedAt, since)),
					);
				break;
			}
			case "order_items": {
				result.order_items = await db
					.select()
					.from(orderItems)
					.where(
						and(
							eq(orderItems.outletId, outletId),
							gt(orderItems.updatedAt, since),
						),
					);
				break;
			}
			default:
				break;
		}
	}

	return { ...result, serverTime: new Date().toISOString() };
}

export { ALL_SYNC_TABLE_NAMES };
