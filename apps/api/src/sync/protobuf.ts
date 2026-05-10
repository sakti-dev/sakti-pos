import {
  SyncPullEventsResponse,
  SyncPullResponse,
  SyncPushResponse,
  SyncStatusResponse,
  type SyncTableRows,
} from "@repo/protobuf/sync";

type TableRows = Record<string, unknown[]>;

interface SyncStatusResult {
  changedTables: string[];
  hasChanges: boolean;
  latestEventId: number;
  needsFullResync: boolean;
  oldestAvailableEventId: number | null;
}

function isTableRows(value: unknown): value is TableRows {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((rows) => Array.isArray(rows));
}

export function decodePushRequestTables(payloadJson: string): TableRows {
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (!isTableRows(parsed)) {
      throw new Error("Invalid sync payload shape");
    }
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Invalid sync payload shape"
    ) {
      throw error;
    }
    throw new Error("Invalid sync payload JSON");
  }
}

function tableRowsFromResult(result: Record<string, unknown>): SyncTableRows[] {
  const rows: SyncTableRows[] = [];
  for (const [table, value] of Object.entries(result)) {
    if (!Array.isArray(value)) {
      continue;
    }
    rows.push({ rowsJson: JSON.stringify(value), table });
  }
  return rows;
}

export function encodePushResponse(result: {
  serverTime: string;
  serverWins: { ids: string[]; table: string }[];
}) {
  return SyncPushResponse.create({
    serverTime: result.serverTime,
    serverWins: result.serverWins,
  });
}

export function encodeStatusResponse(
  result: SyncStatusResult
): SyncStatusResponse {
  return SyncStatusResponse.create({
    changedTables: result.changedTables,
    hasChanges: result.hasChanges,
    hasOldestAvailableEventId: result.oldestAvailableEventId !== null,
    latestEventId: result.latestEventId,
    needsFullResync: result.needsFullResync,
    oldestAvailableEventId: result.oldestAvailableEventId ?? 0,
  });
}

export function encodePullEventsResponse(result: Record<string, unknown>) {
  return SyncPullEventsResponse.create({
    latestEventId:
      typeof result.latestEventId === "number" ? result.latestEventId : 0,
    needsFullResync: result.needsFullResync === true,
    tables: tableRowsFromResult(result),
  });
}

export function encodePullResponse(
  result: Record<string, unknown> & { serverTime: string }
) {
  return SyncPullResponse.create({
    serverTime: result.serverTime,
    tables: tableRowsFromResult(result),
  });
}
