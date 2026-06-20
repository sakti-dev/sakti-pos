import { apiSyncColumns } from "baresync/schema";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
