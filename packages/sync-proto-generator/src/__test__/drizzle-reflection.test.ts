import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";
import {
  syncGeneratorConfig,
  syncProtoSchemas,
} from "../../../protobuf/sync-proto.config";
import { reflectSyncTables } from "../drizzle-reflection";

const syncedSchema = syncProtoSchemas.localSyncedSchema;

function getTableNames() {
  return reflectSyncTables({
    config: syncGeneratorConfig,
    schemaModule: syncProtoSchemas.localSyncedSchema,
  }).map((table) => table.tableName);
}

describe("Drizzle runtime reflection", () => {
  test("reflects all synced schema tables", () => {
    expect(getTableNames()).toEqual([
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
    ]);
  });

  test("derives table and message names mechanically from SQLite table names", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const orderItems = tables.find(
      (table) => table.tableName === "order_items"
    );
    const outletProducts = tables.find(
      (table) => table.tableName === "outlet_products"
    );

    expect(orderItems).toMatchObject({
      changeMessageName: "order_items_changes",
      protoFieldName: "order_items",
      rowMessageName: "order_items_row",
      rustFieldName: "order_items",
      serviceKey: "order_items",
      tsProtoFieldName: "order_items",
    });
    expect(outletProducts).toMatchObject({
      changeMessageName: "outlet_products_changes",
      protoFieldName: "outlet_products",
      rowMessageName: "outlet_products_row",
      rustFieldName: "outlet_products",
      serviceKey: "outlet_products",
      tsProtoFieldName: "outlet_products",
    });
  });

  test("orders reflected columns in Drizzle column order", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const orderItems = tables.find(
      (table) => table.tableName === "order_items"
    );

    expect(orderItems?.columns.map((column) => column.propertyName)).toEqual([
      "id",
      "orderId",
      "outletId",
      "productId",
      "productName",
      "quantity",
      "unitPriceMinorUnits",
      "originalPriceMinorUnits",
      "subtotalMinorUnits",
      "updatedAt",
      "deletedAt",
      "createdAt",
    ]);
  });

  test("excludes configured local-only columns", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const products = tables.find((table) => table.tableName === "products");

    expect(
      products?.columns.map((column) => column.propertyName)
    ).not.toContain("isSynced");
  });

  test("reflects Drizzle property aliases instead of SQLite column names", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const products = tables.find((table) => table.tableName === "products");

    expect(products?.columns.map((column) => column.propertyName)).toContain(
      "priceMinorUnits"
    );
    expect(products?.columns.map((column) => column.columnName)).toContain(
      "price_minor_units"
    );
    expect(products?.columns.map((column) => column.protoName)).toContain(
      "priceMinorUnits"
    );
  });

  test("does not require the sync manifest", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });

    expect(tables).toHaveLength(10);
  });

  test("captures column metadata from getTableConfig", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const products = tables.find((table) => table.tableName === "products");
    const table = Object.values(syncedSchema).find(
      (value) =>
        value &&
        typeof value === "object" &&
        getTableConfig(value as never).name === "products"
    );

    expect(table).toBeDefined();
    expect(products?.columns.map((column) => column.columnName)).toEqual(
      getTableConfig(table as never)
        .columns.filter((column) => column.name !== "is_synced")
        .map((column) => column.name)
    );
  });
});
