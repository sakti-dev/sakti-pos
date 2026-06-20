import { apiSyncColumns } from "baresync/schema";
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
    ...apiSyncColumns(),
  },
  (table) => [
    index("merchants_scope_sync_idx").on(table.id, table.syncUpdatedAt),
  ]
);

export const outlets = sqliteTable(
  "outlets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    name: text("name").notNull(),
    address: text("address"),
    receiptName: text("receipt_name"),
    receiptAddress: text("receipt_address"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    useTax: integer("use_tax", { mode: "boolean" }).notNull().default(false),
    taxPercentage: integer("tax_percentage").notNull().default(0),
    ...apiSyncColumns(),
  },
  (table) => [
    index("outlets_scope_sync_idx").on(table.merchantId, table.syncUpdatedAt),
  ]
);

export const registers = sqliteTable(
  "registers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    name: text("name").notNull(),
    shortId: text("short_id").notNull().unique(),
    pairingCode: text("pairing_code").unique(),
    pairingExpiresAt: text("pairing_expires_at"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastSeenAt: text("last_seen_at"),
    ...apiSyncColumns(),
  },
  (table) => [
    index("registers_scope_sync_idx").on(table.outletId, table.syncUpdatedAt),
  ]
);

export const staff = sqliteTable(
  "staff",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    cloudUserId: text("cloud_user_id"),
    outletId: text("outlet_id").references(() => outlets.id),
    name: text("name").notNull(),
    pin: text("pin"),
    role: text("role", { enum: ["cashier", "manager", "owner"] }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...apiSyncColumns(),
  },
  (table) => [
    index("staff_scope_sync_idx").on(table.merchantId, table.syncUpdatedAt),
    index("staff_merchant_active_idx").on(table.merchantId, table.isActive),
  ]
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...apiSyncColumns(),
  },
  (table) => [
    index("categories_scope_sync_idx").on(
      table.merchantId,
      table.syncUpdatedAt
    ),
    index("categories_merchant_sort_idx").on(table.merchantId, table.sortOrder),
  ]
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
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
    ...apiSyncColumns(),
  },
  (table) => [
    index("assets_scope_sync_idx").on(table.merchantId, table.syncUpdatedAt),
  ]
);

export const products = sqliteTable(
  "products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    categoryId: text("category_id").references(() => categories.id),
    name: text("name").notNull(),
    priceMinorUnits: integer("price_minor_units").notNull(),
    imageAssetId: text("image_asset_id").references(() => assets.id),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...apiSyncColumns(),
  },
  (table) => [
    index("products_scope_sync_idx").on(table.merchantId, table.syncUpdatedAt),
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
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    priceMinorUnits: integer("price_minor_units"),
    isAvailable: integer("is_available", { mode: "boolean" })
      .notNull()
      .default(true),
    sortOrder: integer("sort_order"),
    ...apiSyncColumns(),
  },
  (table) => [
    index("outlet_products_scope_sync_idx").on(
      table.outletId,
      table.syncUpdatedAt
    ),
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
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    registerId: text("register_id").references(() => registers.id),
    staffId: text("staff_id").references(() => staff.id),
    orderNumber: text("order_number").notNull().unique(),
    totalMinorUnits: integer("total_minor_units").notNull(),
    paymentMethod: text("payment_method", { enum: ["cash", "qris"] }).notNull(),
    amountPaidMinorUnits: integer("amount_paid_minor_units"),
    changeAmountMinorUnits: integer("change_amount_minor_units"),
    status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
    ...apiSyncColumns(),
  },
  (table) => [
    index("orders_scope_sync_idx").on(table.outletId, table.syncUpdatedAt),
    index("orders_outlet_created_idx").on(table.outletId, table.createdAt),
  ]
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderId: text("order_id")
      .references(() => orders.id)
      .notNull(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    productId: text("product_id"),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinorUnits: integer("unit_price_minor_units").notNull(),
    originalPriceMinorUnits: integer("original_price_minor_units"),
    subtotalMinorUnits: integer("subtotal_minor_units").notNull(),
    ...apiSyncColumns(),
  },
  (table) => [
    index("order_items_scope_sync_idx").on(table.outletId, table.syncUpdatedAt),
    index("order_items_order_idx").on(table.orderId),
  ]
);

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    name: text("name").notNull(),
    sku: text("sku"),
    unit: text("unit").notNull().default("Pcs"),
    category: text("category"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...apiSyncColumns(),
  },
  (table) => [
    index("ingredients_scope_sync_idx").on(
      table.merchantId,
      table.syncUpdatedAt
    ),
    index("ingredients_merchant_active_idx").on(
      table.merchantId,
      table.isActive
    ),
  ]
);

export const inventoryStocks = sqliteTable(
  "inventory_stocks",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    targetType: text("target_type", {
      enum: ["product", "ingredient"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    onHandQty: real("on_hand_qty").notNull().default(0),
    lowStockThreshold: real("low_stock_threshold"),
    ...apiSyncColumns(),
  },
  (table) => [
    index("inventory_stocks_scope_sync_idx").on(
      table.outletId,
      table.syncUpdatedAt
    ),
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
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    ref: text("ref").notNull(),
    targetType: text("target_type", {
      enum: ["product", "ingredient"],
    }).notNull(),
    reason: text("reason").notNull(),
    countedAt: text("counted_at").notNull(),
    ...apiSyncColumns(),
  },
  (table) => [
    index("stocktakes_scope_sync_idx").on(table.outletId, table.syncUpdatedAt),
    index("stocktakes_outlet_counted_idx").on(table.outletId, table.countedAt),
  ]
);

export const stocktakeLines = sqliteTable(
  "stocktake_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    stocktakeId: text("stocktake_id")
      .notNull()
      .references(() => stocktakes.id),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    targetId: text("target_id").notNull(),
    systemQtyBefore: real("system_qty_before").notNull(),
    countedQty: real("counted_qty").notNull(),
    varianceQty: real("variance_qty").notNull(),
    ...apiSyncColumns(),
  },
  (table) => [
    index("stocktake_lines_scope_sync_idx").on(
      table.outletId,
      table.syncUpdatedAt
    ),
    index("stocktake_lines_stocktake_idx").on(table.stocktakeId),
  ]
);

export const goodsReceipts = sqliteTable(
  "goods_receipts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    ref: text("ref").notNull(),
    supplierName: text("supplier_name"),
    note: text("note"),
    receivedAt: text("received_at").notNull(),
    ...apiSyncColumns(),
  },
  (table) => [
    index("goods_receipts_scope_sync_idx").on(
      table.outletId,
      table.syncUpdatedAt
    ),
    index("goods_receipts_outlet_received_idx").on(
      table.outletId,
      table.receivedAt
    ),
  ]
);

export const goodsReceiptLines = sqliteTable(
  "goods_receipt_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    goodsReceiptId: text("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    targetId: text("target_id").notNull(),
    receivedQty: real("received_qty").notNull(),
    unitCostMinorUnits: integer("unit_cost_minor_units"),
    ...apiSyncColumns(),
  },
  (table) => [
    index("goods_receipt_lines_scope_sync_idx").on(
      table.outletId,
      table.syncUpdatedAt
    ),
    index("goods_receipt_lines_receipt_idx").on(table.goodsReceiptId),
  ]
);

export const cashShifts = sqliteTable(
  "cash_shifts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    registerId: text("register_id").references(() => registers.id),
    openedByStaffId: text("opened_by_staff_id")
      .notNull()
      .references(() => staff.id),
    openedAt: text("opened_at").notNull(),
    closedAt: text("closed_at"),
    initialFloatMinorUnits: integer("initial_float_minor_units")
      .notNull()
      .default(0),
    expectedCashMinorUnits: integer("expected_cash_minor_units")
      .notNull()
      .default(0),
    actualCashMinorUnits: integer("actual_cash_minor_units"),
    differenceMinorUnits: integer("difference_minor_units"),
    status: text("status", { enum: ["open", "closed"] }).notNull(),
    note: text("note"),
    ...apiSyncColumns(),
  },
  (table) => [
    index("cash_shifts_scope_sync_idx").on(table.outletId, table.syncUpdatedAt),
    index("cash_shifts_outlet_status_idx").on(table.outletId, table.status),
  ]
);

export const orderItemModifiers = sqliteTable(
  "order_item_modifiers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    modifierName: text("modifier_name").notNull(),
    modifierGroup: text("modifier_group"),
    priceDeltaMinorUnits: integer("price_delta_minor_units")
      .notNull()
      .default(0),
    quantity: integer("quantity").notNull().default(1),
    ...apiSyncColumns(),
  },
  (table) => [
    index("order_item_modifiers_scope_sync_idx").on(
      table.outletId,
      table.syncUpdatedAt
    ),
    index("order_item_modifiers_order_item_idx").on(table.orderItemId),
  ]
);
