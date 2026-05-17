import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderApiSyncMappers } from "../ts-mapper-writer";

const localSchema = await import("@repo/database");

describe("TypeScript API sync mapper writer", () => {
  test("renders product money alias from DB field to proto field", () => {
    const source = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain(
      "priceMinorUnits: int64Field(row.price ?? row.priceMinorUnits"
    );
  });

  test("renders typed decode for all sync tables", () => {
    const source = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain("if (request.staff)");
    expect(source).toContain("changes.staff = {");
    expect(source).not.toContain("JSON.parse");
  });

  test("renders typed encode for all sync tables", () => {
    const source = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain(
      "staff: mapTableChanges(result.staff, staffRowToProto)"
    );
  });

  test("encodes pull responses from service keys, not ts-proto keys", () => {
    const source = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain(
      "orderItems: mapTableChanges(result.order_items, orderItemRowToProto)"
    );
    expect(source).toContain(
      "outletProducts: mapTableChanges(result.outlet_products, outletProductRowToProto)"
    );
    expect(source).not.toContain("result.orderItems");
    expect(source).not.toContain("result.outletProducts");
  });

  test("decodes push requests using ts-proto field names into service keys", () => {
    const source = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(source).toContain("if (request.orderItems) {");
    expect(source).toContain("changes.order_items = {");
    expect(source).toContain("if (request.outletProducts) {");
    expect(source).toContain("changes.outlet_products = {");
  });

  test("renders row to proto functions for every sync table", () => {
    const source = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    for (const table of syncManifest.tables) {
      const funcName =
        table.rowMessageName.charAt(0).toLowerCase() +
        table.rowMessageName.slice(1) +
        "ToProto";
      expect(source).toContain(`function ${funcName}`);
    }
  });
});
