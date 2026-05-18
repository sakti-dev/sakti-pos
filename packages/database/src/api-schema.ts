import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const merchants = sqliteTable("merchants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const userMerchants = sqliteTable("user_merchants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: text("user_id")
    .notNull()
    .references((): SQLiteColumn => users.id),
  merchantId: text("merchant_id")
    .notNull()
    .references((): SQLiteColumn => merchants.id),
  role: text("role", { enum: ["owner", "manager"] }).notNull(),
  joinedAt: text("joined_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  passwordHash: text("password_hash"),
  googleId: text("google_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const userSessions = sqliteTable("user_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

export const syncBatchRequests = sqliteTable(
  "sync_batch_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: text("client_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: text("response_json").notNull(),
    latestEventId: integer("latest_event_id").notNull().default(0),
    serverTime: text("server_time").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("sync_batch_requests_client_id_idempotency_key_unique").on(
      table.clientId,
      table.idempotencyKey
    ),
  ]
);

export const outlets = sqliteTable("outlets", {
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
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const registers = sqliteTable("registers", {
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
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const staff = sqliteTable("staff", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  merchantId: text("merchant_id")
    .notNull()
    .references(() => merchants.id),
  cloudUserId: text("cloud_user_id").references(() => users.id),
  outletId: text("outlet_id").references(() => outlets.id),
  name: text("name").notNull(),
  pin: text("pin"),
  role: text("role", { enum: ["cashier", "manager", "owner"] }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const categories = sqliteTable("categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  merchantId: text("merchant_id")
    .notNull()
    .references(() => merchants.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const assets = sqliteTable("assets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  merchantId: text("merchant_id")
    .notNull()
    .references(() => merchants.id),
  objectKey: text("object_key").notNull().unique(),
  originalFilename: text("original_filename"),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  contentHash: text("content_hash").notNull(),
  kind: text("kind").notNull(),
  width: integer("width"),
  height: integer("height"),
  status: text("status", {
    enum: ["pending_upload", "ready", "failed"],
  }).notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const products = sqliteTable("products", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  merchantId: text("merchant_id")
    .notNull()
    .references(() => merchants.id),
  categoryId: text("category_id").references(() => categories.id),
  name: text("name").notNull(),
  priceMinorUnits: integer("price_minor_units").notNull(),
  imageUrl: text("image_url"),
  imageAssetId: text("image_asset_id").references(() => assets.id),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const outletProducts = sqliteTable("outlet_products", {
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
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const orders = sqliteTable("orders", {
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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});

export const orderItems = sqliteTable("order_items", {
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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
});
