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
  syncCursors,
  syncMeta,
  syncOutbox,
} from "@repo/database";
import { invoke } from "@tauri-apps/api/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { createLogger } from "~/lib/logger";

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
  syncCursors,
  syncMeta,
  syncOutbox,
};

const dbLogger = createLogger({ module: "db" });

interface SqlRow {
  columns: string[];
  values: unknown[];
}

export const db = drizzle(
  async (sql, params, method) => {
    try {
      const rows = await invoke<SqlRow[]>("run_sql", {
        query: { sql, params, method },
      });

      if (rows.length === 0 && method === "get") {
        return {} as { rows: unknown[] };
      }

      return method === "get"
        ? { rows: rows[0]?.values ?? [] }
        : { rows: rows.map((r) => r.values) };
    } catch (err) {
      dbLogger.error("query_failed", err, { method, params, sql });
      throw err;
    }
  },
  { schema }
);

export type DatabaseType = typeof db;
