import { syncOutbox } from "@repo/database";
import dayjs from "dayjs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index";

export type SyncOperation = "insert" | "update" | "delete";
export type SyncScopeType = "merchant" | "outlet";
export type SyncOutboxRow = typeof syncOutbox.$inferSelect;

export interface LocalChangeInput {
	operation: SyncOperation;
	rowId: string;
	scopeId: string;
	scopeType: SyncScopeType;
	tableName: string;
}

export async function recordLocalChange(
	input: LocalChangeInput,
): Promise<void> {
	const [existing] = await db
		.select()
		.from(syncOutbox)
		.where(
			and(
				eq(syncOutbox.tableName, input.tableName),
				eq(syncOutbox.rowId, input.rowId),
				isNull(syncOutbox.syncedAt),
			),
		)
		.limit(1);

	const nextOperation = resolveOutboxOperation(
		existing?.operation as SyncOperation | undefined,
		input.operation,
	);
	const changedAt = dayjs().toISOString();

	if (!nextOperation) {
		await db
			.delete(syncOutbox)
			.where(
				and(
					eq(syncOutbox.tableName, input.tableName),
					eq(syncOutbox.rowId, input.rowId),
					isNull(syncOutbox.syncedAt),
				),
			);
		return;
	}

	if (existing) {
		await db
			.update(syncOutbox)
			.set({
				changedAt,
				operation: nextOperation,
				scopeId: input.scopeId,
				scopeType: input.scopeType,
			})
			.where(
				and(
					eq(syncOutbox.tableName, input.tableName),
					eq(syncOutbox.rowId, input.rowId),
					isNull(syncOutbox.syncedAt),
				),
			);
		return;
	}

	await db.insert(syncOutbox).values({
		changedAt,
		id: crypto.randomUUID(),
		operation: nextOperation,
		rowId: input.rowId,
		scopeId: input.scopeId,
		scopeType: input.scopeType,
		tableName: input.tableName,
	});
}

export async function listPendingOutbox(
	scopeType: SyncScopeType,
	scopeId: string,
): Promise<SyncOutboxRow[]> {
	return await db
		.select()
		.from(syncOutbox)
		.where(
			and(
				eq(syncOutbox.scopeType, scopeType),
				eq(syncOutbox.scopeId, scopeId),
				isNull(syncOutbox.syncedAt),
			),
		);
}

export async function markOutboxSynced(
	ids: string[],
	syncedAt: string,
): Promise<void> {
	if (ids.length === 0) return;

	for (const id of ids) {
		await db.update(syncOutbox).set({ syncedAt }).where(eq(syncOutbox.id, id));
	}
}

export async function purgeSyncedOutboxBefore(
	cutoffIso: string,
): Promise<number> {
	const rows = await db
		.select({ id: syncOutbox.id })
		.from(syncOutbox)
		.where(eq(syncOutbox.syncedAt, cutoffIso));

	for (const row of rows) {
		await db.delete(syncOutbox).where(eq(syncOutbox.id, row.id));
	}

	return rows.length;
}

function resolveOutboxOperation(
	existingOperation: SyncOperation | undefined,
	nextOperation: SyncOperation,
): SyncOperation | null {
	if (!existingOperation) return nextOperation;
	if (existingOperation === "insert" && nextOperation === "delete") return null;
	if (existingOperation === "insert") return "insert";
	if (existingOperation === "delete") return "delete";
	return nextOperation;
}
