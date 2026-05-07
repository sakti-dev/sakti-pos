import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shops = sqliteTable("shops", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const syncMeta = sqliteTable("sync_meta", {
	tableName: text("table_name").notNull(),
	shopId: text("shop_id").notNull(),
	lastSyncAt: text("last_sync_at").notNull(),
});

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull().unique(),
	pin: text("pin").notNull(),
	role: text("role", { enum: ["owner", "manager", "cashier"] }).notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const categories = sqliteTable("categories", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull().unique(),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	shopId: text("shop_id"),
	cloudId: text("cloud_id"),
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
	id: integer("id").primaryKey({ autoIncrement: true }),
	categoryId: integer("category_id").references(() => categories.id),
	name: text("name").notNull().unique(),
	price: integer("price").notNull(),
	imageUrl: text("image_url"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	sortOrder: integer("sort_order").notNull().default(0),
	shopId: text("shop_id"),
	cloudId: text("cloud_id"),
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
	id: integer("id").primaryKey({ autoIncrement: true }),
	orderNumber: text("order_number").notNull().unique(),
	userId: integer("user_id").references(() => users.id),
	total: integer("total").notNull(),
	paymentMethod: text("payment_method", { enum: ["cash", "qris"] }).notNull(),
	amountPaid: integer("amount_paid"),
	changeAmount: integer("change_amount"),
	status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
	shopId: text("shop_id"),
	cloudId: text("cloud_id"),
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
	id: integer("id").primaryKey({ autoIncrement: true }),
	orderId: integer("order_id")
		.references(() => orders.id)
		.notNull(),
	productId: integer("product_id").references(() => products.id),
	productName: text("product_name").notNull(),
	quantity: integer("quantity").notNull(),
	unitPrice: integer("unit_price").notNull(),
	subtotal: integer("subtotal").notNull(),
	shopId: text("shop_id"),
	cloudId: text("cloud_id"),
	deletedAt: text("deleted_at"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});
