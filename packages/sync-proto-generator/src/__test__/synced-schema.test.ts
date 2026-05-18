import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";
// biome-ignore lint/performance/noNamespaceImport: this test intentionally inspects the exported schema namespace.
import * as apiSchema from "../../../database/src/api-schema";
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

  test("api schema no longer exports syncEvents", () => {
    expect(apiSchema).not.toHaveProperty("syncEvents");
  });

  test("api synced tables include server-only syncUpdatedAt", () => {
    const apiSyncedSchema = syncProtoSchemas.apiSyncedSchema;

    for (const table of Object.values(apiSyncedSchema)) {
      const tableConfig = getTableConfig(table as never);
      const columnNames = tableConfig.columns.map((column) => column.name);

      expect(columnNames).toContain("sync_updated_at");
    }
  });

  test("local synced tables do not include server-only syncUpdatedAt", () => {
    const localSyncedSchema = syncProtoSchemas.localSyncedSchema;

    for (const table of Object.values(localSyncedSchema)) {
      const tableConfig = getTableConfig(table as never);
      const columnNames = tableConfig.columns.map((column) => column.name);

      expect(columnNames).not.toContain("sync_updated_at");
    }
  });

  test("orderItems.updatedAt is non-null in both synced schemas", () => {
    const schemas = [
      syncProtoSchemas.apiSyncedSchema,
      syncProtoSchemas.localSyncedSchema,
    ];

    for (const schema of schemas) {
      const orderItems = Object.values(schema).find((value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        return getTableConfig(value as never).name === "order_items";
      });

      expect(orderItems).toBeDefined();

      const updatedAt = getTableConfig(orderItems as never).columns.find(
        (column) => column.name === "updated_at"
      );

      expect(updatedAt?.notNull).toBe(true);
    }
  });
});
