import { describe, expect, test } from "bun:test";
import {
  SyncPullBatchResponse,
  SyncPushBatchRequest,
} from "@repo/protobuf/sync";
import {
  decodePushBatchRequest,
  encodePullBatchResponse,
  encodePushBatchResponse,
  encodeStatusResponse,
} from "../protobuf";

describe("sync protobuf helpers", () => {
  test("encodes status null oldest event with explicit presence flag", () => {
    const response = encodeStatusResponse({
      changedTables: [],
      hasChanges: false,
      latestEventId: 10,
      needsFullResync: false,
      oldestAvailableEventId: null,
    });

    expect(response.oldestAvailableEventId).toBe(0n);
    expect(response.hasOldestAvailableEventId).toBe(false);
  });

  test("encodes and decodes v2 multitable batch with typed product rows and json fallback", () => {
    const request = SyncPushBatchRequest.create({
      outletId: "outlet-1",
      products: {
        created: [
          {
            id: "product-1",
            merchantId: "merchant-1",
            name: "Kopi",
            priceMinorUnits: 15_000n,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        updated: [],
        deletedIds: ["product-deleted"],
      },
      jsonTables: [
        {
          table: "categories",
          createdJson: [JSON.stringify({ id: "cat-1", name: "Minuman" })],
          updatedJson: [],
          deletedIds: [],
        },
      ],
    });

    const decoded = SyncPushBatchRequest.decode(
      SyncPushBatchRequest.encode(request).finish()
    );

    expect(decoded.outletId).toBe("outlet-1");
    expect(decoded.products?.created[0]?.name).toBe("Kopi");
    expect(decoded.products?.deletedIds).toEqual(["product-deleted"]);
    expect(decoded.jsonTables[0]?.table).toBe("categories");
  });

  test("decodes v2 push batch requests into table change sets", () => {
    const decoded = decodePushBatchRequest(
      SyncPushBatchRequest.create({
        outletId: "outlet-1",
        idempotencyKey: "sync-request-1",
        products: {
          created: [
            {
              id: "product-1",
              merchantId: "merchant-1",
              name: "Kopi",
              priceMinorUnits: 15_000n,
              updatedAt: "2026-05-17T00:00:00.000Z",
            },
          ],
        },
        jsonTables: [
          {
            table: "categories",
            createdJson: [JSON.stringify({ id: "cat-1", name: "Minuman" })],
          },
        ],
      })
    );

    expect(decoded.products.created[0]).toMatchObject({
      id: "product-1",
      name: "Kopi",
    });
    expect(decoded.categories.created[0]).toMatchObject({
      id: "cat-1",
    });
  });

  test("encodes v2 push and pull batch responses", () => {
    const pushResponse = encodePushBatchResponse({
      latestEventId: 12,
      serverTime: "2026-05-17T00:00:00.000Z",
      tables: [
        {
          table: "products",
          acceptedCreatedIds: ["product-1"],
          acceptedUpdatedIds: [],
          acceptedDeletedIds: [],
          rejected: [{ id: "product-2", reason: "server_newer" }],
        },
      ],
    });

    const pullResponse = encodePullBatchResponse({
      latestEventId: 12,
      needsFullResync: false,
      serverTime: "2026-05-17T00:00:00.000Z",
      products: {
        created: [
          {
            id: "product-1",
            merchantId: "merchant-1",
            name: "Kopi",
            priceMinorUnits: 15_000n,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        updated: [],
        deletedIds: [],
      },
    });

    expect(pushResponse.tables[0]?.table).toBe("products");
    expect(pushResponse.tables[0]?.rejected[0]?.reason).toBe("server_newer");
    expect(pullResponse.products?.created[0]?.name).toBe("Kopi");
  });

  test("encodePullBatchResponse maps API product DB fields to typed protobuf money fields", () => {
    const productChanges = {
      created: [
        {
          id: "product-1",
          merchantId: "merchant-1",
          categoryId: "cat-1",
          name: "Kopi",
          price: 15_000,
          imageUrl: "https://example.test/product.jpg",
          imageAssetId: "asset-1",
          isActive: true,
          sortOrder: 3,
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      deletedIds: [],
      updated: [],
    } as unknown as NonNullable<
      Parameters<typeof encodePullBatchResponse>[0]["products"]
    >;

    const encoded = encodePullBatchResponse({
      latestEventId: 12,
      needsFullResync: false,
      products: productChanges,
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(encoded.products?.created[0]).toMatchObject({
      id: "product-1",
      priceMinorUnits: 15_000n,
      sortOrder: 3n,
    });
  });

  test("encodePullBatchResponse maps API order item DB fields to typed protobuf money fields", () => {
    const orderItemChanges = {
      created: [
        {
          id: "item-1",
          outletId: "outlet-1",
          orderId: "order-1",
          productId: "product-1",
          productName: "Kopi",
          quantity: 2,
          unitPrice: 15_000,
          originalPrice: 20_000,
          subtotal: 30_000,
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      deletedIds: [],
      updated: [],
    } as unknown as NonNullable<
      Parameters<typeof encodePullBatchResponse>[0]["orderItems"]
    >;

    const encoded = encodePullBatchResponse({
      latestEventId: 12,
      needsFullResync: false,
      orderItems: orderItemChanges,
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(encoded.orderItems?.created[0]).toMatchObject({
      originalPriceMinorUnits: 20_000n,
      subtotalMinorUnits: 30_000n,
      unitPriceMinorUnits: 15_000n,
    });
  });

  test("encodes and decodes v2 pull batch response with server cursor", () => {
    const response = SyncPullBatchResponse.create({
      latestEventId: 42n,
      needsFullResync: false,
      serverTime: "2026-05-17T00:00:00.000Z",
      orders: {
        created: [
          {
            id: "order-1",
            outletId: "outlet-1",
            totalMinorUnits: 20_000n,
            status: "paid",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        updated: [],
        deletedIds: [],
      },
    });

    const decoded = SyncPullBatchResponse.decode(
      SyncPullBatchResponse.encode(response).finish()
    );

    expect(decoded.latestEventId).toBe(42n);
    expect(decoded.orders?.created[0]?.id).toBe("order-1");
  });
});
