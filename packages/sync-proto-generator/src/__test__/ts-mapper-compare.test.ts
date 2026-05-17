import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderApiSyncMappers } from "../ts-mapper-writer";

const localSchema = await import("@repo/database");

describe("generated API mapper comparison with manual hot-table logic", () => {
  const tables = reflectSyncTables(localSchema, syncManifest);
  const source = renderApiSyncMappers(syncManifest, tables);

  test("generated source matches saved comparison artifact", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const generatedPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "generated",
      "api-sync-mappers.ts"
    );
    const saved = readFileSync(generatedPath, "utf8");

    expect(saved).toBe(source);
  });

  test("generated mapper maps product DB fields to protobuf money fields", async () => {
    const mod = await import("../../generated/api-sync-mappers");

    const result = mod.encodeGeneratedPullBatchResponse({
      latestEventId: 12,
      needsFullResync: false,
      products: {
        created: [
          {
            categoryId: "cat-1",
            id: "product-1",
            imageAssetId: "asset-1",
            imageUrl: "https://example.test/product.jpg",
            isActive: true,
            merchantId: "merchant-1",
            name: "Kopi",
            price: 15_000,
            sortOrder: 3,
            createdAt: "2026-05-17T00:00:00.000Z",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
        updated: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(result.products?.created[0]).toMatchObject({
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

  test("generated mapper maps order item DB fields to protobuf money fields", async () => {
    const mod = await import("../../generated/api-sync-mappers");

    const result = mod.encodeGeneratedPullBatchResponse({
      latestEventId: 12,
      needsFullResync: false,
      orderItems: {
        created: [
          {
            id: "item-1",
            orderId: "order-1",
            originalPrice: 20_000,
            outletId: "outlet-1",
            productId: "product-1",
            productName: "Kopi",
            quantity: 2,
            subtotal: 30_000,
            unitPrice: 15_000,
            createdAt: "2026-05-17T00:00:00.000Z",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
        updated: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(result.orderItems?.created[0]).toMatchObject({
      originalPriceMinorUnits: 20_000n,
      quantity: 2n,
      subtotalMinorUnits: 30_000n,
      unitPriceMinorUnits: 15_000n,
    });
  });

  test("generated mapper maps order DB fields to protobuf money fields", async () => {
    const mod = await import("../../generated/api-sync-mappers");

    const result = mod.encodeGeneratedPullBatchResponse({
      latestEventId: 12,
      needsFullResync: false,
      orders: {
        created: [
          {
            amountPaid: 20_000,
            changeAmount: 5000,
            id: "order-1",
            orderNumber: "ORD-001",
            outletId: "outlet-1",
            paymentMethod: "cash",
            registerId: "reg-1",
            staffId: "staff-1",
            status: "paid",
            total: 25_000,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
        updated: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(result.orders?.created[0]).toMatchObject({
      amountPaidMinorUnits: 20_000n,
      changeAmountMinorUnits: 5_000n,
      id: "order-1",
      totalMinorUnits: 25_000n,
    });
  });

  test("generated mapper maps outlet product DB fields to protobuf money fields", async () => {
    const mod = await import("../../generated/api-sync-mappers");

    const result = mod.encodeGeneratedPullBatchResponse({
      latestEventId: 12,
      needsFullResync: false,
      outletProducts: {
        created: [
          {
            id: "op-1",
            isAvailable: true,
            outletId: "outlet-1",
            price: 15_000,
            productId: "product-1",
            sortOrder: 1,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
        updated: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(result.outletProducts?.created[0]).toMatchObject({
      id: "op-1",
      isAvailable: true,
      priceMinorUnits: 15_000n,
      sortOrder: 1n,
    });
  });

  test("generated decode spreads typed rows for all tables", async () => {
    const mod = await import("../../generated/api-sync-mappers");

    const result = mod.decodeGeneratedPushBatchRequest({
      products: {
        created: [{ id: "p-1", name: "Kopi", priceMinorUnits: 15000n }],
        updated: [],
        deletedIds: ["p-del"],
      },
    });

    expect(result.products.created[0]).toEqual({
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
