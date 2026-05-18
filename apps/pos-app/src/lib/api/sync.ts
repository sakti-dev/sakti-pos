import { SyncStatusRequest, SyncStatusResponse } from "@repo/protobuf/sync";
import { protoFetch } from "./client";

export interface SyncStatusResult {
  changedTables: string[];
  cursor: string;
  hasChanges: boolean;
}

export async function getSyncStatus(input: {
  cursor: string;
  outletId: string;
}): Promise<SyncStatusResult> {
  const decoded = await protoFetch(
    "api/sync/status",
    {
      req: SyncStatusRequest,
      res: SyncStatusResponse,
    },
    SyncStatusRequest.create({
      outletId: input.outletId,
      cursor: input.cursor,
    })
  );

  return {
    changedTables: decoded.changedTables,
    hasChanges: decoded.hasChanges,
    cursor: decoded.cursor,
  };
}
