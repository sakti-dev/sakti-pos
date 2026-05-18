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
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
}

export type PushBatchChanges = Record<string, TableChangeSet>;

export interface PushBatchResult {
  serverTime: string;
  tables: SyncTableAck[];
}

export interface PullBatchResult {
  assets?: TableChangeSet;
  categories?: TableChangeSet;
  cursor: string;
  hasMore: boolean;
  merchants?: TableChangeSet;
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
  cursor: string;
  hasChanges: boolean;
  serverTime: string;
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
  const normalizedRequest = Object.fromEntries(
    Object.entries(request as unknown as Record<string, unknown>).map(
      ([key, value]) => {
        if (!value || typeof value !== "object") {
          return [key, value];
        }

        const changes = value as {
          changedRows?: Record<string, unknown>[];
          deletedIds?: string[];
        };
        return [
          key,
          {
            changedRows: Array.isArray(changes.changedRows)
              ? changes.changedRows
              : [],
            deletedIds: Array.isArray(changes.deletedIds)
              ? changes.deletedIds
              : [],
          },
        ];
      }
    )
  );

  const decoded = decodeGeneratedPushBatchRequest(
    normalizedRequest as Record<string, unknown>
  ) as PushBatchChanges;

  return decoded;
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
    cursor: result.cursor,
    hasChanges: result.hasChanges,
    serverTime: result.serverTime,
  } as never);
}

export function encodePushBatchResponse(
  result: PushBatchResult
): SyncPushBatchResponse {
  return SyncPushBatchResponse.create({
    serverTime: result.serverTime,
    tables: result.tables,
  } as never);
}

export function encodePullBatchResponse(
  result: PullBatchResult
): SyncPullBatchResponse {
  const normalizedResult = Object.fromEntries(
    Object.entries(result as unknown as Record<string, unknown>).map(
      ([key, value]) => {
        if (!value || typeof value !== "object") {
          return [key, value];
        }

        const changes = value as {
          changedRows?: Record<string, unknown>[];
          deletedIds?: string[];
        };
        return [
          key,
          {
            changedRows: Array.isArray(changes.changedRows)
              ? changes.changedRows
              : [],
            deletedIds: Array.isArray(changes.deletedIds)
              ? changes.deletedIds
              : [],
          },
        ];
      }
    )
  );

  const response = encodeGeneratedPullBatchResponse(
    normalizedResult as Record<string, unknown>
  ) as SyncPullBatchResponse;

  return SyncPullBatchResponse.create(response as never);
}
