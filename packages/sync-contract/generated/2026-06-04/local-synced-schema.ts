import { localSyncColumns } from "baresync/schema";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
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
  (table) => [index("staff_is_synced_idx").on(table.isSynced)]
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
  (table) => [index("categories_is_synced_idx").on(table.isSynced)]
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    originalFilename: text("original_filename"),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    contentHash: text("content_hash").notNull(),
    kind: text("kind").notNull(),
    width: integer("width"),
    height: integer("height"),
    status: text("status").notNull().default("pending_upload"),
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
    imageUrl: text("image_url"),
    imageAssetId: text("image_asset_id"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [index("products_is_synced_idx").on(table.isSynced)]
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
  (table) => [index("outlet_products_is_synced_idx").on(table.isSynced)]
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
  (table) => [index("orders_is_synced_idx").on(table.isSynced)]
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
  (table) => [index("order_items_is_synced_idx").on(table.isSynced)]
);
