import { env } from "cloudflare:workers";
import {
  categories,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
  syncEvents,
  userMerchants,
  userSessions,
  users,
} from "@repo/database/api-schema";
import { drizzle } from "drizzle-orm/libsql";

const schema = {
  categories,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
  syncEvents,
  userMerchants,
  userSessions,
  users,
};

export const db = drizzle({
  connection: {
    url: env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080",
    authToken: env.TURSO_AUTH_TOKEN || undefined,
  },
  schema,
});
