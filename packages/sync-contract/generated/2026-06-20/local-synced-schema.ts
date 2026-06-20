import { localSyncColumns } from "baresync/schema";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    businessType: text("business_type", {
      enum: ["fnb", "retail", "hybrid"],
    })
      .notNull()
      .default("hybrid"),
    ...localSyncColumns(),
  },
  (table) => [index("merchants_is_synced_idx").on(table.isSynced)]
);

export const outlets = sqliteTable(
  "outlets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id").notNull(),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    name: text("name").notNull(),
    address: text("address"),
    receiptName: text("receipt_name"),
    receiptAddress: text("receipt_address"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    useTax: integer("use_tax", { mode: "boolean" }).notNull().default(false),
    taxPercentage: integer("tax_percentage").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [index("outlets_is_synced_idx").on(table.isSynced)]
);

export const registers = sqliteTable(
  "registers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id").notNull(),
    name: text("name").notNull(),
    shortId: text("short_id").notNull(),
    pairingCode: text("pairing_code"),
    pairingExpiresAt: text("pairing_expires_at"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastSeenAt: text("last_seen_at"),
    ...localSyncColumns(),
  },
  (table) => [index("registers_is_synced_idx").on(table.isSynced)]
);

export const staff = sqliteTable(
  "staff",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id").notNull(),
    cloudUserId: text("cloud_user_id"),
    outletId: text("outlet_id"),
    name: text("name").notNull(),
    pin: text("pin"),
    role: text("role", { enum: ["cashier", "manager", "owner"] }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...localSyncColumns(),
  },
  (table) => [
    index("staff_is_synced_idx").on(table.isSynced),
    index("staff_merchant_active_idx").on(table.merchantId, table.isActive),
  ]
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...localSyncColumns(),
  },
  (table) => [
    index("categories_is_synced_idx").on(table.isSynced),
    index("categories_merchant_sort_idx").on(table.merchantId, table.sortOrder),
  ]
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id").notNull(),
    jobId: text("job_id"),
    objectKey: text("object_key"),
    originalFilename: text("original_filename"),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size"),
    contentHash: text("content_hash"),
    kind: text("kind").notNull(),
    width: integer("width"),
    height: integer("height"),
    status: text("status", {
      enum: ["pending", "compressed", "ready", "failed"],
    }).notNull(),
    createdByUserId: text("created_by_user_id"),
    ...localSyncColumns(),
  },
  (table) => [index("assets_is_synced_idx").on(table.isSynced)]
);

export const products = sqliteTable(
  "products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id").notNull(),
    categoryId: text("category_id"),
    name: text("name").notNull(),
    priceMinorUnits: integer("price_minor_units").notNull(),
    imageAssetId: text("image_asset_id"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [
    index("products_is_synced_idx").on(table.isSynced),
    index("products_merchant_active_sort_idx").on(
      table.merchantId,
      table.isActive,
      table.sortOrder
    ),
  ]
);

export const outletProducts = sqliteTable(
  "outlet_products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id").notNull(),
    productId: text("product_id").notNull(),
    priceMinorUnits: integer("price_minor_units"),
    isAvailable: integer("is_available", { mode: "boolean" })
      .notNull()
      .default(true),
    sortOrder: integer("sort_order"),
    ...localSyncColumns(),
  },
  (table) => [
    index("outlet_products_is_synced_idx").on(table.isSynced),
    index("outlet_products_outlet_product_idx").on(
      table.outletId,
      table.productId
    ),
  ]
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id").notNull(),
    registerId: text("register_id"),
    staffId: text("staff_id"),
    orderNumber: text("order_number").notNull().unique(),
    totalMinorUnits: integer("total_minor_units").notNull(),
    paymentMethod: text("payment_method", { enum: ["cash", "qris"] }).notNull(),
    amountPaidMinorUnits: integer("amount_paid_minor_units"),
    changeAmountMinorUnits: integer("change_amount_minor_units"),
    status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("orders_is_synced_idx").on(table.isSynced),
    index("orders_outlet_created_idx").on(table.outletId, table.createdAt),
  ]
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderId: text("order_id").notNull(),
    outletId: text("outlet_id").notNull(),
    productId: text("product_id"),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinorUnits: integer("unit_price_minor_units").notNull(),
    originalPriceMinorUnits: integer("original_price_minor_units"),
    subtotalMinorUnits: integer("subtotal_minor_units").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("order_items_is_synced_idx").on(table.isSynced),
    index("order_items_order_idx").on(table.orderId),
  ]
);

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id").notNull(),
    name: text("name").notNull(),
    sku: text("sku"),
    unit: text("unit").notNull().default("Pcs"),
    category: text("category"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...localSyncColumns(),
  },
  (table) => [
    index("ingredients_is_synced_idx").on(table.isSynced),
    index("ingredients_merchant_active_idx").on(table.merchantId, table.isActive),
  ]
);

export const inventoryStocks = sqliteTable(
  "inventory_stocks",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id").notNull(),
    targetType: text("target_type", { enum: ["product", "ingredient"] }).notNull(),
    targetId: text("target_id").notNull(),
    onHandQty: real("on_hand_qty").notNull().default(0),
    lowStockThreshold: real("low_stock_threshold"),
    ...localSyncColumns(),
  },
  (table) => [
    index("inventory_stocks_is_synced_idx").on(table.isSynced),
    index("inventory_stocks_outlet_target_idx").on(
      table.outletId,
      table.targetType,
      table.targetId
    ),
    uniqueIndex("inventory_stocks_outlet_target_unique").on(
      table.outletId,
      table.targetType,
      table.targetId
    ),
  ]
);

export const stocktakes = sqliteTable(
  "stocktakes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id").notNull(),
    staffId: text("staff_id").notNull(),
    ref: text("ref").notNull(),
    targetType: text("target_type", { enum: ["product", "ingredient"] }).notNull(),
    reason: text("reason").notNull(),
    countedAt: text("counted_at").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("stocktakes_is_synced_idx").on(table.isSynced),
    index("stocktakes_outlet_counted_idx").on(table.outletId, table.countedAt),
  ]
);

export const stocktakeLines = sqliteTable(
  "stocktake_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    stocktakeId: text("stocktake_id").notNull(),
    outletId: text("outlet_id").notNull(),
    targetId: text("target_id").notNull(),
    systemQtyBefore: real("system_qty_before").notNull(),
    countedQty: real("counted_qty").notNull(),
    varianceQty: real("variance_qty").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("stocktake_lines_is_synced_idx").on(table.isSynced),
    index("stocktake_lines_stocktake_idx").on(table.stocktakeId),
  ]
);

export const goodsReceipts = sqliteTable(
  "goods_receipts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id").notNull(),
    staffId: text("staff_id").notNull(),
    ref: text("ref").notNull(),
    supplierName: text("supplier_name"),
    note: text("note"),
    receivedAt: text("received_at").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("goods_receipts_is_synced_idx").on(table.isSynced),
    index("goods_receipts_outlet_received_idx").on(table.outletId, table.receivedAt),
  ]
);

export const goodsReceiptLines = sqliteTable(
  "goods_receipt_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    goodsReceiptId: text("goods_receipt_id").notNull(),
    outletId: text("outlet_id").notNull(),
    targetId: text("target_id").notNull(),
    receivedQty: real("received_qty").notNull(),
    unitCostMinorUnits: integer("unit_cost_minor_units"),
    ...localSyncColumns(),
  },
  (table) => [
    index("goods_receipt_lines_is_synced_idx").on(table.isSynced),
    index("goods_receipt_lines_receipt_idx").on(table.goodsReceiptId),
  ]
);

export const cashShifts = sqliteTable(
  "cash_shifts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id").notNull(),
    registerId: text("register_id"),
    openedByStaffId: text("opened_by_staff_id").notNull(),
    openedAt: text("opened_at").notNull(),
    closedAt: text("closed_at"),
    initialFloatMinorUnits: integer("initial_float_minor_units").notNull().default(0),
    expectedCashMinorUnits: integer("expected_cash_minor_units").notNull().default(0),
    actualCashMinorUnits: integer("actual_cash_minor_units"),
    differenceMinorUnits: integer("difference_minor_units"),
    status: text("status", { enum: ["open", "closed"] }).notNull(),
    note: text("note"),
    ...localSyncColumns(),
  },
  (table) => [
    index("cash_shifts_is_synced_idx").on(table.isSynced),
    index("cash_shifts_outlet_status_idx").on(table.outletId, table.status),
  ]
);

export const orderItemModifiers = sqliteTable(
  "order_item_modifiers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderItemId: text("order_item_id").notNull(),
    outletId: text("outlet_id").notNull(),
    modifierName: text("modifier_name").notNull(),
    modifierGroup: text("modifier_group"),
    priceDeltaMinorUnits: integer("price_delta_minor_units").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    ...localSyncColumns(),
  },
  (table) => [
    index("order_item_modifiers_is_synced_idx").on(table.isSynced),
    index("order_item_modifiers_order_item_idx").on(table.orderItemId),
  ]
);
