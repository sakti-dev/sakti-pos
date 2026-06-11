import { env } from "cloudflare:workers";
import {
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
  syncBatchRequests,
  userMerchants,
  userSessions,
  users,
} from "@sync-contract/api-schema";
import { drizzle } from "drizzle-orm/libsql";

const schema = {
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
  syncBatchRequests,
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
