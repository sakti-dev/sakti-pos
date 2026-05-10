import { api, getApiErrorMessage } from "~/lib/http";

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
  try {
    return await api
      .get("api/sync/status", {
        searchParams: {
          lastServerEventId: String(input.lastServerEventId),
          outletId: input.outletId,
        },
      })
      .json<SyncStatusResult>();
  } catch (error) {
    throw new Error(await getApiErrorMessage(error));
  }
}
