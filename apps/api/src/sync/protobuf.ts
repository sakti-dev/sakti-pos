import {
  SyncPullBatchResponse,
  SyncPushBatchRequest,
  SyncPushBatchResponse,
  SyncStatusResponse,
  type SyncTableAck,
} from "@repo/protobuf/sync";
import {
  decodeGeneratedPushBatchRequest,
  encodeGeneratedPullBatchResponse,
} from "./protobuf.generated";

export function protobufInt64ToSafeNumber(
  value: bigint,
  fieldName: string
): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Exceeds Number.MAX_SAFE_INTEGER for ${fieldName}`);
  }
  return Number(value);
}

export interface TableChangeSet {
  created: Record<string, unknown>[];
  deletedIds: string[];
  updated: Record<string, unknown>[];
}

export type PushBatchChanges = Record<string, TableChangeSet>;

export interface PushBatchResult {
  latestEventId: number;
  serverTime: string;
  tables: SyncTableAck[];
}

export interface PullBatchResult {
  assets?: TableChangeSet;
  categories?: TableChangeSet;
  hasMore: boolean;
  latestEventId: number;
  merchants?: TableChangeSet;
  needsFullResync: boolean;
  nextPageCursor: string;
  order_items?: TableChangeSet;
  orders?: TableChangeSet;
  outlet_products?: TableChangeSet;
  outlets?: TableChangeSet;
  products?: TableChangeSet;
  registers?: TableChangeSet;
  serverTime: string;
  staff?: TableChangeSet;
}

interface SyncStatusResult {
  changedTables: string[];
  hasChanges: boolean;
  latestEventId: number;
  needsFullResync: boolean;
  oldestAvailableEventId: number | null;
}

function coerceBigInt(value: number | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(input.byteLength);
  buffer.set(input);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return toHex(new Uint8Array(hash));
}

export function decodePushBatchRequest(
  request: SyncPushBatchRequest
): PushBatchChanges {
  return decodeGeneratedPushBatchRequest(
    request as unknown as Record<string, unknown>
  ) as PushBatchChanges;
}

export async function computePushBatchRequestHash(
  request: SyncPushBatchRequest
): Promise<string> {
  return await sha256Hex(SyncPushBatchRequest.encode(request).finish());
}

export function encodeStatusResponse(
  result: SyncStatusResult
): SyncStatusResponse {
  return SyncStatusResponse.create({
    changedTables: result.changedTables,
    hasChanges: result.hasChanges,
    hasOldestAvailableEventId: result.oldestAvailableEventId !== null,
    latestEventId: coerceBigInt(result.latestEventId),
    needsFullResync: result.needsFullResync,
    oldestAvailableEventId: coerceBigInt(result.oldestAvailableEventId ?? 0),
  });
}

export function encodePushBatchResponse(
  result: PushBatchResult
): SyncPushBatchResponse {
  return SyncPushBatchResponse.create({
    latestEventId: coerceBigInt(result.latestEventId),
    serverTime: result.serverTime,
    tables: result.tables,
  });
}

export function encodePullBatchResponse(
  result: PullBatchResult
): SyncPullBatchResponse {
  return SyncPullBatchResponse.create(
    encodeGeneratedPullBatchResponse(
      result as unknown as Record<string, unknown>
    )
  );
}
