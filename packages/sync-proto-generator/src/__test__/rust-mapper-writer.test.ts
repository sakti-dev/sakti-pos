import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderRustSyncMappers } from "../rust-mapper-writer";

const localSchema = await import("@repo/database");
const tables = reflectSyncTables(localSchema, syncManifest);

describe("Rust POS sync mapper writer", () => {
  test("renders product mapper from serde_json value to ProductRow", () => {
    const source = renderRustSyncMappers(syncManifest, tables);

    expect(source).toContain(
      "fn product_row_from_value(row: &Value) -> ProductRow"
    );
    expect(source).toContain(
      'price_minor_units: value_to_i64(row, &["priceMinorUnits", "price"])'
    );
  });

  test("renders typed changes builders for every sync table", () => {
    const source = renderRustSyncMappers(syncManifest, tables);

    expect(source).toContain("pub(super) fn build_staff_changes");
    expect(source).toContain("StaffChanges {");
    expect(source).not.toContain("build_json_table_changes");
  });

  test("renders decode pull batch response for every sync table", () => {
    const source = renderRustSyncMappers(syncManifest, tables);

    expect(source).toContain("pub(super) fn decode_pull_batch_response_tables");
    expect(source).toContain('"merchants".to_string()');
    expect(source).toContain('"order_items".to_string()');
  });

  test("renders build push request with typed fields for all tables", () => {
    const source = renderRustSyncMappers(syncManifest, tables);

    expect(source).toContain("pub(super) fn build_sync_push_batch_request(");
    expect(source).toContain("merchants: Option<MerchantChanges>");
    expect(source).toContain("staff: Option<StaffChanges>");
  });

  test("renders row-to-value mappers for pull direction", () => {
    const source = renderRustSyncMappers(syncManifest, tables);

    expect(source).toContain(
      "fn product_row_to_value(row: &ProductRow) -> Value"
    );
    expect(source).toContain('"price": row.price_minor_units');
  });

  test("renders Rust snake_case function names for multi-word rows", () => {
    const source = renderRustSyncMappers(syncManifest, tables);

    expect(source).toContain("fn order_item_row_from_value(row: &Value)");
    expect(source).toContain("fn outlet_product_row_from_value(row: &Value)");
    expect(source).not.toContain("fn orderItem_row_from_value");
    expect(source).not.toContain("fn outletProduct_row_from_value");
  });

  test("renders Prost snake_case fields for multi-word table changes", () => {
    const source = renderRustSyncMappers(syncManifest, tables);

    expect(source).toContain("order_items: Option<OrderItemChanges>");
    expect(source).toContain("outlet_products: Option<OutletProductChanges>");
    expect(source).toContain("response.order_items");
    expect(source).toContain("response.outlet_products");
    expect(source).not.toContain("orderItems: Option<OrderItemChanges>");
    expect(source).not.toContain("response.orderItems");
  });
});
