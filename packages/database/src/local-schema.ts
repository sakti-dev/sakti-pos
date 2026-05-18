import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const merchants = sqliteTable("merchants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const outlets = sqliteTable("outlets", {
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
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const registers = sqliteTable("registers", {
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
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const staff = sqliteTable("staff", {
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
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const syncMeta = sqliteTable("sync_meta", {
  tableName: text("table_name").notNull(),
  outletId: text("outlet_id").notNull(),
  lastSyncAt: text("last_sync_at").notNull(),
});

export const syncOutbox = sqliteTable("sync_outbox", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  operation: text("operation", {
    enum: ["insert", "update", "delete"],
  }).notNull(),
  scopeType: text("scope_type", { enum: ["merchant", "outlet"] }).notNull(),
  scopeId: text("scope_id").notNull(),
  changedAt: text("changed_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  syncedAt: text("synced_at"),
});

export const syncClientIdentity = sqliteTable("sync_client_identity", {
  id: integer("id").primaryKey(),
  clientId: text("client_id").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const syncCursors = sqliteTable("sync_cursors", {
  scopeType: text("scope_type", { enum: ["merchant", "outlet"] }).notNull(),
  scopeId: text("scope_id").notNull(),
  lastServerEventId: integer("last_server_event_id").notNull().default(0),
  lastServerWatermark: text("last_server_watermark"),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const categories = sqliteTable("categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const assets = sqliteTable("assets", {
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
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const localAssetCache = sqliteTable("local_asset_cache", {
  assetId: text("asset_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  objectKey: text("object_key").notNull().unique(),
  localPath: text("local_path").notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("pending_upload"),
  uploadAttempts: integer("upload_attempts").notNull().default(0),
  downloadAttempts: integer("download_attempts").notNull().default(0),
  lastError: text("last_error"),
  cachedAt: text("cached_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const pendingProductPhotoJobs = sqliteTable(
  "pending_product_photo_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    productId: text("product_id").notNull().unique(),
    merchantId: text("merchant_id").notNull(),
    tempPath: text("temp_path").notNull(),
    originalFilename: text("original_filename").notNull(),
    kind: text("kind").notNull().default("product_photo"),
    previewMimeType: text("preview_mime_type"),
    previewBase64: text("preview_base64"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  }
);

export const pendingAssetProcessingJobs = sqliteTable(
  "pending_asset_processing_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id").notNull(),
    sourcePath: text("source_path").notNull(),
    originalFilename: text("original_filename").notNull(),
    sourceMimeType: text("source_mime_type"),
    processingKind: text("processing_kind").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    attachmentField: text("attachment_field").notNull(),
    previewPath: text("preview_path"),
    previewMimeType: text("preview_mime_type"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  }
);

export const products = sqliteTable("products", {
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
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const outletProducts = sqliteTable("outlet_products", {
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
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const orders = sqliteTable("orders", {
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
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const orderItems = sqliteTable("order_items", {
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
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
