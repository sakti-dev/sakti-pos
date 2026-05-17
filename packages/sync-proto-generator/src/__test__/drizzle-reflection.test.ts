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

  test("throws when fieldOrder references a missing property", () => {
    expect(() =>
      reflectSyncTables(localSchema, {
        ...syncManifest,
        tables: syncManifest.tables.map((table) =>
          table.tableName === "products"
            ? { ...table, fieldOrder: ["id", "missingField"] }
            : table
        ),
      })
    ).toThrow(/products.*missingField/);
  });

  test("throws when fieldOrder omits reflected transport columns", () => {
    expect(() =>
      reflectSyncTables(localSchema, {
        ...syncManifest,
        tables: syncManifest.tables.map((table) =>
          table.tableName === "products" ? { ...table, fieldOrder: ["id"] } : table
        ),
      })
    ).toThrow(/products.*fieldOrder.*omits/);
  });

  test("throws when field alias references a missing property", () => {
    expect(() =>
      reflectSyncTables(localSchema, {
        ...syncManifest,
        tables: syncManifest.tables.map((table) =>
          table.tableName === "products"
            ? {
                ...table,
                fieldAliases: {
                  ...table.fieldAliases,
                  missingField: { protoName: "missing_field", protoType: "int64" },
                },
              }
            : table
        ),
      })
    ).toThrow(/products.*missingField/);
  });
});
