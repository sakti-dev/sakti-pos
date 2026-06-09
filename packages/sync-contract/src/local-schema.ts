import { createSyncCursorsTable, createSyncOutboxTable } from "baresync/schema";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
    id: text("id").primaryKey(),
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

export const syncOutbox = createSyncOutboxTable();

export const syncCursors = createSyncCursorsTable();
