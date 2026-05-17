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

function makeAllTableRows(count: number) {
  return {
    assets: Array.from({ length: count }, (_, i) => ({
      byteSize: BigInt(1024 + i),
      contentHash: `hash-${i}`,
      contentType: "image/jpeg",
      height: BigInt(100 + i),
      id: `asset-${i}`,
      kind: "product_photo",
      merchantId: "merchant-1",
      objectKey: `assets/${i}`,
      status: "ready",
      width: BigInt(200 + i),
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    categories: Array.from({ length: count }, (_, i) => ({
      id: `cat-${i}`,
      isActive: true,
      merchantId: "merchant-1",
      name: `Category ${i}`,
      sortOrder: BigInt(i),
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    merchants: Array.from({ length: count }, (_, i) => ({
      id: `merchant-${i}`,
      name: `Merchant ${i}`,
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    order_items: Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      orderId: "order-1",
      originalPriceMinorUnits: 15000n,
      outletId: "outlet-1",
      productName: `Item ${i}`,
      quantity: BigInt(i + 1),
      subtotalMinorUnits: 15000n,
      unitPriceMinorUnits: 15000n,
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    orders: Array.from({ length: count }, (_, i) => ({
      amountPaidMinorUnits: 20000n,
      changeAmountMinorUnits: 5000n,
      id: `order-${i}`,
      orderNumber: `00${i}`,
      outletId: "outlet-1",
      paymentMethod: "cash",
      status: "paid",
      totalMinorUnits: 15000n,
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    outlet_products: Array.from({ length: count }, (_, i) => ({
      id: `op-${i}`,
      isAvailable: true,
      outletId: "outlet-1",
      priceMinorUnits: 15000n,
      productId: `product-${i}`,
      sortOrder: BigInt(i),
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    outlets: Array.from({ length: count }, (_, i) => ({
      id: `outlet-${i}`,
      isActive: true,
      merchantId: "merchant-1",
      name: `Outlet ${i}`,
      timezone: "Asia/Jakarta",
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    products: Array.from({ length: count }, (_, i) => ({
      id: `product-${i}`,
      isActive: true,
      merchantId: "merchant-1",
      name: `Product ${i}`,
      priceMinorUnits: 15000n,
      sortOrder: BigInt(i),
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    registers: Array.from({ length: count }, (_, i) => ({
      id: `register-${i}`,
      isActive: true,
      name: `Register ${i}`,
      outletId: "outlet-1",
      shortId: `R${i}`,
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
    staff: Array.from({ length: count }, (_, i) => ({
      id: `staff-${i}`,
      isActive: true,
      merchantId: "merchant-1",
      name: `Staff ${i}`,
      role: "cashier",
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    })),
  };
}

function toJsonRows(rows: Record<string, unknown[]>) {
  return Object.entries(rows).map(([table, items]) => ({
    createdJson: items.map((row) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row as Record<string, unknown>).map(([k, v]) => [
            k,
            typeof v === "bigint" ? v.toString() : v,
          ])
        )
      )
    ),
    deletedIds: [] as string[],
    table,
    updatedJson: [] as string[],
  }));
}

describe("typed protobuf sync payload size", () => {
  test("typed protobuf product batch is smaller than JSON row batch", () => {
    const rows = repeatedProducts(100);
    const typedBytes = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        idempotencyKey: "idem-1",
        outletId: "outlet-1",
        products: {
          created: rows,
          deletedIds: [],
          updated: [],
        },
      })
    ).finish().byteLength;

    const jsonBytes = new TextEncoder().encode(
      JSON.stringify({
        idempotencyKey: "idem-1",
        jsonTables: [
          {
            createdJson: rows.map((row) =>
              JSON.stringify({
                ...row,
                priceMinorUnits: row.priceMinorUnits.toString(),
                sortOrder: row.sortOrder.toString(),
              })
            ),
            deletedIds: [],
            table: "products",
            updatedJson: [],
          },
        ],
        outletId: "outlet-1",
      })
    ).byteLength;

    expect(typedBytes).toBeLessThan(jsonBytes);
  });

  test("typed protobuf all-table batch is smaller than JSON row batch", () => {
    const rowCount = 20;
    const rows = makeAllTableRows(rowCount);

    const typedBytes = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        assets: { created: rows.assets, deletedIds: [], updated: [] },
        categories: {
          created: rows.categories,
          deletedIds: [],
          updated: [],
        },
        idempotencyKey: "idem-all",
        merchants: { created: rows.merchants, deletedIds: [], updated: [] },
        orderItems: { created: rows.order_items, deletedIds: [], updated: [] },
        orders: { created: rows.orders, deletedIds: [], updated: [] },
        outletId: "outlet-1",
        outletProducts: {
          created: rows.outlet_products,
          deletedIds: [],
          updated: [],
        },
        outlets: { created: rows.outlets, deletedIds: [], updated: [] },
        products: { created: rows.products, deletedIds: [], updated: [] },
        registers: { created: rows.registers, deletedIds: [], updated: [] },
        staff: { created: rows.staff, deletedIds: [], updated: [] },
      })
    ).finish().byteLength;

    const jsonBytes = new TextEncoder().encode(
      JSON.stringify({
        idempotencyKey: "idem-all",
        jsonTables: toJsonRows(rows),
        outletId: "outlet-1",
      })
    ).byteLength;

    expect(typedBytes).toBeLessThan(jsonBytes);
    expect(typedBytes).toBeLessThan(jsonBytes * 0.7);
  });
});
