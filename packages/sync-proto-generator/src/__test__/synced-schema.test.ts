import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";
import { syncProtoSchemas } from "../../../protobuf/sync-proto.config";

const EXPECTED_SYNCED_TABLES = [
  "assets",
  "categories",
  "merchants",
  "order_items",
  "orders",
  "outlet_products",
  "outlets",
  "products",
  "registers",
  "staff",
];

function getTableNames(schemaModule: Record<string, unknown>): string[] {
  return Object.values(schemaModule)
    .filter((value) => {
      if (!value || typeof value !== "object") {
        return false;
      }

      try {
        getTableConfig(value as never);
        return true;
      } catch {
        return false;
      }
    })
    .map((table) => getTableConfig(table as never).name)
    .sort();
}

describe("synced schema exports", () => {
  test("local synced schema exports only runtime synced tables", () => {
    const syncedSchema = syncProtoSchemas.localSyncedSchema;

    expect(getTableNames(syncedSchema)).toEqual(
      [...EXPECTED_SYNCED_TABLES].sort()
    );
  });

  test("api synced schema exports the same runtime synced tables", () => {
    const syncedSchema = syncProtoSchemas.localSyncedSchema;
    const apiSyncedSchema = syncProtoSchemas.apiSyncedSchema;

    expect(getTableNames(apiSyncedSchema)).toEqual(getTableNames(syncedSchema));
  });
});
