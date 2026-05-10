import { SyncStatusRequest, SyncStatusResponse } from "@repo/protobuf/sync";
import { protoFetch } from "./client";

export interface SyncStatusResult {
  changedTables: string[];
  hasChanges: boolean;
  latestEventId: number;
  needsFullResync: boolean;
  oldestAvailableEventId: number | null;
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
      lastServerEventId: input.lastServerEventId,
      outletId: input.outletId,
    })
  );

  return {
    changedTables: decoded.changedTables,
    hasChanges: decoded.hasChanges,
    latestEventId: decoded.latestEventId,
    needsFullResync: decoded.needsFullResync,
    oldestAvailableEventId: decoded.hasOldestAvailableEventId
      ? decoded.oldestAvailableEventId
      : null,
  };
}
