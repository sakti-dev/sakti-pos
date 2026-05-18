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
      cursor: "",
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(response.cursor).toBe("");
    expect(response.hasChanges).toBe(false);
  });

  test("encodes and decodes typed multitable batch for all sync tables", () => {
    const request = SyncPushBatchRequest.create({
      clientId: "client-1",
      idempotencyKey: "idem-1",
      outletId: "outlet-1",
      categories: {
        changedRows: [
          {
            id: "cat-1",
            merchantId: "merchant-1",
            name: "Minuman",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
      },
      merchants: {
        changedRows: [
          {
            id: "merchant-1",
            name: "Toko",
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
      },
      products: {
        changedRows: [
          {
            id: "product-1",
            merchantId: "merchant-1",
            name: "Kopi",
            priceMinorUnits: 15_000n,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: ["product-deleted"],
      },
      staff: {
        changedRows: [
          {
            id: "staff-1",
            merchantId: "merchant-1",
            name: "Owner",
            role: "owner",
          },
        ],
        deletedIds: [],
      },
    });

    const decoded = SyncPushBatchRequest.decode(
      SyncPushBatchRequest.encode(request).finish()
    );

    expect(decoded.outletId).toBe("outlet-1");
    expect(decoded.clientId).toBe("client-1");
    expect(decoded.products?.changedRows[0]?.name).toBe("Kopi");
    expect(decoded.products?.deletedIds).toEqual(["product-deleted"]);
    expect(decoded.merchants?.changedRows[0]?.name).toBe("Toko");
    expect(decoded.categories?.changedRows[0]?.name).toBe("Minuman");
    expect(decoded.staff?.changedRows[0]?.role).toBe("owner");
  });

  test("decodes typed push batch requests into table change sets", () => {
    const decoded = decodePushBatchRequest(
      SyncPushBatchRequest.create({
        idempotencyKey: "sync-request-1",
        outletId: "outlet-1",
        categories: {
          changedRows: [
            {
              id: "cat-1",
              merchantId: "merchant-1",
              name: "Minuman",
            },
          ],
          deletedIds: [],
        },
        products: {
          changedRows: [
            {
              id: "product-1",
              merchantId: "merchant-1",
              name: "Kopi",
              priceMinorUnits: 15_000n,
              updatedAt: "2026-05-17T00:00:00.000Z",
            },
          ],
          deletedIds: [],
        },
      })
    );

    expect(decoded.products.changedRows[0]).toMatchObject({
      id: "product-1",
      name: "Kopi",
    });
    expect(decoded.categories.changedRows[0]).toMatchObject({
      id: "cat-1",
    });
  });

  test("encodes push and pull batch responses", () => {
    const pushResponse = encodePushBatchResponse({
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
      cursor: "",
      products: {
        changedRows: [
          {
            id: "product-1",
            merchantId: "merchant-1",
            name: "Kopi",
            priceMinorUnits: 15_000n,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(pushResponse.tables[0]?.table).toBe("products");
    expect(pushResponse.tables[0]?.rejected[0]?.reason).toBe("server_newer");
    expect(pullResponse.products?.changedRows[0]?.name).toBe("Kopi");
  });

  test("encodePullBatchResponse maps API product DB fields to typed protobuf money fields", () => {
    const productChanges = {
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
    } as unknown as NonNullable<
      Parameters<typeof encodePullBatchResponse>[0]["products"]
    >;

    const encoded = encodePullBatchResponse({
      hasMore: false,
      cursor: "",
      products: productChanges,
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(encoded.products?.changedRows[0]).toMatchObject({
      id: "product-1",
      priceMinorUnits: 15_000n,
      sortOrder: 3n,
    });
  });

  test("encodePullBatchResponse maps API order item DB fields to typed protobuf money fields", () => {
    const orderItemChanges = {
      changedRows: [
        {
          createdAt: "2026-05-17T00:00:00.000Z",
          id: "item-1",
          orderId: "order-1",
          originalPriceMinorUnits: 20_000,
          outletId: "outlet-1",
          productId: "product-1",
          productName: "Kopi",
          quantity: 2,
          subtotalMinorUnits: 30_000,
          unitPriceMinorUnits: 15_000,
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      deletedIds: [],
    } as unknown as NonNullable<
      Parameters<typeof encodePullBatchResponse>[0]["order_items"]
    >;

    const encoded = encodePullBatchResponse({
      hasMore: false,
      cursor: "",
      order_items: orderItemChanges,
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    expect(encoded.order_items?.changedRows[0]).toMatchObject({
      originalPriceMinorUnits: 20_000n,
      subtotalMinorUnits: 30_000n,
      unitPriceMinorUnits: 15_000n,
    });
  });

  test("encodes and decodes pull batch response with server cursor", () => {
    const response = SyncPullBatchResponse.create({
      cursor: "sync:42:orders:order-1",
      hasMore: false,
      orders: {
        changedRows: [
          {
            id: "order-1",
            outletId: "outlet-1",
            status: "paid",
            totalMinorUnits: 20_000n,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
        deletedIds: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    const decoded = SyncPullBatchResponse.decode(
      SyncPullBatchResponse.encode(response).finish()
    );

    expect(decoded.cursor).toBe("sync:42:orders:order-1");
    expect(decoded.orders?.changedRows[0]?.id).toBe("order-1");
  });

  test("encodePullBatchResponse maps all non-hot tables to typed protobuf", () => {
    const encoded = encodePullBatchResponse({
      assets: {
        changedRows: [
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
      },
      categories: {
        changedRows: [
          {
            id: "cat-1",
            isActive: true,
            merchantId: "merchant-1",
            name: "Minuman",
            sortOrder: 1,
          },
        ],
        deletedIds: [],
      },
      hasMore: false,
      cursor: "",
      merchants: {
        changedRows: [
          {
            id: "merchant-1",
            name: "Toko Sejahtera",
          },
        ],
        deletedIds: [],
      },
      registers: {
        changedRows: [
          {
            id: "reg-1",
            isActive: true,
            name: "Register 1",
            outletId: "outlet-1",
            shortId: "R01",
          },
        ],
        deletedIds: [],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
      staff: {
        changedRows: [
          {
            id: "staff-1",
            isActive: true,
            merchantId: "merchant-1",
            name: "Owner",
            role: "owner",
          },
        ],
        deletedIds: [],
      },
    });

    expect(encoded.merchants?.changedRows[0]?.name).toBe("Toko Sejahtera");
    expect(encoded.categories?.changedRows[0]?.name).toBe("Minuman");
    expect(encoded.categories?.changedRows[0]?.sortOrder).toBe(1n);
    expect(encoded.registers?.changedRows[0]?.shortId).toBe("R01");
    expect(encoded.assets?.changedRows[0]?.byteSize).toBe(1024n);
    expect(encoded.assets?.changedRows[0]?.width).toBe(200n);
    expect(encoded.staff?.changedRows[0]?.role).toBe("owner");
  });

  test("encodePullBatchResponse maps all 10 sync tables into typed protobuf fields", () => {
    const encoded = encodePullBatchResponse({
      cursor: "",
      serverTime: "2026-05-17T00:00:00.000Z",
      hasMore: false,
      merchants: {
        changedRows: [{ id: "merchant-1", name: "Toko" }],
        deletedIds: [],
      },
      outlets: {
        changedRows: [
          {
            id: "outlet-1",
            merchantId: "merchant-1",
            name: "Outlet",
            timezone: "Asia/Jakarta",
            isActive: true,
          },
        ],
        deletedIds: [],
      },
      registers: {
        changedRows: [
          {
            id: "register-1",
            outletId: "outlet-1",
            name: "Kasir",
            shortId: "R1",
            isActive: true,
          },
        ],
        deletedIds: [],
      },
      categories: {
        changedRows: [
          {
            id: "cat-1",
            merchantId: "merchant-1",
            name: "Minuman",
            sortOrder: 1,
            isActive: true,
          },
        ],
        deletedIds: [],
      },
      assets: {
        changedRows: [
          {
            id: "asset-1",
            merchantId: "merchant-1",
            objectKey: "assets/1",
            contentType: "image/jpeg",
            byteSize: 123,
            contentHash: "hash",
            kind: "product_photo",
            width: 10,
            height: 20,
            status: "ready",
          },
        ],
        deletedIds: [],
      },
      products: {
        changedRows: [
          {
            id: "product-1",
            merchantId: "merchant-1",
            name: "Kopi",
            priceMinorUnits: 15_000,
            sortOrder: 1,
            isActive: true,
          },
        ],
        deletedIds: [],
      },
      orders: {
        changedRows: [
          {
            id: "order-1",
            outletId: "outlet-1",
            orderNumber: "001",
            totalMinorUnits: 15_000,
            amountPaidMinorUnits: 20_000,
            changeAmountMinorUnits: 5000,
            paymentMethod: "cash",
            status: "paid",
          },
        ],
        deletedIds: [],
      },
      order_items: {
        changedRows: [
          {
            id: "item-1",
            orderId: "order-1",
            outletId: "outlet-1",
            productName: "Kopi",
            quantity: 1,
            unitPriceMinorUnits: 15_000,
            originalPriceMinorUnits: 15_000,
            subtotalMinorUnits: 15_000,
          },
        ],
        deletedIds: [],
      },
      outlet_products: {
        changedRows: [
          {
            id: "op-1",
            outletId: "outlet-1",
            productId: "product-1",
            priceMinorUnits: 15_000,
            isAvailable: true,
            sortOrder: 1,
          },
        ],
        deletedIds: [],
      },
      staff: {
        changedRows: [
          {
            id: "staff-1",
            merchantId: "merchant-1",
            name: "Owner",
            role: "owner",
            isActive: true,
          },
        ],
        deletedIds: [],
      },
    });

    expect(encoded.merchants?.changedRows).toHaveLength(1);
    expect(encoded.outlets?.changedRows).toHaveLength(1);
    expect(encoded.registers?.changedRows).toHaveLength(1);
    expect(encoded.categories?.changedRows[0]?.sortOrder).toBe(1n);
    expect(encoded.assets?.changedRows[0]?.byteSize).toBe(123n);
    expect(encoded.products?.changedRows[0]?.priceMinorUnits).toBe(15000n);
    expect(encoded.orders?.changedRows[0]?.totalMinorUnits).toBe(15000n);
    expect(encoded.order_items?.changedRows[0]?.unitPriceMinorUnits).toBe(
      15000n
    );
    expect(encoded.outlet_products?.changedRows[0]?.priceMinorUnits).toBe(
      15000n
    );
    expect(encoded.staff?.changedRows).toHaveLength(1);
  });
});
