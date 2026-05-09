import { syncEvents } from "@repo/database/api-schema";
import { db } from "../db";

export type SyncEventOperation = "insert" | "update" | "delete";
export type SyncEventScopeType = "merchant" | "outlet";

export interface SyncEventInput {
	changedAt: string;
	operation: SyncEventOperation;
	rowId: string;
	scopeId: string;
	scopeType: SyncEventScopeType;
	tableName: string;
}

export async function recordSyncEvent(input: SyncEventInput): Promise<void> {
	await db.insert(syncEvents).values(input);
}
