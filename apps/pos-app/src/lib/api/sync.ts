import { SyncStatusRequest, SyncStatusResponse } from "@repo/protobuf/sync";
import { protoFetch } from "./client";

export interface SyncStatusResult {
  changedTables: string[];
  hasChanges: boolean;
  latestEventId: number;
  needsFullResync: boolean;
  oldestAvailableEventId: number | null;
}

function protobufInt64ToSafeNumber(value: bigint, fieldName: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return Number(value);
}

export async function getSyncStatus(input: {
  lastServerEventId: number;
  outletId: string;
}): Promise<SyncStatusResult> {
  const decoded = await protoFetch(
    "api/sync/status",
    {
      req: SyncStatusRequest,
      res: SyncStatusResponse,
    },
    SyncStatusRequest.create({
      lastServerEventId: BigInt(input.lastServerEventId),
      outletId: input.outletId,
    })
  );

  return {
    changedTables: decoded.changedTables,
    hasChanges: decoded.hasChanges,
    latestEventId: protobufInt64ToSafeNumber(
      decoded.latestEventId,
      "latestEventId"
    ),
    needsFullResync: decoded.needsFullResync,
    oldestAvailableEventId: decoded.hasOldestAvailableEventId
      ? protobufInt64ToSafeNumber(
          decoded.oldestAvailableEventId,
          "oldestAvailableEventId"
        )
      : null,
  };
}
