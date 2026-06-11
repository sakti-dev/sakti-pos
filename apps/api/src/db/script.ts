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
  userMerchants,
  userSessions,
  users,
} from "@sync-contract/api-schema";
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
  userMerchants,
  userSessions,
  users,
};

export const scriptDb = drizzle({
  connection: {
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    url: process.env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080",
  },
  schema,
});
