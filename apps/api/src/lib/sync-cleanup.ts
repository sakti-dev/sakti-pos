import {
	categories,
	outletProducts,
	products,
	registers,
	staff,
	syncEvents,
} from "@repo/database/api-schema";
import { and, isNotNull, lt } from "drizzle-orm";
import { db } from "../db";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SOFT_DELETED_CLEANUP_TABLES = [
	{ deletedAt: categories.deletedAt, name: "categories", table: categories },
	{ deletedAt: products.deletedAt, name: "products", table: products },
	{
		deletedAt: outletProducts.deletedAt,
		name: "outlet_products",
		table: outletProducts,
	},
	{ deletedAt: registers.deletedAt, name: "registers", table: registers },
	{ deletedAt: staff.deletedAt, name: "staff", table: staff },
] as const;

export interface SyncCleanupInput {
	now: Date;
	retentionDays: number;
}

export interface SyncCleanupResult {
	deletedEvents: number;
	deletedSoftRows: Record<string, number>;
}

function getRowsAffected(result: unknown): number {
	if (
		result &&
		typeof result === "object" &&
		"rowsAffected" in result &&
		typeof result.rowsAffected === "number"
	) {
		return result.rowsAffected;
	}
	return 0;
}

export async function cleanupSyncHistory(
	input: SyncCleanupInput,
): Promise<SyncCleanupResult> {
	const cutoff = new Date(
		input.now.getTime() - input.retentionDays * MS_PER_DAY,
	).toISOString();

	const deletedEventsResult = await db
		.delete(syncEvents)
		.where(lt(syncEvents.changedAt, cutoff));
	const deletedSoftRows: Record<string, number> = {};

	for (const item of SOFT_DELETED_CLEANUP_TABLES) {
		const result = await db
			.delete(item.table)
			.where(and(isNotNull(item.deletedAt), lt(item.deletedAt, cutoff)));
		deletedSoftRows[item.name] = getRowsAffected(result);
	}

	return {
		deletedEvents: getRowsAffected(deletedEventsResult),
		deletedSoftRows,
	};
}
