import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const merchants = sqliteTable("merchants", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	name: text("name").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
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

export const outlets = sqliteTable("outlets", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	merchantId: text("merchant_id")
		.notNull()
		.references(() => merchants.id),
	name: text("name").notNull(),
	address: text("address"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
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
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const staff = sqliteTable("staff", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	merchantId: text("merchant_id")
		.notNull()
		.references(() => merchants.id),
	outletId: text("outlet_id").references(() => outlets.id),
	name: text("name").notNull(),
	pin: text("pin"),
	role: text("role", { enum: ["cashier", "manager", "owner"] }).notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
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
	price: integer("price").notNull(),
	imageUrl: text("image_url"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
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
	price: integer("price"),
	isAvailable: integer("is_available", { mode: "boolean" })
		.notNull()
		.default(true),
	sortOrder: integer("sort_order"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
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
	total: integer("total").notNull(),
	paymentMethod: text("payment_method", { enum: ["cash", "qris"] }).notNull(),
	amountPaid: integer("amount_paid"),
	changeAmount: integer("change_amount"),
	status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
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
	productId: text("product_id").references(() => products.id),
	productName: text("product_name").notNull(),
	quantity: integer("quantity").notNull(),
	unitPrice: integer("unit_price").notNull(),
	originalPrice: integer("original_price"),
	subtotal: integer("subtotal").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at"),
	deletedAt: text("deleted_at"),
});
