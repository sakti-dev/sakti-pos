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
  handlePushBatch,
  handlePullBatch,
  handleSyncStatus,
  verifyOutletAccess,
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

describe("handlePushBatch", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("accepts created updated and deleted rows across tables in one transaction", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const update = vi.fn().mockReturnValue({ set });
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing,
        onConflictDoUpdate,
      }),
    });

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
          insert,
          update,
        };
        return await fn(tx);
      }
    );

    const result = await handlePushBatch(
      "outlet-1",
      "merchant-1",
      {
        orders: {
          created: [
            {
              id: "order-1",
              outletId: "outlet-1",
              totalMinorUnits: 15_000n,
              status: "completed",
              updatedAt: "2026-05-17T00:00:00.000Z",
            },
          ],
          updated: [],
          deletedIds: [],
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
          updated: [],
          deletedIds: [],
        },
      },
      "",
      "request-hash-1"
    );

    expect(
      result.tables.find((table) => table.table === "products")
    ).toBeDefined();
    expect(
      result.tables.find((table) => table.table === "orders")
    ).toBeDefined();
    expect(insert.mock.calls.length).toBeLessThanOrEqual(4);
    expect(values).toBeDefined();
  });

  test("rejects stale updates with reason", async () => {
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([
                    { id: "product-1", updatedAt: "2026-05-18T00:00:00.000Z" },
                  ]),
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: "product-1",
                      updatedAt: "2026-05-18T00:00:00.000Z",
                    },
                  ]),
                }),
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
        return await fn(tx);
      }
    );

    const result = await handlePushBatch(
      "outlet-1",
      "merchant-1",
      {
        products: {
          created: [],
          updated: [
            {
              id: "product-1",
              merchantId: "merchant-1",
              name: "Kopi Lama",
              priceMinorUnits: 15_000n,
              updatedAt: "2026-05-17T00:00:00.000Z",
            },
          ],
          deletedIds: [],
        },
      },
      "",
      "request-hash-1"
    );

    expect(result.tables[0]?.rejected).toEqual([
      { id: "product-1", reason: "server_newer" },
    ]);
  });

  test("rejects timestamp-less delete ids when server row exists", async () => {
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([
                    { id: "product-1", updatedAt: "2026-05-18T00:00:00.000Z" },
                  ]),
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: "product-1",
                      updatedAt: "2026-05-18T00:00:00.000Z",
                    },
                  ]),
                }),
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
        return await fn(tx);
      }
    );

    const result = await handlePushBatch(
      "outlet-1",
      "merchant-1",
      {
        products: {
          created: [],
          updated: [],
          deletedIds: ["product-1"],
        },
      },
      "",
      "request-hash-1"
    );

    expect(result.tables[0]?.acceptedDeletedIds).toEqual([]);
    expect(result.tables[0]?.rejected).toEqual([
      { id: "product-1", reason: "server_newer" },
    ]);
  });

  test("batches accepted product updates and sync events", async () => {
    const productRows = Array.from({ length: 100 }, (_, index) => ({
      id: `product-${index}`,
      merchantId: "merchant-1",
      name: `Product ${index}`,
      priceMinorUnits: BigInt(10_000 + index),
      updatedAt: "2026-05-17T00:00:00.000Z",
    }));
    const existingRows = productRows.map((row) => ({
      id: row.id,
      updatedAt: "2026-05-16T00:00:00.000Z",
    }));
    const values = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });
    const insert = vi.fn().mockReturnValue({ values });
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(existingRows),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 100 }]),
          }),
        }),
      }),
    });

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert,
          select,
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        return await fn(tx);
      }
    );

    const result = await handlePushBatch(
      "outlet-1",
      "merchant-1",
      {
        products: {
          created: [],
          updated: productRows,
          deletedIds: [],
        },
      },
      "",
      "request-hash-1"
    );

    const syncEventPayloads = values.mock.calls
      .map(([payload]) => payload)
      .filter(
        (payload): payload is Record<string, unknown>[] =>
          Array.isArray(payload) &&
          payload.every(
            (row) =>
              typeof row === "object" &&
              row !== null &&
              "tableName" in row &&
              row.tableName === "products"
          )
      );

    expect(select).toHaveBeenCalledTimes(2);
    expect(syncEventPayloads).toHaveLength(1);
    expect(syncEventPayloads[0]).toHaveLength(100);
    expect(result.tables[0]?.acceptedUpdatedIds).toHaveLength(100);
    expect(result.tables[0]?.rejected).toEqual([]);
  });

  test("returns a cached response when the same idempotency key is retried", async () => {
    const cachedResponse = {
      latestEventId: 42,
      serverTime: "2026-05-17T00:00:00.000Z",
      tables: [
        {
          acceptedCreatedIds: ["product-1"],
          acceptedDeletedIds: [],
          acceptedUpdatedIds: [],
          rejected: [],
          table: "products",
        },
      ],
    };

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    latestEventId: 42,
                    requestHash: "request-hash-1",
                    responseJson: JSON.stringify(cachedResponse),
                    serverTime: "2026-05-17T00:00:00.000Z",
                  },
                ]),
              }),
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn(),
          update: vi.fn(),
        };
        return await fn(tx);
      }
    );

    const result = await handlePushBatch(
      "outlet-1",
      "merchant-1",
      {},
      "sync-request-1",
      "request-hash-1"
    );

    expect(result).toEqual(cachedResponse);
  });

  test("rejects cached retries when the request body changes under the same idempotency key", async () => {
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    latestEventId: 42,
                    requestHash: "request-hash-1",
                    responseJson: JSON.stringify({
                      latestEventId: 42,
                      serverTime: "2026-05-17T00:00:00.000Z",
                      tables: [],
                    }),
                    serverTime: "2026-05-17T00:00:00.000Z",
                  },
                ]),
              }),
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn(),
          update: vi.fn(),
        };
        return await fn(tx);
      }
    );

    await expect(
      handlePushBatch(
        "outlet-1",
        "merchant-1",
        {},
        "sync-request-1",
        "request-hash-2"
      )
    ).rejects.toThrow("idempotency key reused with different request body");
  });
});

describe("handleSyncStatus", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  function mockSyncStatusQueries(input: {
    changedRows: { tableName: string }[];
    latestRows: { id: number }[];
    oldestRows: { id: number }[];
  }) {
    const latestLimit = vi.fn().mockResolvedValue(input.latestRows);
    const oldestLimit = vi.fn().mockResolvedValue(input.oldestRows);
    const changedOrderBy = vi.fn().mockResolvedValue(input.changedRows);

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: latestLimit,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: oldestLimit,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: changedOrderBy,
          }),
        }),
      });

    return { changedOrderBy, latestLimit, oldestLimit };
  }

  test("returns no changes when cursor equals latest event", async () => {
    mockSyncStatusQueries({
      changedRows: [],
      latestRows: [{ id: 10 }],
      oldestRows: [{ id: 1 }],
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
    mockSyncStatusQueries({
      changedRows: [{ tableName: "products" }, { tableName: "orders" }],
      latestRows: [{ id: 100 }],
      oldestRows: [{ id: 50 }],
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

  test("reads latest and oldest event bounds with limit one", async () => {
    const { latestLimit, oldestLimit } = mockSyncStatusQueries({
      changedRows: [{ tableName: "products" }, { tableName: "orders" }],
      latestRows: [{ id: 100 }],
      oldestRows: [{ id: 90 }],
    });

    const result = await handleSyncStatus({
      lastServerEventId: 75,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(latestLimit).toHaveBeenCalledWith(1);
    expect(oldestLimit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      changedTables: ["products", "orders"],
      hasChanges: true,
      latestEventId: 100,
      needsFullResync: true,
      oldestAvailableEventId: 90,
    });
  });
});

describe("handlePullBatch", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  test("returns typed hot table rows and json fallback rows from events", async () => {
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([
            {
              id: 10,
              operation: "update",
              rowId: "product-1",
              tableName: "products",
            },
            {
              id: 11,
              operation: "insert",
              rowId: "cat-1",
              tableName: "categories",
            },
          ]),
        }),
      }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue([
            { id: "product-1", merchantId: "merchant-1", name: "Kopi" },
          ]),
      }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue([
            { id: "cat-1", merchantId: "merchant-1", name: "Minuman" },
          ]),
      }),
    }));

    const result = await handlePullBatch({
      afterEventId: 9,
      limit: 2000,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      pageCursor: "",
      tables: ["products", "categories"],
    });

    expect(result.latestEventId).toBe(11);
    expect(result.hasMore).toBe(false);
    expect(result.needsFullResync).toBe(false);
    expect(result.products?.updated[0]).toMatchObject({ id: "product-1" });
    expect(
      result.jsonTables.find((table) => table.table === "categories")
        ?.createdJson[0]
    ).toBeDefined();
  });

  test("pages rows using the cursor and limit", async () => {
    let callIndex = 0;
    mockSelect.mockImplementation(() => {
      const rowsByCall = [
        [
          {
            id: 10,
            operation: "update",
            rowId: "product-1",
            tableName: "products",
          },
          {
            id: 11,
            operation: "update",
            rowId: "product-2",
            tableName: "products",
          },
        ],
        [
          { id: "product-1", merchantId: "merchant-1", name: "Kopi" },
          { id: "product-2", merchantId: "merchant-1", name: "Teh" },
        ],
        [
          {
            id: 11,
            operation: "update",
            rowId: "product-2",
            tableName: "products",
          },
        ],
        [
          { id: "product-1", merchantId: "merchant-1", name: "Kopi" },
          { id: "product-2", merchantId: "merchant-1", name: "Teh" },
        ],
      ];
      const rows = rowsByCall[callIndex] ?? [];
      callIndex += 1;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (callIndex % 2 === 1) {
              return {
                orderBy: vi.fn().mockResolvedValue(rows),
              };
            }
            return rows;
          }),
        }),
      };
    });

    const firstPage = await handlePullBatch({
      afterEventId: 9,
      limit: 1,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      pageCursor: "",
      tables: ["products"],
    });
    const secondPage = await handlePullBatch({
      afterEventId: 9,
      limit: 1,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      pageCursor: firstPage.nextPageCursor,
      tables: ["products"],
    });

    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.latestEventId).toBe(10);
    expect(firstPage.nextPageCursor).toBe("event:10");
    expect(firstPage.products?.updated[0]?.id).toBe("product-1");
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.latestEventId).toBe(11);
    expect(secondPage.nextPageCursor).toBe("");
    expect(secondPage.products?.updated[0]?.id).toBe("product-2");
  });

  test("fetches only one bounded event page from the database", async () => {
    const eventRows = [
      {
        id: 11,
        operation: "update",
        rowId: "product-1",
        tableName: "products",
      },
      {
        id: 12,
        operation: "update",
        rowId: "product-2",
        tableName: "products",
      },
    ];
    const limit = vi.fn().mockResolvedValue(eventRows);
    const orderByResult = {
      limit,
    };
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue(orderByResult),
        }),
      }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue([
            { id: "product-1", merchantId: "merchant-1", name: "Kopi" },
          ]),
      }),
    }));

    await handlePullBatch({
      afterEventId: 10,
      limit: 1,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      pageCursor: "",
      tables: ["products"],
    });

    expect(limit).toHaveBeenCalledWith(2);
  });

  test("returns delete events as deleted ids without requiring row snapshots", async () => {
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([
            {
              id: 12,
              operation: "delete",
              rowId: "product-deleted",
              tableName: "products",
            },
          ]),
        }),
      }),
    }));

    const result = await handlePullBatch({
      afterEventId: 11,
      limit: 2000,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      pageCursor: "",
      tables: ["products"],
    });

    expect(result.latestEventId).toBe(12);
    expect(result.products?.deletedIds).toEqual(["product-deleted"]);
    expect(result.products?.updated).toEqual([]);
  });

  test("returns baseline snapshots when pulling from cursor zero", async () => {
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([
            {
              id: 12,
              operation: "update",
              rowId: "product-1",
              tableName: "products",
            },
          ]),
        }),
      }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue([
            { id: "product-1", merchantId: "merchant-1", name: "Kopi" },
          ]),
      }),
    }));

    const result = await handlePullBatch({
      afterEventId: 0,
      limit: 2000,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      pageCursor: "",
      tables: ["products"],
    });

    expect(result.latestEventId).toBe(12);
    expect(result.hasMore).toBe(false);
    expect(result.products?.created[0]).toMatchObject({ id: "product-1" });
  });
});

describe("smart sync simulation", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  test("detects and pulls a product change made by another device", async () => {
    const simulatedProductEvent = {
      id: 1,
      operation: "update",
      rowId: "prod-1",
      tableName: "products",
    };
    const changedProduct = {
      id: "prod-1",
      merchantId: "merchant-1",
      name: "Kopi Susu",
      updatedAt: "2026-05-09T12:00:00.000Z",
    };

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([{ id: simulatedProductEvent.id }]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([{ id: simulatedProductEvent.id }]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi
              .fn()
              .mockResolvedValue([
                { tableName: simulatedProductEvent.tableName },
              ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([simulatedProductEvent]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([changedProduct]),
        }),
      });

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

    const pull = await handlePullBatch({
      afterEventId: 0,
      limit: 250,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      pageCursor: "",
      tables: ["products"],
    });

    expect(pull.needsFullResync).toBe(false);
    expect(pull.latestEventId).toBe(1);
    expect(pull.products?.created).toEqual([changedProduct]);
  });
});
