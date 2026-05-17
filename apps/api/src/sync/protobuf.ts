import {
  type OrderChanges,
  type OrderItemChanges,
  type OutletProductChanges,
  type ProductChanges,
  type SyncJsonTableChanges,
  SyncPullBatchResponse,
  SyncPushBatchRequest,
  SyncPushBatchResponse,
  SyncStatusResponse,
  type SyncTableAck,
} from "@repo/protobuf/sync";

const INTEGER_STRING_PATTERN = /^-?\d+$/;

export function protobufInt64ToSafeNumber(
  value: bigint,
  fieldName: string
): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} exceeds Number.MAX_SAFE_INTEGER`);
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
  hasMore?: boolean;
  jsonTables?: SyncJsonTableChanges[];
  latestEventId: number;
  needsFullResync: boolean;
  nextPageCursor?: string;
  orderItems?: TableChangeSet;
  orders?: TableChangeSet;
  outletProducts?: TableChangeSet;
  products?: TableChangeSet;
  serverTime: string;
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

function int64Field(value: unknown, fieldName: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && INTEGER_STRING_PATTERN.test(value)) {
    return BigInt(value);
  }
  if (value == null) {
    return 0n;
  }
  throw new Error(`Invalid int64 value for ${fieldName}`);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function boolField(value: unknown): boolean {
  return value === true || value === 1;
}

function productRowToProto(row: Record<string, unknown>) {
  return {
    categoryId: stringField(row.categoryId),
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    imageAssetId: stringField(row.imageAssetId),
    imageUrl: stringField(row.imageUrl),
    isActive: boolField(row.isActive),
    merchantId: stringField(row.merchantId),
    name: stringField(row.name),
    priceMinorUnits: int64Field(
      row.price ?? row.priceMinorUnits,
      "products.price"
    ),
    sortOrder: int64Field(row.sortOrder, "products.sortOrder"),
    updatedAt: stringField(row.updatedAt),
  };
}

function outletProductRowToProto(row: Record<string, unknown>) {
  return {
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    isAvailable: boolField(row.isAvailable),
    outletId: stringField(row.outletId),
    priceMinorUnits: int64Field(
      row.price ?? row.priceMinorUnits,
      "outlet_products.price"
    ),
    productId: stringField(row.productId),
    sortOrder: int64Field(row.sortOrder, "outlet_products.sortOrder"),
    updatedAt: stringField(row.updatedAt),
  };
}

function orderRowToProto(row: Record<string, unknown>) {
  return {
    amountPaidMinorUnits: int64Field(
      row.amountPaid ?? row.amountPaidMinorUnits,
      "orders.amountPaid"
    ),
    changeAmountMinorUnits: int64Field(
      row.changeAmount ?? row.changeAmountMinorUnits,
      "orders.changeAmount"
    ),
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    orderNumber: stringField(row.orderNumber),
    outletId: stringField(row.outletId),
    paymentMethod: stringField(row.paymentMethod),
    registerId: stringField(row.registerId),
    staffId: stringField(row.staffId),
    status: stringField(row.status),
    totalMinorUnits: int64Field(
      row.total ?? row.totalMinorUnits,
      "orders.total"
    ),
    updatedAt: stringField(row.updatedAt),
  };
}

function orderItemRowToProto(row: Record<string, unknown>) {
  return {
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    orderId: stringField(row.orderId),
    originalPriceMinorUnits: int64Field(
      row.originalPrice ?? row.originalPriceMinorUnits,
      "order_items.originalPrice"
    ),
    outletId: stringField(row.outletId),
    productId: stringField(row.productId),
    productName: stringField(row.productName),
    quantity: int64Field(row.quantity, "order_items.quantity"),
    subtotalMinorUnits: int64Field(
      row.subtotal ?? row.subtotalMinorUnits,
      "order_items.subtotal"
    ),
    unitPriceMinorUnits: int64Field(
      row.unitPrice ?? row.unitPriceMinorUnits,
      "order_items.unitPrice"
    ),
    updatedAt: stringField(row.updatedAt),
  };
}

function mapTableChanges<Row>(
  changes: TableChangeSet | undefined,
  mapper: (row: Record<string, unknown>) => Row
): { created: Row[]; deletedIds: string[]; updated: Row[] } | undefined {
  if (!changes) {
    return;
  }

  return {
    created: changes.created.map(mapper),
    deletedIds: changes.deletedIds,
    updated: changes.updated.map(mapper),
  };
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

function parseJsonRows(
  table: string,
  rows: string[]
): Record<string, unknown>[] {
  const parsedRows: Record<string, unknown>[] = [];
  for (const rowJson of rows) {
    const parsed: unknown = JSON.parse(rowJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Invalid JSON row for ${table}`);
    }
    parsedRows.push(parsed as Record<string, unknown>);
  }
  return parsedRows;
}

export function decodePushBatchRequest(
  request: SyncPushBatchRequest
): PushBatchChanges {
  const changes: PushBatchChanges = {};

  for (const table of request.jsonTables) {
    changes[table.table] = {
      created: parseJsonRows(table.table, table.createdJson),
      updated: parseJsonRows(table.table, table.updatedJson),
      deletedIds: table.deletedIds,
    };
  }

  if (request.products) {
    changes.products = {
      created: request.products.created.map((row) => ({ ...row })),
      updated: request.products.updated.map((row) => ({ ...row })),
      deletedIds: request.products.deletedIds,
    };
  }

  if (request.outletProducts) {
    changes.outlet_products = {
      created: request.outletProducts.created.map((row) => ({ ...row })),
      updated: request.outletProducts.updated.map((row) => ({ ...row })),
      deletedIds: request.outletProducts.deletedIds,
    };
  }

  if (request.orders) {
    changes.orders = {
      created: request.orders.created.map((row) => ({ ...row })),
      updated: request.orders.updated.map((row) => ({ ...row })),
      deletedIds: request.orders.deletedIds,
    };
  }

  if (request.orderItems) {
    changes.order_items = {
      created: request.orderItems.created.map((row) => ({ ...row })),
      updated: request.orderItems.updated.map((row) => ({ ...row })),
      deletedIds: request.orderItems.deletedIds,
    };
  }

  return changes;
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
  return SyncPullBatchResponse.create({
    hasMore: result.hasMore ?? false,
    jsonTables: result.jsonTables ?? [],
    latestEventId: coerceBigInt(result.latestEventId),
    needsFullResync: result.needsFullResync,
    nextPageCursor: result.nextPageCursor ?? "",
    orderItems: mapTableChanges(
      result.orderItems,
      orderItemRowToProto
    ) as OrderItemChanges,
    orders: mapTableChanges(result.orders, orderRowToProto) as OrderChanges,
    outletProducts: mapTableChanges(
      result.outletProducts,
      outletProductRowToProto
    ) as OutletProductChanges,
    products: mapTableChanges(
      result.products,
      productRowToProto
    ) as ProductChanges,
    serverTime: result.serverTime,
  });
}
