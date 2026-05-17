import * as localSchema from "@repo/database";
import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";

describe("Drizzle runtime reflection", () => {
  test("reflects all manifest tables from local schema", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);

    expect(tables.map((table) => table.tableName)).toEqual(
      syncManifest.tables.map((table) => table.tableName)
    );
  });

  test("reflects product columns without local-only isSynced", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const products = tables.find((table) => table.tableName === "products");

    expect(products?.columns.map((column) => column.propertyName)).toContain(
      "price"
    );
    expect(
      products?.columns.map((column) => column.propertyName)
    ).not.toContain("isSynced");
  });

  test("detects Drizzle boolean integer mode", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const products = tables.find((table) => table.tableName === "products");
    const isActive = products?.columns.find(
      (column) => column.propertyName === "isActive"
    );

    expect(isActive?.protoType).toBe("bool");
  });
});
