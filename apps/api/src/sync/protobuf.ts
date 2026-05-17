import {
  type AssetChanges,
  type CategoryChanges,
  type MerchantChanges,
  type OrderChanges,
  type OrderItemChanges,
  type OutletChanges,
  type OutletProductChanges,
  type ProductChanges,
  type RegisterChanges,
  type StaffChanges,
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

function merchantRowToProto(row: Record<string, unknown>) {
  return {
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    name: stringField(row.name),
    updatedAt: stringField(row.updatedAt),
  };
}

function outletRowToProto(row: Record<string, unknown>) {
  return {
    address: stringField(row.address),
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    isActive: boolField(row.isActive),
    merchantId: stringField(row.merchantId),
    name: stringField(row.name),
    receiptAddress: stringField(row.receiptAddress),
    receiptName: stringField(row.receiptName),
    timezone: stringField(row.timezone),
    updatedAt: stringField(row.updatedAt),
  };
}

function registerRowToProto(row: Record<string, unknown>) {
  return {
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    isActive: boolField(row.isActive),
    lastSeenAt: stringField(row.lastSeenAt),
    name: stringField(row.name),
    outletId: stringField(row.outletId),
    pairingCode: stringField(row.pairingCode),
    pairingExpiresAt: stringField(row.pairingExpiresAt),
    shortId: stringField(row.shortId),
    updatedAt: stringField(row.updatedAt),
  };
}

function categoryRowToProto(row: Record<string, unknown>) {
  return {
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    isActive: boolField(row.isActive),
    merchantId: stringField(row.merchantId),
    name: stringField(row.name),
    sortOrder: int64Field(row.sortOrder, "categories.sortOrder"),
    updatedAt: stringField(row.updatedAt),
  };
}

function assetRowToProto(row: Record<string, unknown>) {
  return {
    byteSize: int64Field(row.byteSize, "assets.byteSize"),
    contentHash: stringField(row.contentHash),
    contentType: stringField(row.contentType),
    createdAt: stringField(row.createdAt),
    createdByUserId: stringField(row.createdByUserId),
    deletedAt: stringField(row.deletedAt),
    height: int64Field(row.height, "assets.height"),
    id: stringField(row.id),
    kind: stringField(row.kind),
    merchantId: stringField(row.merchantId),
    objectKey: stringField(row.objectKey),
    originalFilename: stringField(row.originalFilename),
    status: stringField(row.status),
    updatedAt: stringField(row.updatedAt),
    width: int64Field(row.width, "assets.width"),
  };
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

function staffRowToProto(row: Record<string, unknown>) {
  return {
    cloudUserId: stringField(row.cloudUserId),
    createdAt: stringField(row.createdAt),
    deletedAt: stringField(row.deletedAt),
    id: stringField(row.id),
    isActive: boolField(row.isActive),
    merchantId: stringField(row.merchantId),
    name: stringField(row.name),
    outletId: stringField(row.outletId),
    pin: stringField(row.pin),
    role: stringField(row.role),
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

export function decodePushBatchRequest(
  request: SyncPushBatchRequest
): PushBatchChanges {
  const changes: PushBatchChanges = {};

  if (request.merchants) {
    changes.merchants = {
      created: request.merchants.created.map((row) => ({ ...row })),
      deletedIds: request.merchants.deletedIds,
      updated: request.merchants.updated.map((row) => ({ ...row })),
    };
  }

  if (request.outlets) {
    changes.outlets = {
      created: request.outlets.created.map((row) => ({ ...row })),
      deletedIds: request.outlets.deletedIds,
      updated: request.outlets.updated.map((row) => ({ ...row })),
    };
  }

  if (request.registers) {
    changes.registers = {
      created: request.registers.created.map((row) => ({ ...row })),
      deletedIds: request.registers.deletedIds,
      updated: request.registers.updated.map((row) => ({ ...row })),
    };
  }

  if (request.categories) {
    changes.categories = {
      created: request.categories.created.map((row) => ({ ...row })),
      deletedIds: request.categories.deletedIds,
      updated: request.categories.updated.map((row) => ({ ...row })),
    };
  }

  if (request.assets) {
    changes.assets = {
      created: request.assets.created.map((row) => ({ ...row })),
      deletedIds: request.assets.deletedIds,
      updated: request.assets.updated.map((row) => ({ ...row })),
    };
  }

  if (request.products) {
    changes.products = {
      created: request.products.created.map((row) => ({ ...row })),
      deletedIds: request.products.deletedIds,
      updated: request.products.updated.map((row) => ({ ...row })),
    };
  }

  if (request.orders) {
    changes.orders = {
      created: request.orders.created.map((row) => ({ ...row })),
      deletedIds: request.orders.deletedIds,
      updated: request.orders.updated.map((row) => ({ ...row })),
    };
  }

  if (request.orderItems) {
    changes.order_items = {
      created: request.orderItems.created.map((row) => ({ ...row })),
      deletedIds: request.orderItems.deletedIds,
      updated: request.orderItems.updated.map((row) => ({ ...row })),
    };
  }

  if (request.outletProducts) {
    changes.outlet_products = {
      created: request.outletProducts.created.map((row) => ({ ...row })),
      deletedIds: request.outletProducts.deletedIds,
      updated: request.outletProducts.updated.map((row) => ({ ...row })),
    };
  }

  if (request.staff) {
    changes.staff = {
      created: request.staff.created.map((row) => ({ ...row })),
      deletedIds: request.staff.deletedIds,
      updated: request.staff.updated.map((row) => ({ ...row })),
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
    assets: mapTableChanges(result.assets, assetRowToProto) as AssetChanges,
    categories: mapTableChanges(
      result.categories,
      categoryRowToProto
    ) as CategoryChanges,
    hasMore: result.hasMore ?? false,
    latestEventId: coerceBigInt(result.latestEventId),
    merchants: mapTableChanges(
      result.merchants,
      merchantRowToProto
    ) as MerchantChanges,
    needsFullResync: result.needsFullResync,
    nextPageCursor: result.nextPageCursor ?? "",
    orderItems: mapTableChanges(
      result.order_items,
      orderItemRowToProto
    ) as OrderItemChanges,
    orders: mapTableChanges(result.orders, orderRowToProto) as OrderChanges,
    outletProducts: mapTableChanges(
      result.outlet_products,
      outletProductRowToProto
    ) as OutletProductChanges,
    outlets: mapTableChanges(result.outlets, outletRowToProto) as OutletChanges,
    products: mapTableChanges(
      result.products,
      productRowToProto
    ) as ProductChanges,
    registers: mapTableChanges(
      result.registers,
      registerRowToProto
    ) as RegisterChanges,
    serverTime: result.serverTime,
    staff: mapTableChanges(result.staff, staffRowToProto) as StaffChanges,
  });
}
