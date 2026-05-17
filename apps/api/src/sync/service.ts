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
  syncEvents,
  userMerchants,
} from "@repo/database/api-schema";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { db } from "../db";
import type {
  SyncEventOperation,
  SyncEventScopeType,
} from "../lib/sync-events";
import { ConflictRequestError } from "../lib/validation";
import { protobufInt64ToSafeNumber } from "./protobuf";

const ALL_SYNC_TABLE_NAMES = [
  "merchants",
  "outlets",
  "registers",
  "categories",
  "assets",
  "products",
  "outlet_products",
  "staff",
  "orders",
  "order_items",
];

const PUSH_TABLE_ORDER = [
  "merchants",
  "outlets",
  "registers",
  "staff",
  "categories",
  "assets",
  "products",
  "outlet_products",
  "orders",
  "order_items",
];

const PULL_BATCH_DEFAULT_LIMIT = 250;
const PULL_BATCH_MAX_LIMIT = 500;
const PULL_BATCH_CURSOR_PREFIX = "event:";

const INTEGER_TIMESTAMP_PATTERN = /^\d+$/;

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

type TransactionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface ExistingSyncRow {
  createdAt?: unknown;
  id: string;
  updatedAt?: unknown;
}

interface AcceptedPushRow {
  operation: SyncEventOperation;
  row: Record<string, unknown>;
  source: "created" | "updated";
}

interface CandidatePushRow {
  operation: "insert" | "update";
  row: Record<string, unknown>;
  source: "created" | "updated";
}

interface PullTableChanges {
  created: Record<string, unknown>[];
  deletedIds: string[];
  updated: Record<string, unknown>[];
}

interface PullBatchResult {
  assets?: PullTableChanges;
  categories?: PullTableChanges;
  hasMore: boolean;
  latestEventId: number;
  merchants?: PullTableChanges;
  needsFullResync: boolean;
  nextPageCursor: string;
  order_items?: PullTableChanges;
  orders?: PullTableChanges;
  outlet_products?: PullTableChanges;
  outlets?: PullTableChanges;
  products?: PullTableChanges;
  registers?: PullTableChanges;
  serverTime: string;
  staff?: PullTableChanges;
}

export interface TableChangeSet {
  created: Record<string, unknown>[];
  deletedIds: string[];
  updated: Record<string, unknown>[];
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
  latestEventId: number;
  serverTime: string;
  tables: PushBatchTableAck[];
}

function stripLocalOnlyColumns(
  row: Record<string, unknown>
): Record<string, unknown> {
  const { is_synced: _, ...clean } = row;
  return clean;
}

function normalizeEmptyToNull(
  row: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] =
      typeof value === "string" && value.length === 0 ? null : value;
  }
  return result;
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
  changes: PushBatchChanges,
  idempotencyKey = "",
  requestHash = ""
) {
  return await db.transaction(async (tx) => {
    if (idempotencyKey) {
      const cached = await loadPushBatchResponse(tx, {
        idempotencyKey,
        requestHash,
        outletId,
      });
      if (cached) {
        return cached;
      }
    }

    const tables: PushBatchTableAck[] = [];
    for (const tableName of PUSH_TABLE_ORDER) {
      const tableChanges = changes[tableName];
      if (!tableChanges) {
        continue;
      }

      tables.push(
        await processPushBatchTable({
          merchantId,
          outletId,
          tableName,
          changes: tableChanges,
          tx,
        })
      );
    }

    const response: StoredPushBatchResponse = {
      latestEventId: await getLatestScopedEventId(tx, merchantId, outletId),
      serverTime: new Date().toISOString(),
      tables,
    };

    if (idempotencyKey) {
      await storePushBatchResponse(tx, {
        idempotencyKey,
        outletId,
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
    idempotencyKey: string;
    requestHash: string;
    outletId: string;
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
        eq(syncBatchRequests.scopeType, "outlet"),
        eq(syncBatchRequests.scopeId, input.outletId),
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
    const parsed = JSON.parse(existing.responseJson) as StoredPushBatchResponse;
    return {
      latestEventId: existing.latestEventId,
      serverTime: existing.serverTime,
      tables: Array.isArray(parsed.tables) ? parsed.tables : [],
    };
  } catch {
    return {
      latestEventId: existing.latestEventId,
      serverTime: existing.serverTime,
      tables: [],
    };
  }
}

async function storePushBatchResponse(
  tx: TransactionTx,
  input: {
    idempotencyKey: string;
    requestHash: string;
    outletId: string;
    response: StoredPushBatchResponse;
  }
) {
  const now = new Date().toISOString();
  await tx.insert(syncBatchRequests).values({
    createdAt: now,
    idempotencyKey: input.idempotencyKey,
    latestEventId: input.response.latestEventId,
    requestHash: input.requestHash,
    responseJson: JSON.stringify(input.response),
    scopeId: input.outletId,
    scopeType: "outlet",
    serverTime: input.response.serverTime,
    updatedAt: now,
  });
}

async function processPushBatchTable(input: {
  merchantId: string;
  outletId: string;
  tableName: string;
  changes: TableChangeSet;
  tx: TransactionTx;
}): Promise<PushBatchTableAck> {
  const ack: PushBatchTableAck = {
    acceptedCreatedIds: [],
    acceptedDeletedIds: [],
    acceptedUpdatedIds: [],
    rejected: [],
    table: input.tableName,
  };

  const acceptedRows = await partitionAcceptedPushRows(input, ack);
  await bulkUpsertRowsForTableName({
    merchantId: input.merchantId,
    outletId: input.outletId,
    rows: acceptedRows.map((accepted) => accepted.row),
    tableName: input.tableName,
    tx: input.tx,
  });

  const syncEventRows = acceptedRows.map((accepted) =>
    buildSyncEventRow({
      merchantId: input.merchantId,
      operation: accepted.operation,
      outletId: input.outletId,
      row: accepted.row,
      tableName: input.tableName,
    })
  );

  await processTimestamplessDeletedIds(input, ack, syncEventRows);
  await insertSyncEvents(input.tx, syncEventRows);

  return ack;
}

async function partitionAcceptedPushRows(
  input: {
    changes: TableChangeSet;
    merchantId: string;
    outletId: string;
    tableName: string;
    tx: TransactionTx;
  },
  ack: PushBatchTableAck
): Promise<AcceptedPushRow[]> {
  const candidateRows: CandidatePushRow[] = [
    ...input.changes.created.map((row) => ({
      operation: "insert" as const,
      row: normalizePushBatchRowForTableName(input.tableName, row),
      source: "created" as const,
    })),
    ...input.changes.updated.map((row) => ({
      operation: "update" as const,
      row: normalizePushBatchRowForTableName(input.tableName, row),
      source: "updated" as const,
    })),
  ];

  if (candidateRows.length === 0) {
    return [];
  }

  const existingRows = await selectExistingRowsForTableName(
    input.tx,
    input.tableName,
    candidateRows.map((candidate) => candidate.row.id as string)
  );
  const existingRowsById = new Map(existingRows.map((row) => [row.id, row]));
  const acceptedRows: AcceptedPushRow[] = [];

  for (const candidate of candidateRows) {
    const id = candidate.row.id as string;
    const existing = existingRowsById.get(id);
    const defaultOperation = existing ? "update" : candidate.operation;
    const acceptedOperation = getAcceptedOperation(
      candidate.row,
      defaultOperation
    );

    if (existing && !clientRowWins(input.tableName, candidate.row, existing)) {
      ack.rejected.push({ id, reason: "server_newer" });
      continue;
    }

    acceptedRows.push({ ...candidate, operation: acceptedOperation });
    if (acceptedOperation === "delete") {
      ack.acceptedDeletedIds.push(id);
    } else if (candidate.source === "created") {
      ack.acceptedCreatedIds.push(id);
    } else {
      ack.acceptedUpdatedIds.push(id);
    }
  }

  return acceptedRows;
}

async function processTimestamplessDeletedIds(
  input: {
    merchantId: string;
    outletId: string;
    tableName: string;
    changes: TableChangeSet;
    tx: TransactionTx;
  },
  ack: PushBatchTableAck,
  syncEventRows: Record<string, unknown>[]
) {
  if (input.changes.deletedIds.length === 0) {
    return;
  }

  const existingDeleteIds = await existingRowIdsForTableName(
    input.tx,
    input.tableName,
    input.changes.deletedIds
  );

  const idsToSoftDelete = input.changes.deletedIds.filter((id) =>
    existingDeleteIds.has(id)
  );

  await softDeleteRowsForTableName(
    input.tx,
    input.tableName,
    idsToSoftDelete
  );

  const scope = getSyncEventScope(
    input.tableName,
    input.merchantId,
    input.outletId
  );
  for (const id of input.changes.deletedIds) {
    ack.acceptedDeletedIds.push(id);
    syncEventRows.push({
      changedAt: new Date().toISOString(),
      operation: "delete",
      rowId: id,
      scopeId: scope.scopeId,
      scopeType: scope.scopeType,
      tableName: input.tableName,
    });
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

async function selectExistingRowsForTableName(
  tx: TransactionTx,
  tableName: string,
  ids: string[]
): Promise<ExistingSyncRow[]> {
  if (ids.length === 0) {
    return [];
  }

  let rowsResult: unknown;
  switch (tableName) {
    case "merchants":
      rowsResult = tx
        .select()
        .from(merchants)
        .where(inArray(merchants.id, ids));
      break;
    case "outlets":
      rowsResult = tx.select().from(outlets).where(inArray(outlets.id, ids));
      break;
    case "registers":
      rowsResult = tx
        .select()
        .from(registers)
        .where(inArray(registers.id, ids));
      break;
    case "categories":
      rowsResult = tx
        .select()
        .from(categories)
        .where(inArray(categories.id, ids));
      break;
    case "assets":
      rowsResult = tx.select().from(assets).where(inArray(assets.id, ids));
      break;
    case "products":
      rowsResult = tx.select().from(products).where(inArray(products.id, ids));
      break;
    case "outlet_products":
      rowsResult = tx
        .select()
        .from(outletProducts)
        .where(inArray(outletProducts.id, ids));
      break;
    case "staff":
      rowsResult = tx.select().from(staff).where(inArray(staff.id, ids));
      break;
    case "orders":
      rowsResult = tx.select().from(orders).where(inArray(orders.id, ids));
      break;
    case "order_items":
      rowsResult = tx
        .select()
        .from(orderItems)
        .where(inArray(orderItems.id, ids));
      break;
    default:
      rowsResult = [];
  }

  const rows = await resolveLimitedRows<unknown>(rowsResult, ids.length);
  return rows.filter(
    (row): row is ExistingSyncRow =>
      typeof row === "object" &&
      row !== null &&
      "id" in row &&
      typeof row.id === "string" &&
      ("updatedAt" in row || "createdAt" in row)
  );
}

async function bulkUpsertRowsForTableName(input: {
  merchantId: string;
  outletId: string;
  rows: Record<string, unknown>[];
  tableName: string;
  tx: TransactionTx;
}) {
  if (input.rows.length === 0) {
    return;
  }

  switch (input.tableName) {
    case "merchants":
      await bulkUpsertRows(input.tx, merchants, input.rows);
      break;
    case "outlets":
      await bulkUpsertRows(
        input.tx,
        outlets,
        input.rows.map((row) => ({ ...row, merchantId: input.merchantId }))
      );
      break;
    case "registers":
      await bulkUpsertRows(
        input.tx,
        registers,
        input.rows.map((row) => ({ ...row, outletId: input.outletId }))
      );
      break;
    case "categories":
      await bulkUpsertRows(
        input.tx,
        categories,
        input.rows.map((row) => ({ ...row, merchantId: input.merchantId }))
      );
      break;
    case "assets":
      await bulkUpsertRows(
        input.tx,
        assets,
        input.rows.map((row) => ({ ...row, merchantId: input.merchantId }))
      );
      break;
    case "products":
      await bulkUpsertRows(
        input.tx,
        products,
        input.rows.map((row) => ({ ...row, merchantId: input.merchantId }))
      );
      break;
    case "outlet_products":
      await bulkUpsertRows(
        input.tx,
        outletProducts,
        input.rows.map((row) => ({ ...row, outletId: input.outletId }))
      );
      break;
    case "staff":
      await bulkUpsertRows(
        input.tx,
        staff,
        input.rows.map((row) => ({ ...row, merchantId: input.merchantId }))
      );
      break;
    case "orders":
      await bulkUpsertRows(
        input.tx,
        orders,
        input.rows.map((row) => ({ ...row, outletId: input.outletId }))
      );
      break;
    case "order_items":
      await bulkUpsertRows(
        input.tx,
        orderItems,
        input.rows.map((row) => ({
          ...normalizeOrderItemRow(row),
          outletId: input.outletId,
        }))
      );
      break;
    default:
      break;
  }
}

async function bulkUpsertRows(
  tx: TransactionTx,
  table:
    | typeof assets
    | typeof categories
    | typeof merchants
    | typeof orderItems
    | typeof orders
    | typeof outletProducts
    | typeof outlets
    | typeof products
    | typeof registers
    | typeof staff,
  rows: Record<string, unknown>[]
) {
  const set = buildExcludedSet(
    table as unknown as Record<string, unknown>,
    rows
  );
  if (Object.keys(set).length === 0) {
    await tx
      .insert(table)
      .values(rows as never)
      .onConflictDoNothing();
    return;
  }

  await tx
    .insert(table)
    .values(rows as never)
    .onConflictDoUpdate({ set, target: table.id } as never);
}

function buildExcludedSet(
  table: Record<string, unknown>,
  rows: Record<string, unknown>[]
): Record<string, SQL> {
  const keys = new Set(rows.flatMap((row) => Object.keys(row)));
  keys.delete("id");
  const tableColumns = table as Record<string, { name?: string }>;
  const set: Record<string, SQL> = {};

  for (const key of keys) {
    const columnName = tableColumns[key]?.name;
    if (!columnName) {
      continue;
    }
    set[key] = sql.raw(`excluded.${columnName}`);
  }

  return set;
}

function buildSyncEventRow(input: {
  merchantId: string;
  operation: SyncEventOperation;
  outletId: string;
  row: Record<string, unknown>;
  tableName: string;
}): Record<string, unknown> {
  const scope = getSyncEventScope(
    input.tableName,
    input.merchantId,
    input.outletId
  );
  return {
    changedAt: String(
      input.row.updatedAt ?? input.row.createdAt ?? new Date().toISOString()
    ),
    operation: input.operation,
    rowId: input.row.id as string,
    scopeId: scope.scopeId,
    scopeType: scope.scopeType,
    tableName: input.tableName,
  };
}

async function insertSyncEvents(
  tx: TransactionTx,
  events: Record<string, unknown>[]
) {
  if (events.length > 0) {
    await tx.insert(syncEvents).values(events as never);
  }
}

async function existingRowIdsForTableName(
  tx: TransactionTx,
  tableName: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }

  let rowsResult: unknown;
  switch (tableName) {
    case "merchants":
      rowsResult = await tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(inArray(merchants.id, ids));
      break;
    case "outlets":
      rowsResult = await tx
        .select({ id: outlets.id })
        .from(outlets)
        .where(inArray(outlets.id, ids));
      break;
    case "registers":
      rowsResult = await tx
        .select({ id: registers.id })
        .from(registers)
        .where(inArray(registers.id, ids));
      break;
    case "categories":
      rowsResult = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(inArray(categories.id, ids));
      break;
    case "assets":
      rowsResult = await tx
        .select({ id: assets.id })
        .from(assets)
        .where(inArray(assets.id, ids));
      break;
    case "products":
      rowsResult = await tx
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, ids));
      break;
    case "outlet_products":
      rowsResult = await tx
        .select({ id: outletProducts.id })
        .from(outletProducts)
        .where(inArray(outletProducts.id, ids));
      break;
    case "staff":
      rowsResult = await tx
        .select({ id: staff.id })
        .from(staff)
        .where(inArray(staff.id, ids));
      break;
    case "orders":
      rowsResult = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(inArray(orders.id, ids));
      break;
    case "order_items":
      rowsResult = await tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(inArray(orderItems.id, ids));
      break;
    default:
      rowsResult = [];
  }

  const rows = await resolveRowsResult(rowsResult);
  return new Set(rows.map((row) => row.id));
}

async function resolveRowsResult(value: unknown): Promise<{ id: string }[]> {
  if (Array.isArray(value)) {
    return value.filter(
      (row): row is { id: string } =>
        typeof row === "object" &&
        row !== null &&
        "id" in row &&
        typeof row.id === "string"
    );
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "limit" in value &&
    typeof value.limit === "function"
  ) {
    const limitedRows = await value.limit(1);
    return resolveRowsResult(limitedRows);
  }

  return [];
}

function normalizePushBatchRowForTableName(
  tableName: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  const base = normalizeEmptyToNull(stripLocalOnlyColumns(row));

  switch (tableName) {
    case "products":
      return {
        ...base,
        price: normalizeBatchInt64(row.priceMinorUnits),
        sortOrder: normalizeBatchInt64(row.sortOrder),
      };
    case "outlet_products":
      return {
        ...base,
        price: normalizeBatchInt64(row.priceMinorUnits),
        sortOrder: normalizeBatchInt64(row.sortOrder),
      };
    case "orders":
      return {
        ...base,
        amountPaid: normalizeBatchInt64(row.amountPaidMinorUnits),
        changeAmount: normalizeBatchInt64(row.changeAmountMinorUnits),
        total: normalizeBatchInt64(row.totalMinorUnits),
      };
    case "order_items":
      return {
        ...base,
        originalPrice: normalizeBatchInt64(row.originalPriceMinorUnits),
        quantity: normalizeBatchInt64(row.quantity),
        subtotal: normalizeBatchInt64(row.subtotalMinorUnits),
        unitPrice: normalizeBatchInt64(row.unitPriceMinorUnits),
      };
    default:
      return base;
  }
}

async function softDeleteRowsForTableName(
  tx: TransactionTx,
  tableName: string,
  ids: string[]
) {
  if (ids.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  switch (tableName) {
    case "merchants":
      await tx
        .update(merchants)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(merchants.id, ids));
      break;
    case "outlets":
      await tx
        .update(outlets)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(outlets.id, ids));
      break;
    case "registers":
      await tx
        .update(registers)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(registers.id, ids));
      break;
    case "categories":
      await tx
        .update(categories)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(categories.id, ids));
      break;
    case "assets":
      await tx
        .update(assets)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(assets.id, ids));
      break;
    case "products":
      await tx
        .update(products)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(products.id, ids));
      break;
    case "outlet_products":
      await tx
        .update(outletProducts)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(outletProducts.id, ids));
      break;
    case "staff":
      await tx
        .update(staff)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(staff.id, ids));
      break;
    case "orders":
      await tx
        .update(orders)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(orders.id, ids));
      break;
    case "order_items":
      await tx
        .update(orderItems)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(orderItems.id, ids));
      break;
    default:
      break;
  }
}

function normalizeBatchInt64(value: unknown): number {
  if (typeof value === "bigint") {
    return protobufInt64ToSafeNumber(value, "int64");
  }
  if (typeof value === "number") {
    return value;
  }
  return 0;
}

interface PullBatchEntry {
  operation: SyncEventOperation;
  row: Record<string, unknown>;
  rowId: string;
  table: string;
}

function normalizePullBatchLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return PULL_BATCH_DEFAULT_LIMIT;
  }

  return Math.min(limit, PULL_BATCH_MAX_LIMIT);
}

function parsePullBatchCursor(pageCursor: string): number {
  if (!pageCursor) {
    return 0;
  }

  if (!pageCursor.startsWith(PULL_BATCH_CURSOR_PREFIX)) {
    throw new Error("Invalid pull batch cursor");
  }

  const rawEventId = Number(pageCursor.slice(PULL_BATCH_CURSOR_PREFIX.length));
  if (!Number.isInteger(rawEventId) || rawEventId < 0) {
    throw new Error("Invalid pull batch cursor");
  }

  return rawEventId;
}

function formatPullBatchCursor(eventId: number): string {
  return `${PULL_BATCH_CURSOR_PREFIX}${eventId}`;
}

async function buildPullBatchEntries(
  events: {
    id: number;
    operation: SyncEventOperation;
    rowId: string;
    tableName: string;
  }[],
  merchantId: string,
  outletId: string
): Promise<PullBatchEntry[]> {
  const entries: PullBatchEntry[] = [];
  const idsByTable = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.operation === "delete") {
      continue;
    }
    const ids = idsByTable.get(event.tableName) ?? new Set<string>();
    ids.add(event.rowId);
    idsByTable.set(event.tableName, ids);
  }

  const snapshotsByTable = new Map<
    string,
    Map<string, Record<string, unknown>>
  >();
  for (const [tableName, rowIds] of idsByTable) {
    const rows = await selectSnapshotsForEvents({
      merchantId,
      outletId,
      rowIds: Array.from(rowIds),
      tableName,
    });
    const rowsById = new Map<string, Record<string, unknown>>();
    for (const row of (rows ?? []) as Record<string, unknown>[]) {
      if (typeof row.id === "string") {
        rowsById.set(row.id, row);
      }
    }
    snapshotsByTable.set(tableName, rowsById);
  }

  for (const event of events) {
    const row =
      event.operation === "delete"
        ? { id: event.rowId }
        : snapshotsByTable.get(event.tableName)?.get(event.rowId);
    if (!row) {
      continue;
    }
    entries.push({
      operation: event.operation,
      row,
      rowId: event.rowId,
      table: event.tableName,
    });
  }

  return entries;
}

const TYPED_TABLE_PROPERTY_MAP = {
  assets: "assets",
  categories: "categories",
  merchants: "merchants",
  order_items: "order_items",
  orders: "orders",
  outlet_products: "outlet_products",
  outlets: "outlets",
  products: "products",
  registers: "registers",
  staff: "staff",
} as const;

type TypedTableProperty = keyof typeof TYPED_TABLE_PROPERTY_MAP;

function applyPullBatchEntries(
  entries: PullBatchEntry[]
): Partial<Pick<PullBatchResult, TypedTableProperty>> {
  const result: Partial<Pick<PullBatchResult, TypedTableProperty>> = {};

  for (const entry of entries) {
    const property =
      TYPED_TABLE_PROPERTY_MAP[entry.table as TypedTableProperty];
    if (!property) {
      continue;
    }

    const current = (result[property] as PullTableChanges | undefined) ?? {
      created: [],
      deletedIds: [],
      updated: [],
    };

    if (entry.operation === "insert") {
      current.created.push(entry.row);
    } else if (entry.operation === "delete") {
      current.deletedIds.push(entry.rowId);
    } else {
      current.updated.push(entry.row);
    }

    (result as Record<string, PullTableChanges>)[property] = current;
  }

  return result;
}

async function normalizePullBatchResult(input: {
  afterEventId: number;
  events: {
    id: number;
    operation: SyncEventOperation;
    rowId: string;
    tableName: string;
  }[];
  gapBaseEventId: number;
  limit: number;
  merchantId: string;
  outletId: string;
}): Promise<PullBatchResult> {
  const eventIds = input.events.map((event) => event.id);
  const retainedLatestEventId =
    eventIds.length > 0 ? Math.max(...eventIds) : input.afterEventId;
  const oldestAvailableEventId =
    eventIds.length > 0 ? Math.min(...eventIds) : null;
  const needsFullResync =
    oldestAvailableEventId !== null &&
    input.gapBaseEventId > 0 &&
    input.gapBaseEventId + 1 < oldestAvailableEventId;
  const serverTime = new Date().toISOString();

  if (needsFullResync) {
    return {
      hasMore: false,
      latestEventId: retainedLatestEventId,
      needsFullResync: true,
      nextPageCursor: "",
      serverTime,
    };
  }

  const pageEvents = input.events;
  const normalizedLimit = input.limit;
  const hasMore = pageEvents.length > normalizedLimit;
  const committedEvents = hasMore
    ? pageEvents.slice(0, normalizedLimit)
    : pageEvents;
  const latestEventId =
    committedEvents.at(-1)?.id ??
    Math.max(input.afterEventId, input.gapBaseEventId);
  const pageEntries = await buildPullBatchEntries(
    committedEvents,
    input.merchantId,
    input.outletId
  );
  const pageResult = applyPullBatchEntries(pageEntries);

  return {
    ...pageResult,
    hasMore,
    latestEventId,
    needsFullResync: false,
    nextPageCursor: hasMore ? formatPullBatchCursor(latestEventId) : "",
    serverTime,
  };
}

function normalizeOrderItemRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  return { ...row, productId: null };
}

function getAcceptedOperation(
  row: Record<string, unknown>,
  defaultOperation: "insert" | "update"
): SyncEventOperation {
  return row.deletedAt ? "delete" : defaultOperation;
}

function getSyncEventScope(
  tableName: string,
  merchantId: string,
  outletId: string
): { scopeId: string; scopeType: SyncEventScopeType } {
  switch (tableName) {
    case "registers":
    case "outlet_products":
    case "orders":
    case "order_items":
      return { scopeId: outletId, scopeType: "outlet" };
    default:
      return { scopeId: merchantId, scopeType: "merchant" };
  }
}

async function selectBaselineSnapshots(
  outletId: string,
  merchantId: string,
  tables: string[],
  since: string
): Promise<Record<string, unknown[]>> {
  const result: Record<string, unknown[]> = {};

  for (const tableName of tables) {
    switch (tableName) {
      case "merchants": {
        result.merchants = await db
          .select()
          .from(merchants)
          .where(
            and(eq(merchants.id, merchantId), gt(merchants.updatedAt, since))
          );
        break;
      }
      case "outlets": {
        result.outlets = await db
          .select()
          .from(outlets)
          .where(
            and(
              eq(outlets.merchantId, merchantId),
              gt(outlets.updatedAt, since)
            )
          );
        break;
      }
      case "registers": {
        result.registers = await db
          .select()
          .from(registers)
          .where(
            and(
              eq(registers.outletId, outletId),
              gt(registers.updatedAt, since)
            )
          );
        break;
      }
      case "categories": {
        result.categories = await db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.merchantId, merchantId),
              gt(categories.updatedAt, since)
            )
          );
        break;
      }
      case "assets": {
        result.assets = await db
          .select()
          .from(assets)
          .where(
            and(eq(assets.merchantId, merchantId), gt(assets.updatedAt, since))
          );
        break;
      }
      case "products": {
        result.products = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.merchantId, merchantId),
              gt(products.updatedAt, since)
            )
          );
        break;
      }
      case "outlet_products": {
        result.outlet_products = await db
          .select()
          .from(outletProducts)
          .where(
            and(
              eq(outletProducts.outletId, outletId),
              gt(outletProducts.updatedAt, since)
            )
          );
        break;
      }
      case "staff": {
        result.staff = await db
          .select()
          .from(staff)
          .where(
            and(eq(staff.merchantId, merchantId), gt(staff.updatedAt, since))
          );
        break;
      }
      case "orders": {
        result.orders = await db
          .select()
          .from(orders)
          .where(
            and(eq(orders.outletId, outletId), gt(orders.updatedAt, since))
          );
        break;
      }
      case "order_items": {
        result.order_items = await db
          .select()
          .from(orderItems)
          .where(
            and(
              eq(orderItems.outletId, outletId),
              gt(orderItems.updatedAt, since)
            )
          );
        break;
      }
      default:
        break;
    }
  }

  return result;
}

export interface PullBatchInput {
  afterEventId: number;
  limit: number;
  merchantId: string;
  outletId: string;
  pageCursor: string;
  tables: string[];
}

export async function handlePullBatch(input: PullBatchInput) {
  if (input.afterEventId === 0 && !input.pageCursor) {
    const latestEvent = await getLatestScopedEvent(
      input.merchantId,
      input.outletId
    );
    return await buildBaselinePullBatchResult(input, latestEvent?.id ?? 0);
  }

  const normalizedLimit = normalizePullBatchLimit(input.limit);
  const cursorEventId = parsePullBatchCursor(input.pageCursor);
  const lowerBound = Math.max(input.afterEventId, cursorEventId);
  const scopedEventsFilter = getScopedEventsFilter(
    input.merchantId,
    input.outletId
  );
  const conditions: SQL[] = [gt(syncEvents.id, lowerBound)];
  if (scopedEventsFilter) {
    conditions.unshift(scopedEventsFilter);
  }
  if (input.tables.length > 0) {
    conditions.push(inArray(syncEvents.tableName, input.tables));
  }

  const eventQuery = db
    .select({
      id: syncEvents.id,
      operation: syncEvents.operation,
      rowId: syncEvents.rowId,
      tableName: syncEvents.tableName,
    })
    .from(syncEvents)
    .where(and(...conditions))
    .orderBy(asc(syncEvents.id));
  const events = await resolveLimitedRows<{
    id: number;
    operation: SyncEventOperation;
    rowId: string;
    tableName: string;
  }>(eventQuery, normalizedLimit + 1);

  return await normalizePullBatchResult({
    afterEventId: input.afterEventId,
    events: events.slice(0, normalizedLimit + 1),
    gapBaseEventId: lowerBound,
    limit: normalizedLimit,
    merchantId: input.merchantId,
    outletId: input.outletId,
  });
}

async function getLatestScopedEvent(merchantId: string, outletId: string) {
  const query = db
    .select({ id: syncEvents.id })
    .from(syncEvents)
    .where(getScopedEventsFilter(merchantId, outletId))
    .orderBy(desc(syncEvents.id));
  const rows = await resolveLimitedRows<{ id: number }>(query, 1);
  return rows[0] ?? null;
}

async function resolveLimitedRows<T>(
  value: unknown,
  limit: number
): Promise<T[]> {
  if (
    typeof value === "object" &&
    value !== null &&
    "limit" in value &&
    typeof value.limit === "function"
  ) {
    return (await value.limit(limit)) as T[];
  }

  const resolved = await value;
  return Array.isArray(resolved) ? (resolved as T[]) : [];
}

async function buildBaselinePullBatchResult(
  input: PullBatchInput,
  latestEventId: number
): Promise<PullBatchResult> {
  const tables = input.tables.length > 0 ? input.tables : ALL_SYNC_TABLE_NAMES;
  const snapshots = await selectBaselineSnapshots(
    input.outletId,
    input.merchantId,
    tables,
    "1970-01-01T00:00:00.000Z"
  );
  const entries: PullBatchEntry[] = [];
  for (const table of tables) {
    const rows = Array.isArray(snapshots[table])
      ? (snapshots[table] as Record<string, unknown>[])
      : [];
    for (const row of rows) {
      if (typeof row.id !== "string") {
        continue;
      }
      entries.push({
        operation: row.deletedAt ? "delete" : "insert",
        row,
        rowId: row.id,
        table,
      });
    }
  }
  const pageResult = applyPullBatchEntries(entries);
  return {
    ...pageResult,
    hasMore: false,
    latestEventId,
    needsFullResync: false,
    nextPageCursor: "",
    serverTime: String(snapshots.serverTime),
  };
}

async function selectSnapshotsForEvents(input: {
  merchantId: string;
  outletId: string;
  rowIds: string[];
  tableName: string;
}): Promise<unknown[] | null> {
  if (input.rowIds.length === 0) {
    return [];
  }

  switch (input.tableName) {
    case "merchants":
      return await db
        .select()
        .from(merchants)
        .where(
          and(
            eq(merchants.id, input.merchantId),
            inArray(merchants.id, input.rowIds)
          )
        );
    case "outlets":
      return await db
        .select()
        .from(outlets)
        .where(
          and(
            eq(outlets.merchantId, input.merchantId),
            inArray(outlets.id, input.rowIds)
          )
        );
    case "registers":
      return await db
        .select()
        .from(registers)
        .where(
          and(
            eq(registers.outletId, input.outletId),
            inArray(registers.id, input.rowIds)
          )
        );
    case "categories":
      return await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.merchantId, input.merchantId),
            inArray(categories.id, input.rowIds)
          )
        );
    case "assets":
      return await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.merchantId, input.merchantId),
            inArray(assets.id, input.rowIds)
          )
        );
    case "products":
      return await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.merchantId, input.merchantId),
            inArray(products.id, input.rowIds)
          )
        );
    case "outlet_products":
      return await db
        .select()
        .from(outletProducts)
        .where(
          and(
            eq(outletProducts.outletId, input.outletId),
            inArray(outletProducts.id, input.rowIds)
          )
        );
    case "staff":
      return await db
        .select()
        .from(staff)
        .where(
          and(
            eq(staff.merchantId, input.merchantId),
            inArray(staff.id, input.rowIds)
          )
        );
    case "orders":
      return await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.outletId, input.outletId),
            inArray(orders.id, input.rowIds)
          )
        );
    case "order_items":
      return await db
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.outletId, input.outletId),
            inArray(orderItems.id, input.rowIds)
          )
        );
    default:
      return null;
  }
}

export interface SyncStatusInput {
  lastServerEventId: number;
  merchantId: string;
  outletId: string;
}

export async function handleSyncStatus(input: SyncStatusInput) {
  const latestQuery = db
    .select({ id: syncEvents.id })
    .from(syncEvents)
    .where(getScopedEventsFilter(input.merchantId, input.outletId))
    .orderBy(desc(syncEvents.id));
  const [latestEvent] = await resolveLimitedRows<{ id: number }>(
    latestQuery,
    1
  );

  const oldestQuery = db
    .select({ id: syncEvents.id })
    .from(syncEvents)
    .where(getScopedEventsFilter(input.merchantId, input.outletId))
    .orderBy(asc(syncEvents.id));
  const [oldestEvent] = await resolveLimitedRows<{ id: number }>(
    oldestQuery,
    1
  );

  const changedTableRows = await db
    .select({ tableName: syncEvents.tableName })
    .from(syncEvents)
    .where(
      and(
        getScopedEventsFilter(input.merchantId, input.outletId),
        gt(syncEvents.id, input.lastServerEventId)
      )
    )
    .orderBy(asc(syncEvents.id));
  const latestEventId = latestEvent?.id ?? input.lastServerEventId;
  const oldestAvailableEventId = oldestEvent?.id ?? null;
  const changedTables = Array.from(
    new Set(changedTableRows.map((event) => event.tableName))
  );

  return {
    changedTables,
    hasChanges: latestEventId > input.lastServerEventId,
    latestEventId,
    needsFullResync:
      oldestAvailableEventId !== null &&
      input.lastServerEventId > 0 &&
      input.lastServerEventId + 1 < oldestAvailableEventId,
    oldestAvailableEventId,
  };
}

function getScopedEventsFilter(merchantId: string, outletId: string) {
  return or(
    and(
      eq(syncEvents.scopeType, "merchant"),
      eq(syncEvents.scopeId, merchantId)
    ),
    and(eq(syncEvents.scopeType, "outlet"), eq(syncEvents.scopeId, outletId))
  );
}

async function getLatestScopedEventId(
  tx: TransactionTx,
  merchantId: string,
  outletId: string
): Promise<number> {
  const [latestEvent] = await tx
    .select({ id: syncEvents.id })
    .from(syncEvents)
    .where(getScopedEventsFilter(merchantId, outletId))
    .orderBy(desc(syncEvents.id))
    .limit(1);

  return latestEvent?.id ?? 0;
}

export { ALL_SYNC_TABLE_NAMES };
