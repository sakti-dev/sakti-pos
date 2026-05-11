import { syncEvents } from "@repo/database/api-schema";
import { db } from "../db";

type TransactionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export async function recordSyncEvent(
  input: SyncEventInput,
  tx?: TransactionTx
): Promise<void> {
  const executor = tx ?? db;
  await executor.insert(syncEvents).values(input);
}
