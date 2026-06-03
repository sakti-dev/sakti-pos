import {
  assets,
  categories,
  localAssetCache,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  pendingAssetProcessingJobs,
  pendingProductPhotoJobs,
  products,
  registers,
  staff,
  syncCursors,
  syncOutbox,
} from "@repo/database";
import { invoke } from "@tauri-apps/api/core";
import { createTauriDrizzleDatabase } from "baresync/db";
import { createLogger } from "~/lib/logger";

const schema = {
  assets,
  categories,
  localAssetCache,
  pendingAssetProcessingJobs,
  pendingProductPhotoJobs,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
  syncCursors,
  syncOutbox,
};

const dbLogger = createLogger({ domain: "DB", module: "db" });

export const db = createTauriDrizzleDatabase({
  invoke,
  schema,
  onQueryError: (error, query) => {
    dbLogger.error("query_failed", error, {
      method: query.method,
      params: query.params,
      sql: query.sql,
    });
  },
});
