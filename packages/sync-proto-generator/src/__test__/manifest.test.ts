import { describe, expect, test } from "vitest";
import { syncManifest } from "../manifest";

describe("sync manifest", () => {
  test("contains exactly the runtime sync tables", () => {
    expect(syncManifest.tables.map((table) => table.tableName)).toEqual([
      "merchants",
      "outlets",
      "registers",
      "categories",
      "assets",
      "products",
      "orders",
      "order_items",
      "outlet_products",
      "staff",
    ]);
  });

  test("excludes local-only columns globally", () => {
    expect(syncManifest.globalExcludeColumns).toEqual(["isSynced"]);
  });

  test("preserves current hot-table message names", () => {
    expect(
      syncManifest.tables
        .filter((table) => table.currentlyManualTyped)
        .map((table) => table.rowMessageName)
    ).toEqual(["ProductRow", "OrderRow", "OrderItemRow", "OutletProductRow"]);
  });

  test("declares separate runtime names for multi-word sync tables", () => {
    const orderItems = syncManifest.tables.find(
      (table) => table.tableName === "order_items"
    );
    const outletProducts = syncManifest.tables.find(
      (table) => table.tableName === "outlet_products"
    );

    expect(orderItems).toMatchObject({
      protoFieldName: "order_items",
      rustFieldName: "order_items",
      serviceKey: "order_items",
      tsProtoFieldName: "orderItems",
    });
    expect(outletProducts).toMatchObject({
      protoFieldName: "outlet_products",
      rustFieldName: "outlet_products",
      serviceKey: "outlet_products",
      tsProtoFieldName: "outletProducts",
    });
  });

  test("declares matching runtime names for single-word sync tables", () => {
    const products = syncManifest.tables.find(
      (table) => table.tableName === "products"
    );
    const merchants = syncManifest.tables.find(
      (table) => table.tableName === "merchants"
    );

    expect(products).toMatchObject({
      protoFieldName: "products",
      rustFieldName: "products",
      serviceKey: "products",
      tsProtoFieldName: "products",
    });
    expect(merchants).toMatchObject({
      protoFieldName: "merchants",
      rustFieldName: "merchants",
      serviceKey: "merchants",
      tsProtoFieldName: "merchants",
    });
  });
});
