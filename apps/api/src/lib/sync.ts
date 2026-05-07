import {
	categories,
	orderItems,
	orders,
	products,
	shops,
	users,
} from "@repo/database/api-schema";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";

const ALL_SYNC_TABLE_NAMES = [
	"categories",
	"products",
	"orders",
	"order_items",
];

export async function verifyShopAccess(
	sessionUserId: string,
	requestedShopId: string,
): Promise<boolean> {
	const [user] = await db
		.select({ shopId: users.shopId })
		.from(users)
		.where(eq(users.id, sessionUserId))
		.limit(1);

	if (!user || user.shopId !== requestedShopId) {
		const [owned] = await db
			.select({ id: shops.id })
			.from(shops)
			.where(
				and(eq(shops.id, requestedShopId), eq(shops.ownerId, sessionUserId)),
			)
			.limit(1);
		return !!owned;
	}

	return true;
}

export async function handlePush(
	shopId: string,
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
						serverWin = await upsertRow(tx, categories, row, shopId);
						break;
					case "products":
						serverWin = await upsertRow(tx, products, row, shopId);
						break;
					case "orders":
						serverWin = await upsertRow(tx, orders, row, shopId);
						break;
					case "order_items":
						serverWin = await upsertOrderItem(tx, row, shopId);
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

async function upsertRow(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	table: typeof categories | typeof products | typeof orders,
	row: Record<string, unknown>,
	shopId: string,
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

	await tx.insert(table).values({ ...row, shopId } as never);
	return null;
}

async function upsertOrderItem(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	row: Record<string, unknown>,
	shopId: string,
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

	await tx.insert(orderItems).values({ ...row, shopId } as never);
	return null;
}

export async function handlePull(
	shopId: string,
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
						and(eq(categories.shopId, shopId), gt(categories.updatedAt, since)),
					);
				break;
			}
			case "products": {
				result.products = await db
					.select()
					.from(products)
					.where(
						and(eq(products.shopId, shopId), gt(products.updatedAt, since)),
					);
				break;
			}
			case "orders": {
				result.orders = await db
					.select()
					.from(orders)
					.where(and(eq(orders.shopId, shopId), gt(orders.updatedAt, since)));
				break;
			}
			case "order_items": {
				result.order_items = await db
					.select()
					.from(orderItems)
					.where(
						and(eq(orderItems.shopId, shopId), gt(orderItems.updatedAt, since)),
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
