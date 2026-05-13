import { afterEach, describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    transaction: (fn: unknown) => mockTransaction(fn),
  },
}));

vi.mock("../../lib/auth", () => ({
  narvik: {
    createSession: vi.fn(),
    invalidateSession: vi.fn(),
    cookieName: "narvik_session",
    validateSession: vi.fn(),
    createCookie: vi.fn(() => ({ serialize: () => "narvik_session=test" })),
    createBlankCookie: vi.fn(() => ({
      serialize: () => "narvik_session=; Max-Age=0",
    })),
  },
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    TURSO_DATABASE_URL: "http://127.0.0.1:8080",
    TURSO_AUTH_TOKEN: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    API_URL: "http://localhost:3001",
    NODE_ENV: "development",
  },
}));

const {
  handlePush,
  handlePull,
  handleEventPull,
  handleSyncStatus,
  verifyOutletAccess,
  ALL_SYNC_TABLE_NAMES,
} = await import("../service");

describe("verifyOutletAccess", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns true when user has access via user_merchants", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ merchantId: "merchant-1" }]),
        }),
      }),
    });

    const result = await verifyOutletAccess("user-1", "outlet-1");
    expect(result).toBe(true);
  });

  test("returns false when user has no access to outlet", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([undefined]),
        }),
      }),
    });

    const result = await verifyOutletAccess("user-1", "outlet-1");
    expect(result).toBe(false);
  });
});

describe("handlePush", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns empty serverWins when inserting new rows", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values,
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        await fn(tx);
      }
    );

    const now = new Date().toISOString();
    const result = await handlePush("outlet-1", "merchant-1", {
      categories: [
        {
          id: "cat-1",
          name: "Minuman",
          merchantId: "merchant-1",
          updatedAt: now,
          createdAt: now,
        },
      ],
    });

    expect(result.serverWins).toEqual([]);
    expect(result.serverTime).toBeDefined();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "insert",
        rowId: "cat-1",
        scopeId: "merchant-1",
        scopeType: "merchant",
        tableName: "categories",
      })
    );
  });

  test("server wins when client updatedAt is older", async () => {
    const oldTime = "2025-01-01T00:00:00.000Z";
    const newTime = "2025-01-02T00:00:00.000Z";

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ id: "cat-1", updatedAt: newTime }]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        await fn(tx);
      }
    );

    const result = await handlePush("outlet-1", "merchant-1", {
      categories: [
        {
          id: "cat-1",
          name: "Minuman Updated",
          merchantId: "merchant-1",
          updatedAt: oldTime,
          createdAt: oldTime,
        },
      ],
    });

    expect(result.serverWins).toHaveLength(1);
    expect(result.serverWins[0]).toEqual({
      table: "categories",
      ids: ["cat-1"],
    });
  });

  test("client wins when client updatedAt is newer or equal", async () => {
    const oldTime = "2025-01-01T00:00:00.000Z";
    const newTime = "2025-01-02T00:00:00.000Z";

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ id: "cat-1", updatedAt: oldTime }]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        await fn(tx);
      }
    );

    const result = await handlePush("outlet-1", "merchant-1", {
      categories: [
        {
          id: "cat-1",
          name: "Minuman Updated",
          merchantId: "merchant-1",
          updatedAt: newTime,
          createdAt: oldTime,
        },
      ],
    });

    expect(result.serverWins).toHaveLength(0);
  });

  test("handles order_items using createdAt for conflict resolution", async () => {
    const oldCreated = "2025-01-01T00:00:00.000Z";
    const newCreated = "2025-01-02T00:00:00.000Z";

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ id: "oi-1", createdAt: newCreated }]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        await fn(tx);
      }
    );

    const result = await handlePush("outlet-1", "merchant-1", {
      order_items: [
        {
          id: "oi-1",
          quantity: 5,
          createdAt: oldCreated,
        },
      ],
    });

    expect(result.serverWins).toHaveLength(1);
    expect(result.serverWins[0]).toEqual({
      table: "order_items",
      ids: ["oi-1"],
    });
  });

  test("keeps order item snapshots when referenced product is missing", async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const select = vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          });
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: insertedValues,
          }),
          select,
        };
        await fn(tx);
      }
    );

    await handlePush("outlet-1", "merchant-1", {
      order_items: [
        {
          createdAt: "2026-05-10T00:39:47.185Z",
          id: "item-1",
          orderId: "order-1",
          productId: "missing-product",
          productName: "Nasi",
          quantity: 1,
          subtotal: 4000,
          unitPrice: 4000,
          updatedAt: "2026-05-10T00:39:47.185Z",
        },
      ],
    });

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "item-1",
        outletId: "outlet-1",
        productId: null,
        productName: "Nasi",
        subtotal: 4000,
      })
    );
  });

  test("does not enforce product references for order item snapshots", async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const select = vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: "prod-1" }]),
              }),
            }),
          });
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: insertedValues,
          }),
          select,
        };
        await fn(tx);
      }
    );

    await handlePush("outlet-1", "merchant-1", {
      order_items: [
        {
          createdAt: "2026-05-10T00:39:47.185Z",
          id: "item-1",
          orderId: "order-1",
          productId: "prod-1",
          productName: "Nasi",
          quantity: 1,
          subtotal: 4000,
          unitPrice: 4000,
          updatedAt: "2026-05-10T00:39:47.185Z",
        },
      ],
    });

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "item-1",
        productId: null,
        productName: "Nasi",
      })
    );
  });

  test("normalizes empty string productId to null for order item inserts", async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: insertedValues,
          }),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
        await fn(tx);
      }
    );

    await handlePush("outlet-1", "merchant-1", {
      order_items: [
        {
          createdAt: "2026-05-10T00:39:47.185Z",
          id: "item-1",
          orderId: "order-1",
          productId: "",
          productName: "Nasi",
          quantity: 1,
          subtotal: 4000,
          unitPrice: 4000,
          updatedAt: "2026-05-10T00:39:47.185Z",
        },
      ],
    });

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "item-1",
        productId: null,
      })
    );
  });

  test("normalizes empty string registerId to null for order inserts", async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: insertedValues,
          }),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
        await fn(tx);
      }
    );

    await handlePush("outlet-1", "merchant-1", {
      orders: [
        {
          createdAt: "2026-05-10T00:39:47.185Z",
          id: "order-1",
          orderNumber: "2026-05-10-001",
          paymentMethod: "cash",
          registerId: "",
          staffId: "staff-1",
          status: "completed",
          total: 18_000,
          updatedAt: "2026-05-10T00:39:47.185Z",
        },
      ],
    });

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "order-1",
        registerId: null,
        staffId: "staff-1",
      })
    );
  });

  test("normalizes empty string categoryId to null for product inserts", async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: insertedValues,
          }),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
        await fn(tx);
      }
    );

    const now = new Date().toISOString();
    await handlePush("outlet-1", "merchant-1", {
      products: [
        {
          categoryId: "",
          createdAt: now,
          id: "prod-1",
          merchantId: "merchant-1",
          name: "Nasi Goreng",
          price: 15_000,
          updatedAt: now,
        },
      ],
    });

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: null,
        id: "prod-1",
        name: "Nasi Goreng",
      })
    );
  });

  test("accepts millisecond updatedAt timestamps for product updates with imageAssetId", async () => {
    const setValues = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const serverUpdatedAt = "2026-05-10T00:00:00.000Z";
    const clientUpdatedAt = String(
      new Date("2026-05-10T00:00:01.000Z").getTime()
    );

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([
                    { id: "prod-1", updatedAt: serverUpdatedAt },
                  ]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          update: vi.fn().mockReturnValue({
            set: setValues,
          }),
        };
        await fn(tx);
      }
    );

    const result = await handlePush("outlet-1", "merchant-1", {
      products: [
        {
          createdAt: "2026-05-10T00:00:00.000Z",
          id: "prod-1",
          imageAssetId: "asset-1",
          merchantId: "merchant-1",
          name: "Nasi Goreng",
          price: 15_000,
          updatedAt: clientUpdatedAt,
        },
      ],
    });

    expect(result.serverWins).toEqual([]);
    expect(setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        imageAssetId: "asset-1",
        updatedAt: clientUpdatedAt,
      })
    );
  });

  test("normalizes empty strings across orders and order_items in a single push", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn((value: Record<string, unknown>) => {
              insertedValues.push(value);
              return Promise.resolve();
            }),
          }),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
        await fn(tx);
      }
    );

    await handlePush("outlet-1", "merchant-1", {
      order_items: [
        {
          createdAt: "2026-05-10T00:39:47.185Z",
          id: "item-1",
          orderId: "order-1",
          productId: "",
          productName: "Nasi",
          quantity: 1,
          subtotal: 4000,
          unitPrice: 4000,
          updatedAt: "2026-05-10T00:39:47.185Z",
        },
      ],
      orders: [
        {
          createdAt: "2026-05-10T00:39:47.185Z",
          id: "order-1",
          orderNumber: "2026-05-10-001",
          paymentMethod: "cash",
          registerId: "",
          staffId: "staff-1",
          status: "completed",
          total: 4000,
          updatedAt: "2026-05-10T00:39:47.185Z",
        },
      ],
    });

    const order = insertedValues.find((v) => v.id === "order-1");
    const item = insertedValues.find((v) => v.id === "item-1");

    expect(order).toEqual(
      expect.objectContaining({
        registerId: null,
        staffId: "staff-1",
      })
    );

    expect(item).toEqual(
      expect.objectContaining({
        productId: null,
        productName: "Nasi",
      })
    );
  });

  test("processes parent tables before child tables regardless of payload key order", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn((value: Record<string, unknown>) => {
              insertedValues.push(value);
              return Promise.resolve();
            }),
          }),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
        await fn(tx);
      }
    );

    await handlePush("outlet-1", "merchant-1", {
      order_items: [
        {
          createdAt: "2026-05-10T00:39:47.185Z",
          id: "item-1",
          orderId: "order-1",
          productName: "Nasi",
          quantity: 1,
          subtotal: 4000,
          unitPrice: 4000,
          updatedAt: "2026-05-10T00:39:47.185Z",
        },
      ],
      orders: [
        {
          createdAt: "2026-05-10T00:39:47.185Z",
          id: "order-1",
          orderNumber: "2026-05-10-001",
          paymentMethod: "cash",
          status: "completed",
          total: 4000,
          updatedAt: "2026-05-10T00:39:47.185Z",
        },
      ],
    });

    const businessRows = insertedValues.filter((value) => "id" in value);
    expect(businessRows[0]).toEqual(expect.objectContaining({ id: "order-1" }));
    expect(businessRows[1]).toEqual(expect.objectContaining({ id: "item-1" }));
  });

  test("handles outlet_products push", async () => {
    const now = new Date().toISOString();

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        await fn(tx);
      }
    );

    const result = await handlePush("outlet-1", "merchant-1", {
      outlet_products: [
        {
          id: "op-1",
          outletId: "outlet-1",
          productId: "prod-1",
          price: 5000,
          updatedAt: now,
          createdAt: now,
        },
      ],
    });

    expect(result.serverWins).toEqual([]);
  });

  test("handles empty tables gracefully", async () => {
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        await fn({});
      }
    );

    const result = await handlePush("outlet-1", "merchant-1", {});
    expect(result.serverWins).toEqual([]);
  });

  test("tombstoned records flow through push normally", async () => {
    const now = new Date().toISOString();
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        await fn(tx);
      }
    );

    const result = await handlePush("outlet-1", "merchant-1", {
      categories: [
        {
          id: "cat-deleted",
          name: "Deleted Category",
          merchantId: "merchant-1",
          updatedAt: now,
          createdAt: now,
          deletedAt: now,
        },
      ],
    });

    expect(result.serverWins).toEqual([]);
  });

  test("updates existing category tombstones during push", async () => {
    const existingUpdatedAt = "2026-05-09T12:00:00.000Z";
    const deletedAt = "2026-05-10T12:00:00.000Z";
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([
                    { id: "cat-deleted", updatedAt: existingUpdatedAt },
                  ]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          update: vi.fn().mockReturnValue({ set }),
        };
        await fn(tx);
      }
    );

    const result = await handlePush("outlet-1", "merchant-1", {
      categories: [
        {
          createdAt: existingUpdatedAt,
          deletedAt,
          id: "cat-deleted",
          merchantId: "merchant-1",
          name: "Deleted Category",
          updatedAt: deletedAt,
        },
      ],
    });

    expect(result.serverWins).toEqual([]);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt,
        id: "cat-deleted",
        updatedAt: deletedAt,
      })
    );
  });
});

describe("handlePull", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns rows for requested tables", async () => {
    const mockRows = [
      { id: "cat-1", name: "Minuman", merchantId: "merchant-1" },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockRows),
      }),
    });

    const result = (await handlePull(
      "outlet-1",
      "merchant-1",
      ["categories"],
      "2025-01-01T00:00:00.000Z"
    )) as Record<string, unknown>;

    expect(result.categories).toEqual(mockRows);
    expect(result.serverTime).toBeDefined();
  });

  test("returns empty for unknown table names", async () => {
    const result = (await handlePull(
      "outlet-1",
      "merchant-1",
      ["unknown_table"],
      "2025-01-01T00:00:00.000Z"
    )) as Record<string, unknown>;
    expect(result.unknown_table).toBeUndefined();
    expect(result.serverTime).toBeDefined();
  });

  test("pulls multiple tables", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = (await handlePull(
      "outlet-1",
      "merchant-1",
      [
        "categories",
        "assets",
        "products",
        "orders",
        "order_items",
        "outlet_products",
        "staff",
      ],
      "2025-01-01T00:00:00.000Z"
    )) as Record<string, unknown>;

    expect(result.categories).toEqual([]);
    expect(result.assets).toEqual([]);
    expect(result.products).toEqual([]);
    expect(result.orders).toEqual([]);
    expect(result.order_items).toEqual([]);
    expect(result.outlet_products).toEqual([]);
    expect(result.staff).toEqual([]);
    expect(result.serverTime).toBeDefined();
  });

  test("includes assets in the sync table list", () => {
    expect(ALL_SYNC_TABLE_NAMES).toContain("assets");
  });

  test("categories and products are scoped by merchantId", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    await handlePull(
      "outlet-1",
      "merchant-1",
      ["categories", "products"],
      "2025-01-01T00:00:00.000Z"
    );

    expect(mockSelect).toHaveBeenCalled();
  });

  test("orders and order_items are scoped by outletId", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    await handlePull(
      "outlet-1",
      "merchant-1",
      ["orders", "order_items"],
      "2025-01-01T00:00:00.000Z"
    );

    expect(mockSelect).toHaveBeenCalled();
  });
});

describe("handleSyncStatus", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns no changes when cursor equals latest event", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: 1, tableName: "merchants" },
          { id: 10, tableName: "products" },
        ]),
      }),
    });

    const result = await handleSyncStatus({
      lastServerEventId: 10,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(result).toEqual({
      changedTables: [],
      hasChanges: false,
      latestEventId: 10,
      needsFullResync: false,
      oldestAvailableEventId: 1,
    });
  });

  test("requires full resync when cursor is older than retained history", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: 50, tableName: "products" },
          { id: 100, tableName: "orders" },
        ]),
      }),
    });

    const result = await handleSyncStatus({
      lastServerEventId: 5,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(result.needsFullResync).toBe(true);
    expect(result.hasChanges).toBe(true);
    expect(result.changedTables).toEqual(["products", "orders"]);
  });
});

describe("handleEventPull", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockSelectQueue(rowsByCall: unknown[][]) {
    let callIndex = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const rows = rowsByCall[callIndex] ?? [];
          callIndex += 1;
          return rows;
        }),
      }),
    }));
  }

  test("coalesces repeated row events into one latest snapshot", async () => {
    mockSelectQueue([
      [
        { id: 11, rowId: "prod-1", tableName: "products" },
        { id: 12, rowId: "prod-1", tableName: "products" },
      ],
      [{ id: "prod-1", name: "Kopi", merchantId: "merchant-1" }],
    ]);

    const result = await handleEventPull({
      afterEventId: 10,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(result.needsFullResync).toBe(false);
    expect(result.latestEventId).toBe(12);
    expect(result.products).toEqual([
      { id: "prod-1", name: "Kopi", merchantId: "merchant-1" },
    ]);
  });

  test("returns retained soft-deleted row snapshots", async () => {
    mockSelectQueue([
      [{ id: 21, rowId: "staff-1", tableName: "staff" }],
      [
        {
          deletedAt: "2026-05-09T12:00:00.000Z",
          id: "staff-1",
          merchantId: "merchant-1",
        },
      ],
    ]);

    const result = await handleEventPull({
      afterEventId: 20,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(result.latestEventId).toBe(21);
    expect(result.staff).toEqual([
      {
        deletedAt: "2026-05-09T12:00:00.000Z",
        id: "staff-1",
        merchantId: "merchant-1",
      },
    ]);
  });

  test("requires full resync when cursor is older than retained event history", async () => {
    mockSelectQueue([[{ id: 50, rowId: "prod-1", tableName: "products" }]]);

    const result = await handleEventPull({
      afterEventId: 10,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(result).toEqual({
      latestEventId: 50,
      needsFullResync: true,
    });
  });
});

describe("smart sync simulation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockSelectQueue(rowsByCall: unknown[][]) {
    let callIndex = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const rows = rowsByCall[callIndex] ?? [];
          callIndex += 1;
          return rows;
        }),
      }),
    }));
  }

  test("detects and pulls a product change made by another device", async () => {
    const simulatedProductEvent = {
      id: 1,
      rowId: "prod-1",
      tableName: "products",
    };
    const changedProduct = {
      id: "prod-1",
      merchantId: "merchant-1",
      name: "Kopi Susu",
      updatedAt: "2026-05-09T12:00:00.000Z",
    };

    mockSelectQueue([
      [simulatedProductEvent],
      [simulatedProductEvent],
      [changedProduct],
    ]);

    const status = await handleSyncStatus({
      lastServerEventId: 0,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(status).toEqual({
      changedTables: ["products"],
      hasChanges: true,
      latestEventId: 1,
      needsFullResync: false,
      oldestAvailableEventId: 1,
    });

    const pull = await handleEventPull({
      afterEventId: 0,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(pull.needsFullResync).toBe(false);
    expect(pull.latestEventId).toBe(1);
    expect(pull.products).toEqual([changedProduct]);
  });
});
