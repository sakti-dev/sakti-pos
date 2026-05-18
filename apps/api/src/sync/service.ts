import {
  assets,
  categories,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
  syncBatchRequests,
  userMerchants,
} from "@repo/database/api-schema";
import { and, asc, eq, gt, gte, or, type SQL, sql } from "drizzle-orm";
import { inArray } from "drizzle-orm/sql";
import { db } from "../db";
import { ConflictRequestError } from "../lib/validation";
import {
  chunkArray,
  DEFAULT_MAX_IDS_PER_READ_CHUNK,
  getWriteChunkSize,
} from "./chunking";
import {
  type GenericSyncTableAdapter,
  getPushTableAdapter,
  SYNC_UPSERT_ORDER,
  type TransactionLike,
} from "./push-adapters.generated";

type PushTableAdapter = GenericSyncTableAdapter;
type SyncEventOperation = "insert" | "update" | "delete";

const SYNC_TABLES = {
  assets,
  categories,
  merchants,
  order_items: orderItems,
  orders,
  outlet_products: outletProducts,
  outlets,
  products,
  registers,
  staff,
} as const;

const SYNC_TABLE_SCOPE = {
  assets: { column: "merchantId", type: "merchant" },
  categories: { column: "merchantId", type: "merchant" },
  merchants: { column: "id", type: "merchant" },
  order_items: { column: "outletId", type: "outlet" },
  orders: { column: "outletId", type: "outlet" },
  outlet_products: { column: "outletId", type: "outlet" },
  outlets: { column: "merchantId", type: "merchant" },
  products: { column: "merchantId", type: "merchant" },
  registers: { column: "outletId", type: "outlet" },
  staff: { column: "merchantId", type: "merchant" },
} as const satisfies Record<
  keyof typeof SYNC_TABLES,
  { column: string; type: "merchant" | "outlet" }
>;

export function getSyncTableScopeColumn(
  tableName: keyof typeof SYNC_TABLES
): string {
  return SYNC_TABLE_SCOPE[tableName].column;
}

export function getSyncTableScopeValue(input: {
  merchantId: string;
  outletId: string;
  tableName: keyof typeof SYNC_TABLES;
}): string {
  const scope = SYNC_TABLE_SCOPE[input.tableName];
  return scope.type === "merchant" ? input.merchantId : input.outletId;
}

export function isActiveDeletedAtFilterValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

const PULL_BATCH_DEFAULT_LIMIT = 250;
const PULL_BATCH_MAX_LIMIT = 500;
const PULL_BATCH_CURSOR_PREFIX = "sync:";

const INTEGER_TIMESTAMP_PATTERN = /^\d+$/;
const UNIQUE_CONSTRAINT_PATTERN = /(unique|constraint)/i;
const INVALID_ERROR_PATTERN = /invalid/i;
const PENDING_PUSH_BATCH_RESPONSE = JSON.stringify({ pending: true });

function getRequiredPushTableAdapter(tableName: string): PushTableAdapter {
  const adapter = getPushTableAdapter(tableName);
  if (!adapter) {
    throw new Error(`Missing push table adapter for ${tableName}`);
  }
  return adapter;
}

function getRequiredSyncTable(tableName: string) {
  const table = SYNC_TABLES[tableName as keyof typeof SYNC_TABLES];
  if (!table) {
    throw new Error(`Unknown sync table ${tableName}`);
  }
  return table;
}

function applyTenantContextToRow(input: {
  merchantId: string;
  outletId: string;
  row: Record<string, unknown>;
  tableName: string;
}): Record<string, unknown> {
  if (!(input.tableName in SYNC_TABLE_SCOPE)) {
    return input.row;
  }
  const typedTableName = input.tableName as keyof typeof SYNC_TABLE_SCOPE;
  const scope = SYNC_TABLE_SCOPE[typedTableName];
  if (scope.type === "merchant" && scope.column === "id") {
    return { ...input.row, id: input.merchantId };
  }
  const scopeColumn = scope.column;
  const scopeValue =
    scope.type === "merchant" ? input.merchantId : input.outletId;
  return { ...input.row, [scopeColumn]: scopeValue };
}

export async function verifyOutletAccess(
  sessionUserId: string,
  requestedOutletId: string
): Promise<boolean> {
  const [outlet] = await db
    .select({ merchantId: outlets.merchantId })
    .from(outlets)
    .where(eq(outlets.id, requestedOutletId))
    .limit(1);

  if (!outlet) {
    return false;
  }

  const [membership] = await db
    .select({ id: userMerchants.id })
    .from(userMerchants)
    .where(
      and(
        eq(userMerchants.userId, sessionUserId),
        eq(userMerchants.merchantId, outlet.merchantId)
      )
    )
    .limit(1);

  return !!membership;
}

type TransactionTx = Pick<typeof db, "insert" | "select" | "update">;

interface ExistingSyncRow extends Record<string, unknown> {
  createdAt?: unknown;
  id: string;
  updatedAt?: unknown;
}

interface AcceptedPushRow {
  operation: SyncEventOperation;
  row: Record<string, unknown>;
}

interface PullTableChanges {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
}

export interface TableChangeSet {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
}

export type PushBatchChanges = Record<string, TableChangeSet>;

export interface PushBatchTableAck {
  acceptedCreatedIds: string[];
  acceptedDeletedIds: string[];
  acceptedUpdatedIds: string[];
  rejected: { id: string; reason: string }[];
  table: string;
}

interface StoredPushBatchResponse {
  serverTime: string;
  tables: PushBatchTableAck[];
}

function parseTimestampMs(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return Number.NaN;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return Number.NaN;
  }

  if (INTEGER_TIMESTAMP_PATTERN.test(trimmed)) {
    return Number(trimmed);
  }

  return Date.parse(trimmed);
}

export async function handlePushBatch(
  outletId: string,
  merchantId: string,
  clientId: string,
  changes: PushBatchChanges,
  idempotencyKey = "",
  requestHash = ""
) {
  return await db.transaction(async (tx) => {
    const syncUpdatedAt = Date.now();
    if (idempotencyKey) {
      const cached = await loadPushBatchResponse(tx, {
        clientId,
        idempotencyKey,
        requestHash,
      });
      if (cached) {
        return cached;
      }

      const raced = await reservePushBatchResponse(tx, {
        clientId,
        idempotencyKey,
        requestHash,
      });
      if (raced) {
        return raced;
      }
    }

    const tables: PushBatchTableAck[] = [];
    // Keep writes inside the interactive transaction. Sequential ordering preserves FK-safe writes and idempotency semantics.
    for (const tableName of SYNC_UPSERT_ORDER) {
      const tableChanges = changes[tableName];
      if (!tableChanges) {
        continue;
      }

      const processed = await processPushBatchTable({
        merchantId,
        outletId,
        syncUpdatedAt,
        tableName,
        changes: tableChanges,
        tx,
      });
      tables.push(processed.ack);
    }

    const response: StoredPushBatchResponse = {
      serverTime: new Date().toISOString(),
      tables,
    };

    if (idempotencyKey) {
      await finalizePushBatchResponse(tx, {
        clientId,
        idempotencyKey,
        requestHash,
        response,
      });
    }

    return response;
  });
}

async function loadPushBatchResponse(
  tx: TransactionTx,
  input: {
    clientId: string;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<StoredPushBatchResponse | null> {
  const [existing] = await tx
    .select({
      latestEventId: syncBatchRequests.latestEventId,
      requestHash: syncBatchRequests.requestHash,
      responseJson: syncBatchRequests.responseJson,
      serverTime: syncBatchRequests.serverTime,
    })
    .from(syncBatchRequests)
    .where(
      and(
        eq(syncBatchRequests.clientId, input.clientId),
        eq(syncBatchRequests.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== input.requestHash) {
    throw new ConflictRequestError(
      "idempotency key reused with different request body"
    );
  }

  try {
    const parsed = JSON.parse(existing.responseJson) as
      | StoredPushBatchResponse
      | { pending?: unknown };
    if ("pending" in parsed && parsed.pending === true) {
      throw new ConflictRequestError("sync push is already in progress");
    }
    const response = parsed as Partial<StoredPushBatchResponse>;
    return {
      serverTime: existing.serverTime,
      tables: Array.isArray(response.tables) ? response.tables : [],
    };
  } catch (error) {
    if (error instanceof ConflictRequestError) {
      throw error;
    }
    return {
      serverTime: existing.serverTime,
      tables: [],
    };
  }
}

async function reservePushBatchResponse(
  tx: TransactionTx,
  input: {
    clientId: string;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<StoredPushBatchResponse | null> {
  const now = new Date().toISOString();
  try {
    await tx.insert(syncBatchRequests).values({
      clientId: input.clientId,
      createdAt: now,
      idempotencyKey: input.idempotencyKey,
      latestEventId: 0,
      requestHash: input.requestHash,
      responseJson: PENDING_PUSH_BATCH_RESPONSE,
      serverTime: now,
      updatedAt: now,
    });
    return null;
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const cached = await loadPushBatchResponse(tx, {
      clientId: input.clientId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    });
    if (cached) {
      return cached;
    }

    throw error;
  }
}

async function finalizePushBatchResponse(
  tx: TransactionTx,
  input: {
    clientId: string;
    idempotencyKey: string;
    requestHash: string;
    response: StoredPushBatchResponse;
  }
) {
  const now = new Date().toISOString();
  await tx
    .update(syncBatchRequests)
    .set({
      responseJson: JSON.stringify(input.response),
      serverTime: input.response.serverTime,
      updatedAt: now,
    })
    .where(
      and(
        eq(syncBatchRequests.clientId, input.clientId),
        eq(syncBatchRequests.idempotencyKey, input.idempotencyKey),
        eq(syncBatchRequests.requestHash, input.requestHash)
      )
    );
}

async function processPushBatchTable(input: {
  merchantId: string;
  outletId: string;
  syncUpdatedAt: number;
  tableName: string;
  changes: TableChangeSet;
  tx: TransactionTx;
}): Promise<{ ack: PushBatchTableAck }> {
  const adapter = getRequiredPushTableAdapter(input.tableName);
  const ack: PushBatchTableAck = {
    acceptedCreatedIds: [],
    acceptedDeletedIds: [],
    acceptedUpdatedIds: [],
    rejected: [],
    table: input.tableName,
  };

  const acceptedRows = await partitionAcceptedPushRows(input, ack, adapter);
  await upsertRowsChunked({
    adapter,
    rows: acceptedRows.map((accepted) => ({
      ...accepted.row,
      syncUpdatedAt: input.syncUpdatedAt,
    })),
    tx: input.tx as unknown as TransactionLike,
  });

  await processTimestamplessDeletedIds(input, ack);

  return { ack };
}

async function partitionAcceptedPushRows(
  input: {
    changes: TableChangeSet;
    merchantId: string;
    outletId: string;
    tableName: string;
    tx: TransactionTx;
  },
  ack: PushBatchTableAck,
  adapter: PushTableAdapter
): Promise<AcceptedPushRow[]> {
  const candidateRows = input.changes.changedRows.map((row) =>
    applyTenantContextToRow({
      merchantId: input.merchantId,
      outletId: input.outletId,
      row: adapter.mapProtoRow(row),
      tableName: input.tableName,
    })
  );

  if (candidateRows.length === 0) {
    return [];
  }

  const existingRows = await selectExistingRowsChunked(
    input.tableName,
    input.tx as unknown as TransactionLike,
    candidateRows.map((candidate) => candidate.id as string)
  );
  const existingRowsById = new Map(existingRows.map((row) => [row.id, row]));
  const acceptedRows: AcceptedPushRow[] = [];

  for (const candidateRow of candidateRows) {
    const id = candidateRow.id as string;
    const existing = existingRowsById.get(id);
    const defaultOperation = existing ? "update" : "insert";
    const acceptedOperation = getAcceptedOperation(
      candidateRow,
      defaultOperation
    );

    if (existing && !clientRowWins(input.tableName, candidateRow, existing)) {
      ack.rejected.push({ id, reason: "server_newer" });
      continue;
    }

    acceptedRows.push({ operation: acceptedOperation, row: candidateRow });
    if (acceptedOperation === "delete") {
      ack.acceptedDeletedIds.push(id);
    } else if (existing) {
      ack.acceptedUpdatedIds.push(id);
    } else {
      ack.acceptedCreatedIds.push(id);
    }
  }

  return acceptedRows;
}

async function processTimestamplessDeletedIds(
  input: {
    merchantId: string;
    outletId: string;
    syncUpdatedAt: number;
    tableName: string;
    changes: TableChangeSet;
    tx: TransactionTx;
  },
  ack: PushBatchTableAck
) {
  if (input.changes.deletedIds.length === 0) {
    return;
  }

  const acceptedDeletedIds = await softDeleteRowsChunked({
    merchantId: input.merchantId,
    tableName: input.tableName,
    ids: input.changes.deletedIds,
    now: new Date().toISOString(),
    syncUpdatedAt: input.syncUpdatedAt,
    outletId: input.outletId,
    tx: input.tx as unknown as TransactionLike,
  });

  for (const id of acceptedDeletedIds) {
    ack.acceptedDeletedIds.push(id);
  }
}

function clientRowWins(
  tableName: string,
  clientRow: Record<string, unknown>,
  serverRow: ExistingSyncRow
): boolean {
  const timestampColumn =
    tableName === "order_items" ? "createdAt" : "updatedAt";
  const serverTimestamp = parseTimestampMs(serverRow[timestampColumn]);
  const clientTimestamp = parseTimestampMs(clientRow[timestampColumn]);
  return clientTimestamp >= serverTimestamp;
}

async function upsertRowsChunked(input: {
  adapter: PushTableAdapter;
  rows: Record<string, unknown>[];
  tx: TransactionLike;
}) {
  if (input.rows.length === 0) {
    return;
  }

  const chunkSize = getWriteChunkSize({
    columnCount: input.adapter.writeColumnCount,
  });
  for (const rowsChunk of chunkArray(input.rows, chunkSize)) {
    await input.adapter.upsertRows(input.tx, rowsChunk);
  }
}

async function selectExistingRowsChunked(
  tableName: string,
  tx: TransactionLike,
  ids: string[]
): Promise<ExistingSyncRow[]> {
  if (ids.length === 0) {
    return [];
  }

  const table = getRequiredSyncTable(tableName);
  const rows: ExistingSyncRow[] = [];
  for (const idChunk of chunkArray(ids, DEFAULT_MAX_IDS_PER_READ_CHUNK)) {
    const chunkRows = await resolveRowsLike<ExistingSyncRow>(
      tx
        .select({
          createdAt: table.createdAt,
          id: table.id,
          updatedAt: table.updatedAt,
        })
        .from(table)
        .where(inArray(table.id, idChunk)),
      idChunk.length
    );
    rows.push(
      ...chunkRows.filter(
        (row): row is ExistingSyncRow =>
          typeof row === "object" &&
          row !== null &&
          "id" in row &&
          typeof row.id === "string" &&
          ("updatedAt" in row || "createdAt" in row)
      )
    );
  }
  return rows;
}

async function resolveRowsLike<T>(value: unknown, limit: number): Promise<T[]> {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "limit" in value &&
    typeof (value as { limit: unknown }).limit === "function"
  ) {
    return await resolveRowsLike<T>(
      await (value as { limit: (value: number) => unknown }).limit(limit),
      limit
    );
  }

  return (await value) as T[];
}

async function softDeleteRowsChunked(input: {
  merchantId: string;
  tableName: string;
  ids: string[];
  now: string;
  syncUpdatedAt: number;
  outletId: string;
  tx: TransactionLike;
}): Promise<string[]> {
  if (input.ids.length === 0) {
    return [];
  }

  const table = getRequiredSyncTable(input.tableName);
  const acceptedIds: string[] = [];
  for (const idChunk of chunkArray(input.ids, DEFAULT_MAX_IDS_PER_READ_CHUNK)) {
    const scopedRows = await selectScopedDeleteIds({
      ids: idChunk,
      merchantId: input.merchantId,
      outletId: input.outletId,
      tableName: input.tableName,
      tx: input.tx,
    });
    const scopedIds = scopedRows.map((row) => row.id);
    if (scopedIds.length === 0) {
      continue;
    }

    await input.tx
      .update(table)
      .set({
        deletedAt: input.now,
        syncUpdatedAt: input.syncUpdatedAt,
        updatedAt: input.now,
      })
      .where(inArray(table.id, scopedIds));
    acceptedIds.push(...scopedIds);
  }

  return acceptedIds;
}

async function selectScopedDeleteIds(input: {
  ids: string[];
  merchantId: string;
  outletId: string;
  tableName: string;
  tx: TransactionLike;
}): Promise<Array<{ id: string }>> {
  if (input.ids.length === 0) {
    return [];
  }

  const typedTableName = input.tableName as keyof typeof SYNC_TABLE_SCOPE;
  if (!(typedTableName in SYNC_TABLE_SCOPE)) {
    return [];
  }

  const table = getRequiredSyncTable(input.tableName);
  const scope = SYNC_TABLE_SCOPE[typedTableName];
  const scopeColumn = scope.column === "id" ? "id" : scope.column;
  const scopeValue =
    scope.type === "merchant" ? input.merchantId : input.outletId;
  const scopeFilter =
    scopeColumn === "id"
      ? eq(table.id, scopeValue)
      : eq((table as never)[scopeColumn], scopeValue);

  return await resolveRowsLike<{ id: string }>(
    input.tx
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          scopeFilter,
          inArray(table.id, input.ids),
          sql`(COALESCE(${table.deletedAt}, '') = '')`
        )
      ),
    input.ids.length
  );
}

function normalizePullBatchLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return PULL_BATCH_DEFAULT_LIMIT;
  }

  return Math.min(limit, PULL_BATCH_MAX_LIMIT);
}

export interface PullBatchCursor {
  rowId: string;
  syncUpdatedAt: number;
  tableName: string;
}

export function parsePullBatchCursor(cursor: string): PullBatchCursor | null {
  if (!cursor) {
    return null;
  }

  if (!cursor.startsWith(PULL_BATCH_CURSOR_PREFIX)) {
    throw new Error("Invalid pull batch cursor");
  }

  const [, rawSyncUpdatedAt, tableName, rowId, ...rest] = cursor.split(":");
  if (
    rest.length > 0 ||
    !rawSyncUpdatedAt ||
    !tableName ||
    !rowId ||
    !INTEGER_TIMESTAMP_PATTERN.test(rawSyncUpdatedAt)
  ) {
    throw new Error("Invalid pull batch cursor");
  }

  return {
    rowId,
    syncUpdatedAt: Number(rawSyncUpdatedAt),
    tableName,
  };
}

export function formatPullBatchCursor(cursor: PullBatchCursor): string {
  return `${PULL_BATCH_CURSOR_PREFIX}${cursor.syncUpdatedAt}:${cursor.tableName}:${cursor.rowId}`;
}

function getAcceptedOperation(
  row: Record<string, unknown>,
  defaultOperation: "insert" | "update"
): SyncEventOperation {
  return row.deletedAt ? "delete" : defaultOperation;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    UNIQUE_CONSTRAINT_PATTERN.test(error.message) &&
    !INVALID_ERROR_PATTERN.test(error.message)
  );
}

interface RowStatePullBatchInput {
  cursor: string;
  limit: number;
  merchantId: string;
  outletId: string;
  tables: string[];
}

type RowStatePullBatchResult = {
  cursor: string;
  hasMore: boolean;
  serverTime: string;
} & Partial<Record<keyof typeof SYNC_TABLES, PullTableChanges>>;

interface RowStateCandidate {
  row: Record<string, unknown>;
  rowId: string;
  syncUpdatedAt: number;
  tableName: keyof typeof SYNC_TABLES;
}

function compareRowStateCandidates(
  left: RowStateCandidate,
  right: RowStateCandidate
): number {
  if (left.syncUpdatedAt !== right.syncUpdatedAt) {
    return left.syncUpdatedAt - right.syncUpdatedAt;
  }

  const tableComparison = left.tableName.localeCompare(right.tableName);
  if (tableComparison !== 0) {
    return tableComparison;
  }

  return left.rowId.localeCompare(right.rowId);
}

function getRowStateScopeFilter(
  tableName: keyof typeof SYNC_TABLES,
  merchantId: string,
  outletId: string
): SQL | undefined {
  if (!(tableName in SYNC_TABLE_SCOPE)) {
    return;
  }
  const scope = SYNC_TABLE_SCOPE[tableName];
  const table = SYNC_TABLES[tableName];
  if (scope.type === "merchant" && scope.column === "id") {
    return eq(table.id, merchantId);
  }
  const scopeColumn = scope.column as keyof typeof table;
  const scopeValue = scope.type === "merchant" ? merchantId : outletId;
  return eq(table[scopeColumn] as never, scopeValue);
}

function getRowStateCursorFilter(
  tableName: keyof typeof SYNC_TABLES,
  cursor: PullBatchCursor | null
): SQL | undefined {
  if (!cursor) {
    return;
  }

  const table = SYNC_TABLES[tableName];
  const comparison = tableName.localeCompare(cursor.tableName);
  if (comparison > 0) {
    return gte(table.syncUpdatedAt, cursor.syncUpdatedAt);
  }

  if (comparison < 0) {
    return gt(table.syncUpdatedAt, cursor.syncUpdatedAt);
  }

  return or(
    gt(table.syncUpdatedAt, cursor.syncUpdatedAt),
    and(
      eq(table.syncUpdatedAt, cursor.syncUpdatedAt),
      gt(table.id, cursor.rowId)
    )
  );
}

async function selectStatusCandidates(input: {
  cursor: PullBatchCursor | null;
  limit: number;
  merchantId: string;
  outletId: string;
  tables: string[];
  tx: TransactionTx;
}): Promise<RowStateCandidate[]> {
  const candidates: RowStateCandidate[] = [];
  const requestedTables =
    input.tables.length > 0 ? input.tables : Object.keys(SYNC_TABLES);

  for (const tableName of requestedTables) {
    if (!(tableName in SYNC_TABLES)) {
      continue;
    }

    const typedTableName = tableName as keyof typeof SYNC_TABLES;
    const table = getRequiredSyncTable(typedTableName);
    const filters = [
      getRowStateScopeFilter(typedTableName, input.merchantId, input.outletId),
      getRowStateCursorFilter(typedTableName, input.cursor),
    ].filter(Boolean);

    const rows = await resolveRowsLike<{
      id: string;
      syncUpdatedAt: number | bigint;
    }>(
      input.tx
        .select({ id: table.id, syncUpdatedAt: table.syncUpdatedAt })
        .from(table)
        .where(
          filters.length > 0 ? and(...(filters as [SQL, ...SQL[]])) : undefined
        )
        .orderBy(asc(table.syncUpdatedAt), asc(table.id))
        .limit(input.limit + 1),
      input.limit + 1
    );

    for (const row of rows) {
      if (
        typeof row.id !== "string" ||
        (typeof row.syncUpdatedAt !== "number" &&
          typeof row.syncUpdatedAt !== "bigint")
      ) {
        continue;
      }
      candidates.push({
        row: {},
        rowId: row.id,
        syncUpdatedAt:
          typeof row.syncUpdatedAt === "bigint"
            ? Number(row.syncUpdatedAt)
            : row.syncUpdatedAt,
        tableName: typedTableName,
      });
    }
  }

  candidates.sort(compareRowStateCandidates);
  return candidates;
}

async function selectRowStateCandidates(input: {
  cursor: PullBatchCursor | null;
  limit: number;
  merchantId: string;
  outletId: string;
  tables: string[];
  tx: TransactionTx;
}): Promise<RowStateCandidate[]> {
  const candidates: RowStateCandidate[] = [];
  const requestedTables =
    input.tables.length > 0 ? input.tables : Object.keys(SYNC_TABLES);

  for (const tableName of requestedTables) {
    if (!(tableName in SYNC_TABLES)) {
      continue;
    }

    const typedTableName = tableName as keyof typeof SYNC_TABLES;
    const table = getRequiredSyncTable(typedTableName);
    const filters = [
      getRowStateScopeFilter(typedTableName, input.merchantId, input.outletId),
      getRowStateCursorFilter(typedTableName, input.cursor),
    ].filter(Boolean);

    const query = input.tx
      .select()
      .from(table)
      .where(
        filters.length > 0 ? and(...(filters as [SQL, ...SQL[]])) : undefined
      )
      .orderBy(asc(table.syncUpdatedAt), asc(table.id));
    const rows = await resolveRowsLike<Record<string, unknown>>(
      query.limit(input.limit + 1),
      input.limit + 1
    );

    for (const row of rows) {
      const rowId = row.id;
      const syncUpdatedAt = row.syncUpdatedAt;
      if (
        typeof rowId !== "string" ||
        (typeof syncUpdatedAt !== "number" && typeof syncUpdatedAt !== "bigint")
      ) {
        continue;
      }

      candidates.push({
        row,
        rowId,
        syncUpdatedAt:
          typeof syncUpdatedAt === "bigint"
            ? Number(syncUpdatedAt)
            : syncUpdatedAt,
        tableName: typedTableName,
      });
    }
  }

  candidates.sort(compareRowStateCandidates);
  return candidates;
}

function hasDeletedAt(row: Record<string, unknown>): boolean {
  const value = row.deletedAt;
  return value !== null && value !== undefined && value !== "";
}

function buildRowStatePullBatchResult(input: {
  candidates: RowStateCandidate[];
  limit: number;
  serverTime: string;
}): RowStatePullBatchResult {
  const hasMore = input.candidates.length > input.limit;
  const committedCandidates = hasMore
    ? input.candidates.slice(0, input.limit)
    : input.candidates;
  const latestCommittedCandidate = committedCandidates.at(-1);
  const cursor = latestCommittedCandidate
    ? formatPullBatchCursor({
        rowId: latestCommittedCandidate.rowId,
        syncUpdatedAt: latestCommittedCandidate.syncUpdatedAt,
        tableName: latestCommittedCandidate.tableName,
      })
    : "";
  const result: RowStatePullBatchResult = {
    cursor,
    hasMore,
    serverTime: input.serverTime,
  };

  for (const candidate of committedCandidates) {
    const table = candidate.tableName;
    const tableChanges = result[table] ?? {
      changedRows: [],
      deletedIds: [],
    };

    if (hasDeletedAt(candidate.row)) {
      tableChanges.deletedIds.push(candidate.rowId);
    } else {
      tableChanges.changedRows.push(candidate.row);
    }

    result[table] = tableChanges;
  }

  return result;
}

export async function handleRowStatePullBatch(input: RowStatePullBatchInput) {
  return await db.transaction(async (tx) => {
    const cursor = parsePullBatchCursor(input.cursor);
    const limit = normalizePullBatchLimit(input.limit);
    const serverTime = new Date().toISOString();
    const candidates = await selectRowStateCandidates({
      cursor,
      limit,
      merchantId: input.merchantId,
      outletId: input.outletId,
      tables: input.tables,
      tx,
    });

    return buildRowStatePullBatchResult({
      candidates,
      limit,
      serverTime,
    });
  });
}

export async function handleRowStateSyncStatus(input: {
  cursor: string;
  merchantId: string;
  outletId: string;
}) {
  return await db.transaction(async (tx) => {
    const cursor = parsePullBatchCursor(input.cursor);
    const serverTime = new Date().toISOString();
    const candidates = await selectStatusCandidates({
      cursor,
      limit: PULL_BATCH_MAX_LIMIT,
      merchantId: input.merchantId,
      outletId: input.outletId,
      tables: Object.keys(SYNC_TABLES),
      tx,
    });

    const changedTables = Array.from(
      new Set(candidates.map((candidate) => candidate.tableName))
    );
    const latestCandidate = candidates.at(-1);

    return {
      changedTables,
      cursor: latestCandidate
        ? formatPullBatchCursor({
            rowId: latestCandidate.rowId,
            syncUpdatedAt: latestCandidate.syncUpdatedAt,
            tableName: latestCandidate.tableName,
          })
        : input.cursor,
      hasChanges: candidates.length > 0,
      serverTime,
    };
  });
}
