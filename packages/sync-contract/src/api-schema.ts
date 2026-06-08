import { createSyncBatchRequestsTable } from "baresync/schema";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import { merchants } from "./api-synced-schema";

export const userMerchants = sqliteTable("user_merchants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  merchantId: text("merchant_id")
    .notNull()
    .references(() => merchants.id),
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

export const syncBatchRequests = createSyncBatchRequestsTable();

/* biome-ignore lint/performance/noBarrelFile: keep API synced schema exports centralized for generator imports */
export {
  assets,
  categories,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
} from "./api-synced-schema";
