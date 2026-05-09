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
	name: text("name").notNull(),
	address: text("address"),
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

export const products = sqliteTable("products", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	merchantId: text("merchant_id").notNull(),
	categoryId: text("category_id"),
	name: text("name").notNull(),
	price: integer("price").notNull(),
	imageUrl: text("image_url"),
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
	price: integer("price"),
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
	total: integer("total").notNull(),
	paymentMethod: text("payment_method", { enum: ["cash", "qris"] }).notNull(),
	amountPaid: integer("amount_paid"),
	changeAmount: integer("change_amount"),
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
	unitPrice: integer("unit_price").notNull(),
	originalPrice: integer("original_price"),
	subtotal: integer("subtotal").notNull(),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	deletedAt: text("deleted_at"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});
