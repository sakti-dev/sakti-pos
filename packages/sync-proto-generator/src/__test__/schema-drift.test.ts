import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";
import { compareSyncedSchemas } from "../schema-drift";

const apiProducts = sqliteTable("products", {
  id: text("id").primaryKey(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  name: text("name").notNull(),
  priceMinorUnits: integer("price_minor_units").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const apiOrders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  outletId: text("outlet_id").notNull(),
});

const localProductsWithIsSynced = sqliteTable("products", {
  id: text("id").primaryKey(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull(),
  name: text("name").notNull(),
  priceMinorUnits: integer("price_minor_units").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const localProductsMissingColumn = sqliteTable("products", {
  id: text("id").primaryKey(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  name: text("name").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const localProductsTypeMismatch = sqliteTable("products", {
  id: text("id").primaryKey(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  name: text("name").notNull(),
  priceMinorUnits: text("price_minor_units").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const localProductsNullabilityMismatch = sqliteTable("products", {
  id: text("id").primaryKey(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  name: text("name"),
  priceMinorUnits: integer("price_minor_units").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const localProductsPrimaryKeyMismatch = sqliteTable("products", {
  id: text("id").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  name: text("name").notNull(),
  priceMinorUnits: integer("price_minor_units").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const localProductsColumnNameMismatch = sqliteTable("products", {
  id: text("id").primaryKey(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  name: text("product_name").notNull(),
  priceMinorUnits: integer("price_minor_units").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const localProductsPropertyNameMismatch = sqliteTable("products", {
  id: text("id").primaryKey(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  name: text("name").notNull(),
  price_minor_units: integer("price_minor_units").notNull(),
  updatedAt: text("updated_at").notNull(),
});

describe("schema drift detector", () => {
  test("reports missing local column", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts],
      localTables: [localProductsMissingColumn],
      localOnlyColumns: ["isSynced"],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: "missing_local_column",
        columnName: "price_minor_units",
        tableName: "products",
      }),
    ]);
  });

  test("reports missing API column", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts],
      localTables: [localProductsWithIsSynced],
      localOnlyColumns: [],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: "missing_api_column",
        columnName: "is_synced",
        tableName: "products",
      }),
    ]);
  });

  test("reports SQLite column name mismatch", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts],
      localTables: [localProductsColumnNameMismatch],
      localOnlyColumns: [],
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "missing_local_column",
      "missing_api_column",
    ]);
    expect(issues.map((issue) => issue.columnName)).toEqual([
      "name",
      "product_name",
    ]);
  });

  test("reports scalar type mismatch", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts],
      localTables: [localProductsTypeMismatch],
      localOnlyColumns: [],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: "type_mismatch",
        columnName: "price_minor_units",
        tableName: "products",
      }),
    ]);
  });

  test("reports Drizzle property name mismatch", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts],
      localTables: [localProductsPropertyNameMismatch],
      localOnlyColumns: [],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: "property_name_mismatch",
        columnName: "price_minor_units",
        tableName: "products",
      }),
    ]);
  });

  test("reports nullability mismatch", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts],
      localTables: [localProductsNullabilityMismatch],
      localOnlyColumns: [],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: "nullability_mismatch",
        columnName: "name",
        tableName: "products",
      }),
    ]);
  });

  test("reports primary key mismatch", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts],
      localTables: [localProductsPrimaryKeyMismatch],
      localOnlyColumns: [],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: "primary_key_mismatch",
        columnName: "id",
        tableName: "products",
      }),
    ]);
  });

  test("ignores configured local-only columns", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts],
      localTables: [localProductsWithIsSynced],
      localOnlyColumns: ["isSynced"],
    });

    expect(issues).toEqual([]);
  });

  test("passes when synced columns match", () => {
    const issues = compareSyncedSchemas({
      apiTables: [apiProducts, apiOrders],
      localTables: [
        sqliteTable("products", {
          id: text("id").primaryKey(),
          isActive: integer("is_active", { mode: "boolean" }).notNull(),
          name: text("name").notNull(),
          priceMinorUnits: integer("price_minor_units").notNull(),
          updatedAt: text("updated_at").notNull(),
        }),
        sqliteTable("orders", {
          id: text("id").primaryKey(),
          outletId: text("outlet_id").notNull(),
        }),
      ],
      localOnlyColumns: [],
    });

    expect(issues).toEqual([]);
  });
});
