import { describe, expect, test } from "vitest";
import {
  decodeGeneratedPushBatchRequest,
  encodeGeneratedPullBatchResponse,
} from "../../../../apps/api/src/sync/protobuf.generated";
import {
  syncGeneratorConfig,
  syncProtoSchemas,
} from "../../../protobuf/sync-proto.config";
import { reflectSyncTables } from "../drizzle-reflection";
import { renderApiSyncMappers } from "../ts-mapper-writer";

describe("generated API mapper runtime logic", () => {
  const tables = reflectSyncTables({
    config: syncGeneratorConfig,
    schemaModule: syncProtoSchemas.localSyncedSchema,
  });
  const source = renderApiSyncMappers(tables);

  test("generated source matches runtime generated mapper", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const generatedPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
      "apps",
      "api",
      "src",
      "sync",
      "protobuf.generated.ts"
    );
    const saved = readFileSync(generatedPath, "utf8");

    expect(saved).toBe(source);
  });

  test("generated mapper maps product DB fields to protobuf money fields", () => {
    const result = encodeGeneratedPullBatchResponse({
      cursor: "",
      products: {
        changedRows: [
          {
            categoryId: "cat-1",
            id: "product-1",
            imageAssetId: "asset-1",
            imageUrl: "https://example.test/product.jpg",
            isActive: true,
            merchantId: "merchant-1",
            name: "Kopi",
            priceMinorUnits: 15_000,
            sortOrder: 3,
            createdAt: "2026-05-17T00:00:00.000Z",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(result.products?.changedRows[0]).toMatchObject({
      categoryId: "cat-1",
      id: "product-1",
      imageAssetId: "asset-1",
      imageUrl: "https://example.test/product.jpg",
      isActive: true,
      merchantId: "merchant-1",
      name: "Kopi",
      priceMinorUnits: 15_000n,
      sortOrder: 3n,
    });
  });

  test("generated mapper maps order item DB fields to protobuf money fields", () => {
    const result = encodeGeneratedPullBatchResponse({
      cursor: "",
      order_items: {
        changedRows: [
          {
            id: "item-1",
            orderId: "order-1",
            originalPriceMinorUnits: 20_000,
            outletId: "outlet-1",
            productId: "product-1",
            productName: "Kopi",
            quantity: 2,
            subtotalMinorUnits: 30_000,
            unitPriceMinorUnits: 15_000,
            createdAt: "2026-05-17T00:00:00.000Z",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(result.order_items?.changedRows[0]).toMatchObject({
      originalPriceMinorUnits: 20_000n,
      quantity: 2n,
      subtotalMinorUnits: 30_000n,
      unitPriceMinorUnits: 15_000n,
    });
  });

  test("generated mapper maps order DB fields to protobuf money fields", () => {
    const result = encodeGeneratedPullBatchResponse({
      cursor: "",
      orders: {
        changedRows: [
          {
            amountPaidMinorUnits: 20_000,
            changeAmountMinorUnits: 5000,
            id: "order-1",
            orderNumber: "ORD-001",
            outletId: "outlet-1",
            paymentMethod: "cash",
            registerId: "reg-1",
            staffId: "staff-1",
            status: "paid",
            totalMinorUnits: 25_000,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(result.orders?.changedRows[0]).toMatchObject({
      amountPaidMinorUnits: 20_000n,
      changeAmountMinorUnits: 5_000n,
      id: "order-1",
      totalMinorUnits: 25_000n,
    });
  });

  test("generated mapper maps outlet product DB fields to protobuf money fields", () => {
    const result = encodeGeneratedPullBatchResponse({
      cursor: "",
      outlet_products: {
        changedRows: [
          {
            id: "op-1",
            isAvailable: true,
            outletId: "outlet-1",
            priceMinorUnits: 15_000,
            productId: "product-1",
            sortOrder: 1,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(result.outlet_products?.changedRows[0]).toMatchObject({
      id: "op-1",
      isAvailable: true,
      priceMinorUnits: 15_000n,
      sortOrder: 1n,
    });
  });

  test("generated decode spreads typed rows for all tables", () => {
    const result = decodeGeneratedPushBatchRequest({
      products: {
        changedRows: [{ id: "p-1", name: "Kopi", priceMinorUnits: 15000n }],
        deletedIds: ["p-del"],
      },
    });

    expect(result.products.changedRows[0]).toEqual({
      id: "p-1",
      name: "Kopi",
      priceMinorUnits: 15000n,
    });
    expect(result.products.deletedIds).toEqual(["p-del"]);
  });
});

function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
