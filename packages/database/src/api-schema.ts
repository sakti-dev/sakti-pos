import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shops = sqliteTable("shops", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	ownerId: text("owner_id")
		.notNull()
		.references((): SQLiteColumn => users.id),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	shopId: text("shop_id").references((): SQLiteColumn => shops.id),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	role: text("role", { enum: ["owner", "manager", "cashier"] }).notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	passwordHash: text("password_hash"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const userSessions = sqliteTable("user_session", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	expiresAt: integer("expires_at").notNull(),
});

export const categories = sqliteTable("categories", {
	id: text("id").primaryKey(),
	shopId: text("shop_id")
		.notNull()
		.references(() => shops.id),
	name: text("name").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
});

export const products = sqliteTable("products", {
	id: text("id").primaryKey(),
	shopId: text("shop_id")
		.notNull()
		.references(() => shops.id),
	categoryId: text("category_id").references(() => categories.id),
	name: text("name").notNull(),
	price: integer("price").notNull(),
	imageUrl: text("image_url"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
});

export const orders = sqliteTable("orders", {
	id: text("id").primaryKey(),
	shopId: text("shop_id")
		.notNull()
		.references(() => shops.id),
	orderNumber: text("order_number").notNull().unique(),
	userId: text("user_id").references(() => users.id),
	total: integer("total").notNull(),
	paymentMethod: text("payment_method", {
		enum: ["cash", "qris"],
	}).notNull(),
	amountPaid: integer("amount_paid"),
	changeAmount: integer("change_amount"),
	status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
});

export const orderItems = sqliteTable("order_items", {
	id: text("id").primaryKey(),
	shopId: text("shop_id")
		.notNull()
		.references(() => shops.id),
	orderId: text("order_id")
		.references(() => orders.id)
		.notNull(),
	productId: text("product_id").references(() => products.id),
	productName: text("product_name").notNull(),
	quantity: integer("quantity").notNull(),
	unitPrice: integer("unit_price").notNull(),
	subtotal: integer("subtotal").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at"),
	deletedAt: text("deleted_at"),
});
