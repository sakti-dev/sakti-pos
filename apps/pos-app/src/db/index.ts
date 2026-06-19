/** biome-ignore-all lint/performance/noNamespaceImport: re-exports namespace for TABLE registry */
import * as localSchema from "@sync-contract/local-schema";
import * as localSyncedSchema from "@sync-contract/local-synced-schema";
import { invoke } from "@tauri-apps/api/core";
import { createTauriDrizzleDatabase } from "baresync/db";
import { createLogger } from "~/lib/utils";

export const TABLE = {
  ...localSchema,
  ...localSyncedSchema,
};

const dbLogger = createLogger({ domain: "DB", module: "db" });

export const db = createTauriDrizzleDatabase({
  invoke,
  schema: TABLE,
  onQueryError: (error, query) => {
    dbLogger.error("query_failed", error, {
      method: query.method,
      params: query.params,
      sql: query.sql,
    });
  },
});
