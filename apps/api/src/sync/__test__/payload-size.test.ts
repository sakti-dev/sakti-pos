import { describe, expect, test } from "bun:test";
import { SyncPushBatchRequest } from "@repo/protobuf/sync";

function repeatedProducts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `product-${index}`,
    merchantId: "merchant-1",
    name: `Product ${index}`,
    priceMinorUnits: 15000n,
    isActive: true,
    sortOrder: BigInt(index),
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:00:00.000Z",
  }));
}

describe("typed protobuf sync payload size", () => {
  test("typed protobuf product batch is smaller than JSON row batch", () => {
    const rows = repeatedProducts(100);
    const typedBytes = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        outletId: "outlet-1",
        idempotencyKey: "idem-1",
        products: {
          created: rows,
          updated: [],
          deletedIds: [],
        },
      })
    ).finish().byteLength;

    const jsonBytes = new TextEncoder().encode(
      JSON.stringify({
        outletId: "outlet-1",
        idempotencyKey: "idem-1",
        jsonTables: [
          {
            table: "products",
            createdJson: rows.map((row) =>
              JSON.stringify({
                ...row,
                priceMinorUnits: row.priceMinorUnits.toString(),
                sortOrder: row.sortOrder.toString(),
              })
            ),
            updatedJson: [],
            deletedIds: [],
          },
        ],
      })
    ).byteLength;

    expect(typedBytes).toBeLessThan(jsonBytes);
  });
});
