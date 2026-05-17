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

  test("encodes and decodes typed multitable batch for all sync tables", () => {
    const request = SyncPushBatchRequest.create({
      idempotencyKey: "idem-1",
      outletId: "outlet-1",
      categories: {
        created: [
          {
            id: "cat-1",
            merchantId: "merchant-1",
            name: "Minuman",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
        updated: [],
      },
      merchants: {
        created: [
          {
            id: "merchant-1",
            name: "Toko",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
        updated: [],
      },
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
        deletedIds: ["product-deleted"],
        updated: [],
      },
      staff: {
        created: [
          {
            id: "staff-1",
            merchantId: "merchant-1",
            name: "Owner",
            role: "owner",
          },
        ],
        deletedIds: [],
        updated: [],
      },
    });

    const decoded = SyncPushBatchRequest.decode(
      SyncPushBatchRequest.encode(request).finish()
    );

    expect(decoded.outletId).toBe("outlet-1");
    expect(decoded.products?.created[0]?.name).toBe("Kopi");
    expect(decoded.products?.deletedIds).toEqual(["product-deleted"]);
    expect(decoded.merchants?.created[0]?.name).toBe("Toko");
    expect(decoded.categories?.created[0]?.name).toBe("Minuman");
    expect(decoded.staff?.created[0]?.role).toBe("owner");
  });

  test("decodes typed push batch requests into table change sets", () => {
    const decoded = decodePushBatchRequest(
      SyncPushBatchRequest.create({
        idempotencyKey: "sync-request-1",
        outletId: "outlet-1",
        categories: {
          created: [
            {
              id: "cat-1",
              merchantId: "merchant-1",
              name: "Minuman",
            },
          ],
          deletedIds: [],
          updated: [],
        },
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
          deletedIds: [],
          updated: [],
        },
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

  test("encodes push and pull batch responses", () => {
    const pushResponse = encodePushBatchResponse({
      latestEventId: 12,
      serverTime: "2026-05-17T00:00:00.000Z",
      tables: [
        {
          acceptedCreatedIds: ["product-1"],
          acceptedDeletedIds: [],
          acceptedUpdatedIds: [],
          rejected: [{ id: "product-2", reason: "server_newer" }],
          table: "products",
        },
      ],
    });

    const pullResponse = encodePullBatchResponse({
      hasMore: false,
      latestEventId: 12,
      needsFullResync: false,
      nextPageCursor: "",
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
        deletedIds: [],
        updated: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(pushResponse.tables[0]?.table).toBe("products");
    expect(pushResponse.tables[0]?.rejected[0]?.reason).toBe("server_newer");
    expect(pullResponse.products?.created[0]?.name).toBe("Kopi");
  });

  test("encodePullBatchResponse maps API product DB fields to typed protobuf money fields", () => {
    const productChanges = {
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
    } as unknown as NonNullable<
      Parameters<typeof encodePullBatchResponse>[0]["products"]
    >;

    const encoded = encodePullBatchResponse({
      hasMore: false,
      latestEventId: 12,
      needsFullResync: false,
      nextPageCursor: "",
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
          createdAt: "2026-05-17T00:00:00.000Z",
          id: "item-1",
          orderId: "order-1",
          originalPrice: 20_000,
          outletId: "outlet-1",
          productId: "product-1",
          productName: "Kopi",
          quantity: 2,
          subtotal: 30_000,
          unitPrice: 15_000,
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      deletedIds: [],
      updated: [],
    } as unknown as NonNullable<
      Parameters<typeof encodePullBatchResponse>[0]["order_items"]
    >;

    const encoded = encodePullBatchResponse({
      hasMore: false,
      latestEventId: 12,
      needsFullResync: false,
      nextPageCursor: "",
      order_items: orderItemChanges,
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(encoded.orderItems?.created[0]).toMatchObject({
      originalPriceMinorUnits: 20_000n,
      subtotalMinorUnits: 30_000n,
      unitPriceMinorUnits: 15_000n,
    });
  });

  test("encodes and decodes pull batch response with server cursor", () => {
    const response = SyncPullBatchResponse.create({
      latestEventId: 42n,
      needsFullResync: false,
      orders: {
        created: [
          {
            id: "order-1",
            outletId: "outlet-1",
            status: "paid",
            totalMinorUnits: 20_000n,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
        updated: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    const decoded = SyncPullBatchResponse.decode(
      SyncPullBatchResponse.encode(response).finish()
    );

    expect(decoded.latestEventId).toBe(42n);
    expect(decoded.orders?.created[0]?.id).toBe("order-1");
  });

  test("encodePullBatchResponse maps all non-hot tables to typed protobuf", () => {
    const encoded = encodePullBatchResponse({
      assets: {
        created: [
          {
            byteSize: 1024,
            contentHash: "abc123",
            contentType: "image/png",
            createdByUserId: "user-1",
            height: 100,
            id: "asset-1",
            kind: "product_image",
            merchantId: "merchant-1",
            objectKey: "assets/asset-1.png",
            originalFilename: "photo.png",
            status: "ready",
            width: 200,
          },
        ],
        deletedIds: [],
        updated: [],
      },
      categories: {
        created: [
          {
            id: "cat-1",
            isActive: true,
            merchantId: "merchant-1",
            name: "Minuman",
            sortOrder: 1,
          },
        ],
        deletedIds: [],
        updated: [],
      },
      hasMore: false,
      latestEventId: 5,
      merchants: {
        created: [
          {
            id: "merchant-1",
            name: "Toko Sejahtera",
          },
        ],
        deletedIds: [],
        updated: [],
      },
      needsFullResync: false,
      nextPageCursor: "",
      registers: {
        created: [
          {
            id: "reg-1",
            isActive: true,
            name: "Register 1",
            outletId: "outlet-1",
            shortId: "R01",
          },
        ],
        deletedIds: [],
        updated: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
      staff: {
        created: [
          {
            id: "staff-1",
            isActive: true,
            merchantId: "merchant-1",
            name: "Owner",
            role: "owner",
          },
        ],
        deletedIds: [],
        updated: [],
      },
    });

    expect(encoded.merchants?.created[0]?.name).toBe("Toko Sejahtera");
    expect(encoded.categories?.created[0]?.name).toBe("Minuman");
    expect(encoded.categories?.created[0]?.sortOrder).toBe(1n);
    expect(encoded.registers?.created[0]?.shortId).toBe("R01");
    expect(encoded.assets?.created[0]?.byteSize).toBe(1024n);
    expect(encoded.assets?.created[0]?.width).toBe(200n);
    expect(encoded.staff?.created[0]?.role).toBe("owner");
  });
});
