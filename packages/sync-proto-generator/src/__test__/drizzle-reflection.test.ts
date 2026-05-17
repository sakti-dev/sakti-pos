import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";

const localSchema = await import("@repo/database");
const MISSING_FIELD_PATTERN = /products.*missingField/;
const OMITTED_FIELD_PATTERN = /products.*fieldOrder.*omits/;

describe("Drizzle runtime reflection", () => {
  test("reflects all manifest tables from local schema", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);

    expect(tables.map((table) => table.tableName)).toEqual(
      syncManifest.tables.map((table) => table.tableName)
    );
  });

  test("reflects product columns with explicit minor-unit money fields", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const products = tables.find((table) => table.tableName === "products");

    expect(products?.columns.map((column) => column.propertyName)).toContain(
      "priceMinorUnits"
    );
    expect(
      products?.columns.map((column) => column.propertyName)
    ).not.toContain("isSynced");
    expect(products?.columns.map((column) => column.columnName)).toContain(
      "price_minor_units"
    );
    expect(
      products?.columns.map((column) => column.propertyName)
    ).not.toContain("price");
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
    ).toThrow(MISSING_FIELD_PATTERN);
  });

  test("throws when fieldOrder omits reflected transport columns", () => {
    expect(() =>
      reflectSyncTables(localSchema, {
        ...syncManifest,
        tables: syncManifest.tables.map((table) =>
          table.tableName === "products"
            ? { ...table, fieldOrder: ["id"] }
            : table
        ),
      })
    ).toThrow(OMITTED_FIELD_PATTERN);
  });

  test("does not retain field aliases in the reflected manifest", () => {
    const tables = reflectSyncTables(localSchema, syncManifest);
    const products = tables.find((table) => table.tableName === "products");

    expect(products?.columns.map((column) => column.protoName)).toContain(
      "price_minor_units"
    );
    expect(products?.columns.map((column) => column.protoName)).not.toContain(
      "price"
    );
  });
});
