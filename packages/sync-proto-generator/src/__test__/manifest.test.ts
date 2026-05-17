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
});
