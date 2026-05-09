import {
	categories,
	merchants,
	orderItems,
	orders,
	outletProducts,
	outlets,
	products,
	registers,
	staff,
	syncEvents,
	userMerchants,
} from "@repo/database/api-schema";
import { and, eq, gt, or } from "drizzle-orm";
import { db } from "../db";
import type { SyncEventOperation, SyncEventScopeType } from "./sync-events";

const ALL_SYNC_TABLE_NAMES = [
	"merchants",
	"outlets",
	"registers",
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
interface UpsertResult {
	acceptedOperation: SyncEventOperation | null;
	serverWin: string | null;
}

function stripLocalOnlyColumns(
	row: Record<string, unknown>,
): Record<string, unknown> {
	const { is_synced: _, ...clean } = row;
	return clean;
}

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

			for (const rawRow of rows as Record<string, unknown>[]) {
				const row = stripLocalOnlyColumns(rawRow);
				let upsertResult: UpsertResult | null = null;

				switch (tableName) {
					case "merchants":
						upsertResult = await upsertMerchantRow(
							tx,
							merchants,
							row,
							merchantId,
						);
						break;
					case "outlets":
						upsertResult = await upsertOutletRow(tx, outlets, row, outletId);
						break;
					case "registers":
						upsertResult = await upsertOutletRow(tx, registers, row, outletId);
						break;
					case "categories":
						upsertResult = await upsertMerchantRow(
							tx,
							categories,
							row,
							merchantId,
						);
						break;
					case "products":
						upsertResult = await upsertMerchantRow(
							tx,
							products,
							row,
							merchantId,
						);
						break;
					case "outlet_products":
						upsertResult = await upsertOutletRow(
							tx,
							outletProducts,
							row,
							outletId,
						);
						break;
					case "staff":
						upsertResult = await upsertStaffRow(tx, row, merchantId);
						break;
					case "orders":
						upsertResult = await upsertOutletRow(tx, orders, row, outletId);
						break;
					case "order_items":
						upsertResult = await upsertOrderItem(tx, row, outletId);
						break;
				}

				if (upsertResult?.serverWin) wins.push(upsertResult.serverWin);
				if (upsertResult?.acceptedOperation) {
					const scope = getSyncEventScope(tableName, merchantId, outletId);
					await tx.insert(syncEvents).values({
						changedAt: String(
							row.updatedAt ?? row.createdAt ?? new Date().toISOString(),
						),
						operation: upsertResult.acceptedOperation,
						rowId: row.id as string,
						scopeId: scope.scopeId,
						scopeType: scope.scopeType,
						tableName,
					});
				}
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
	table: typeof categories | typeof products | typeof merchants,
	row: Record<string, unknown>,
	merchantId: string,
): Promise<UpsertResult> {
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
			return {
				acceptedOperation: getAcceptedOperation(row, "update"),
				serverWin: null,
			};
		}
		return { acceptedOperation: null, serverWin: row.id as string };
	}

	await tx.insert(table).values({ ...row, merchantId } as never);
	return {
		acceptedOperation: getAcceptedOperation(row, "insert"),
		serverWin: null,
	};
}

async function upsertOutletRow(
	tx: TransactionTx,
	table:
		| typeof outletProducts
		| typeof orders
		| typeof outlets
		| typeof registers,
	row: Record<string, unknown>,
	outletId: string,
): Promise<UpsertResult> {
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
			return {
				acceptedOperation: getAcceptedOperation(row, "update"),
				serverWin: null,
			};
		}
		return { acceptedOperation: null, serverWin: row.id as string };
	}

	await tx.insert(table).values({ ...row, outletId } as never);
	return {
		acceptedOperation: getAcceptedOperation(row, "insert"),
		serverWin: null,
	};
}

async function upsertStaffRow(
	tx: TransactionTx,
	row: Record<string, unknown>,
	merchantId: string,
): Promise<UpsertResult> {
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
			return {
				acceptedOperation: getAcceptedOperation(row, "update"),
				serverWin: null,
			};
		}
		return { acceptedOperation: null, serverWin: row.id as string };
	}

	await tx.insert(staff).values({ ...row, merchantId } as never);
	return {
		acceptedOperation: getAcceptedOperation(row, "insert"),
		serverWin: null,
	};
}

async function upsertOrderItem(
	tx: TransactionTx,
	row: Record<string, unknown>,
	outletId: string,
): Promise<UpsertResult> {
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
			return {
				acceptedOperation: getAcceptedOperation(row, "update"),
				serverWin: null,
			};
		}
		return { acceptedOperation: null, serverWin: row.id as string };
	}

	await tx.insert(orderItems).values({ ...row, outletId } as never);
	return {
		acceptedOperation: getAcceptedOperation(row, "insert"),
		serverWin: null,
	};
}

function getAcceptedOperation(
	row: Record<string, unknown>,
	defaultOperation: "insert" | "update",
): SyncEventOperation {
	return row.deletedAt ? "delete" : defaultOperation;
}

function getSyncEventScope(
	tableName: string,
	merchantId: string,
	outletId: string,
): { scopeId: string; scopeType: SyncEventScopeType } {
	switch (tableName) {
		case "registers":
		case "outlet_products":
		case "orders":
		case "order_items":
			return { scopeId: outletId, scopeType: "outlet" };
		default:
			return { scopeId: merchantId, scopeType: "merchant" };
	}
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
			case "merchants": {
				result.merchants = await db
					.select()
					.from(merchants)
					.where(
						and(eq(merchants.id, merchantId), gt(merchants.updatedAt, since)),
					);
				break;
			}
			case "outlets": {
				result.outlets = await db
					.select()
					.from(outlets)
					.where(
						and(
							eq(outlets.merchantId, merchantId),
							gt(outlets.updatedAt, since),
						),
					);
				break;
			}
			case "registers": {
				result.registers = await db
					.select()
					.from(registers)
					.where(
						and(
							eq(registers.outletId, outletId),
							gt(registers.updatedAt, since),
						),
					);
				break;
			}
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

export interface SyncStatusInput {
	lastServerEventId: number;
	merchantId: string;
	outletId: string;
}

export async function handleSyncStatus(input: SyncStatusInput) {
	const events = await db
		.select({ id: syncEvents.id, tableName: syncEvents.tableName })
		.from(syncEvents)
		.where(
			or(
				and(
					eq(syncEvents.scopeType, "merchant"),
					eq(syncEvents.scopeId, input.merchantId),
				),
				and(
					eq(syncEvents.scopeType, "outlet"),
					eq(syncEvents.scopeId, input.outletId),
				),
			),
		);

	const eventIds = events.map((event) => event.id);
	const latestEventId =
		eventIds.length > 0 ? Math.max(...eventIds) : input.lastServerEventId;
	const oldestAvailableEventId =
		eventIds.length > 0 ? Math.min(...eventIds) : null;
	const changedTables = Array.from(
		new Set(
			events
				.filter((event) => event.id > input.lastServerEventId)
				.map((event) => event.tableName),
		),
	);

	return {
		changedTables,
		hasChanges: latestEventId > input.lastServerEventId,
		latestEventId,
		needsFullResync:
			oldestAvailableEventId !== null &&
			input.lastServerEventId > 0 &&
			input.lastServerEventId < oldestAvailableEventId,
		oldestAvailableEventId,
	};
}

export { ALL_SYNC_TABLE_NAMES };
