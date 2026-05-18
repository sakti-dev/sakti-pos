import { afterEach, describe, expect, test, vi } from "bun:test";
import { getTableConfig } from "drizzle-orm/sqlite-core";

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
  handleRowStatePullBatch,
  handleRowStateSyncStatus,
  formatPullBatchCursor,
  parsePullBatchCursor,
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
      "client-1",
      {
        orders: {
          changedRows: [
            {
              id: "order-1",
              outletId: "outlet-1",
              totalMinorUnits: 15_000n,
              status: "completed",
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
      "client-1",
      {
        products: {
          changedRows: [
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

  test("accepts deletedIds for existing server rows and soft-deletes them", async () => {
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const update = vi.fn().mockReturnValue({ set });
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });

    let selectCallCount = 0;
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                selectCallCount++;
                if (selectCallCount === 1) {
                  return { limit: vi.fn().mockResolvedValue([]) };
                }
                return {
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: "product-1",
                      updatedAt: "2026-05-18T00:00:00.000Z",
                    },
                  ]),
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([
                      {
                        id: "product-1",
                        updatedAt: "2026-05-18T00:00:00.000Z",
                      },
                    ]),
                  }),
                };
              }),
            }),
          })),
          insert,
          update,
        };
        return await fn(tx);
      }
    );

    const result = await handlePushBatch(
      "outlet-1",
      "merchant-1",
      "client-1",
      {
        products: {
          changedRows: [],
          deletedIds: ["product-1"],
        },
      },
      "idem-delete-1",
      "request-hash-delete-1"
    );

    expect(result.tables[0]?.acceptedDeletedIds).toEqual(["product-1"]);
    expect(result.tables[0]?.rejected).toEqual([]);
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(String),
        syncUpdatedAt: expect.any(Number),
        updatedAt: expect.any(String),
      })
    );
  });

  test("ignores out-of-scope deletedIds without writing delete events", async () => {
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    let selectCallCount = 0;

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                selectCallCount++;
                if (selectCallCount === 1) {
                  return [];
                }
                return {
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]),
                  }),
                };
              }),
            }),
          })),
          insert,
          update,
        };
        return await fn(tx);
      }
    );

    const result = await handlePushBatch(
      "outlet-1",
      "merchant-1",
      "client-1",
      {
        products: {
          changedRows: [],
          deletedIds: ["product-outside-scope"],
        },
      },
      "",
      "request-hash-delete-outside-scope"
    );

    expect(result.tables[0]?.acceptedDeletedIds).toEqual([]);
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  test("normalizes protobuf bigint int64 fields before DB upsert", async () => {
    const upsertedRows: Record<string, unknown>[][] = [];
    const serverSyncUpdatedAt = 1_716_030_000_123;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(serverSyncUpdatedAt);
    const values = vi.fn((rows: Record<string, unknown>[]) => {
      upsertedRows.push(rows);
      return {
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
    });
    const insert = vi.fn().mockReturnValue({ values });

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
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        return await fn(tx);
      }
    );

    await handlePushBatch(
      "outlet-1",
      "merchant-1",
      "client-1",
      {
        assets: {
          changedRows: [
            {
              byteSize: 1_024n,
              contentHash: "hash",
              contentType: "image/jpeg",
              height: 20n,
              id: "asset-1",
              kind: "product_photo",
              merchantId: "merchant-1",
              objectKey: "assets/1",
              status: "ready",
              syncUpdatedAt: 7,
              updatedAt: "2026-05-17T00:00:00.000Z",
              width: 10n,
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
              sortOrder: 3n,
              updatedAt: "2026-05-17T00:00:00.000Z",
            },
          ],
          deletedIds: [],
        },
      },
      "idem-bigint-normalize",
      "request-hash-bigint-normalize"
    );
    nowSpy.mockRestore();

    const writtenRows = upsertedRows.flat();
    expect(writtenRows).toContainEqual(
      expect.objectContaining({
        id: "cat-1",
        sortOrder: 3,
      })
    );
    expect(writtenRows).toContainEqual(
      expect.objectContaining({
        byteSize: 1024,
        height: 20,
        id: "asset-1",
        syncUpdatedAt: serverSyncUpdatedAt,
        width: 10,
      })
    );
  });

  test("preserves staff outletId while server-owning merchantId", async () => {
    const upsertedRows: Record<string, unknown>[][] = [];
    const values = vi.fn((rows: Record<string, unknown>[]) => {
      upsertedRows.push(rows);
      return {
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
    });
    const insert = vi.fn().mockReturnValue({ values });

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
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        return await fn(tx);
      }
    );

    await handlePushBatch(
      "outlet-1",
      "merchant-1",
      "client-1",
      {
        staff: {
          changedRows: [
            {
              createdAt: "2026-05-17T00:00:00.000Z",
              id: "staff-1",
              isActive: true,
              merchantId: "client-merchant",
              name: "Cashier",
              outletId: "outlet-1",
              role: "cashier",
              updatedAt: "2026-05-17T00:00:00.000Z",
            },
          ],
          deletedIds: [],
        },
      },
      "",
      "request-hash-staff"
    );

    expect(upsertedRows.flat()).toContainEqual(
      expect.objectContaining({
        id: "staff-1",
        merchantId: "merchant-1",
        outletId: "outlet-1",
      })
    );
  });

  test("preserves nullable int64 fields as null instead of zero", async () => {
    const upsertedRows: Record<string, unknown>[][] = [];
    const values = vi.fn((rows: Record<string, unknown>[]) => {
      upsertedRows.push(rows);
      return {
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
    });
    const insert = vi.fn().mockReturnValue({ values });

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
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        return await fn(tx);
      }
    );

    await handlePushBatch(
      "outlet-1",
      "merchant-1",
      "client-1",
      {
        orders: {
          changedRows: [
            {
              amountPaidMinorUnits: undefined,
              changeAmountMinorUnits: "",
              createdAt: "2026-05-17T00:00:00.000Z",
              id: "order-null",
              orderNumber: "001",
              paymentMethod: "cash",
              status: "completed",
              totalMinorUnits: 15_000n,
              updatedAt: "2026-05-17T00:00:00.000Z",
            },
          ],
          deletedIds: [],
        },
      },
      "",
      "request-hash-null-int"
    );

    expect(upsertedRows.flat()).toContainEqual(
      expect.objectContaining({
        amountPaidMinorUnits: null,
        changeAmountMinorUnits: null,
        id: "order-null",
      })
    );
  });

  test("rejects unsafe protobuf int64 values before DB upsert", async () => {
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert,
          select: vi.fn(),
          update: vi.fn(),
        };
        return await fn(tx);
      }
    );

    await expect(
      handlePushBatch(
        "outlet-1",
        "merchant-1",
        "client-1",
        {
          products: {
            changedRows: [
              {
                createdAt: "2026-05-17T00:00:00.000Z",
                id: "product-unsafe",
                name: "Too Big",
                priceMinorUnits: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
                updatedAt: "2026-05-17T00:00:00.000Z",
              },
            ],
            deletedIds: [],
          },
        },
        "",
        "request-hash-unsafe"
      )
    ).rejects.toThrow("Exceeds Number.MAX_SAFE_INTEGER");
    expect(insert).not.toHaveBeenCalled();
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
      "client-1",
      {
        products: {
          changedRows: productRows,
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

    expect(select).toHaveBeenCalledTimes(1);
    expect(syncEventPayloads).toHaveLength(0);
    expect(result.tables[0]?.acceptedUpdatedIds).toHaveLength(100);
    expect(result.tables[0]?.rejected).toEqual([]);
  });

  test("returns a cached response when the same idempotency key is retried", async () => {
    const cachedResponse = {
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
      "client-1",
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
                    requestHash: "request-hash-1",
                    responseJson: JSON.stringify({
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
        "client-1",
        {},
        "sync-request-1",
        "request-hash-2"
      )
    ).rejects.toThrow("idempotency key reused with different request body");
  });

  test("rejects cached retries while the same idempotency key is pending", async () => {
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    latestEventId: 0,
                    requestHash: "request-hash-1",
                    responseJson: JSON.stringify({ pending: true }),
                    serverTime: "2026-05-17T00:00:00.000Z",
                  },
                ]),
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
        "client-1",
        {},
        "sync-request-1",
        "request-hash-1"
      )
    ).rejects.toThrow("sync push is already in progress");
  });

  test("returns cached response when idempotency insert races with the same request body", async () => {
    const cachedResponse = {
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
    const uniqueConstraintError = new Error(
      "UNIQUE constraint failed: sync_batch_requests.idempotency_key"
    );

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi
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
                  limit: vi.fn().mockResolvedValue([
                    {
                      requestHash: "request-hash-1",
                      responseJson: JSON.stringify(cachedResponse),
                      serverTime: "2026-05-17T00:00:00.000Z",
                    },
                  ]),
                }),
              }),
            }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockRejectedValue(uniqueConstraintError),
          }),
          update: vi.fn(),
        };
        return await fn(tx);
      }
    );

    const result = await handlePushBatch(
      "outlet-1",
      "merchant-1",
      "client-1",
      {},
      "sync-request-1",
      "request-hash-1"
    );

    expect(result).toEqual(cachedResponse);
  });

  test("does not write rows when idempotency reservation races", async () => {
    const cachedResponse = {
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
    const uniqueConstraintError = new Error(
      "UNIQUE constraint failed: sync_batch_requests.idempotency_key"
    );
    const syncEventPayloads: Record<string, unknown>[][] = [];
    const rowUpsertPayloads: Record<string, unknown>[][] = [];
    let fallbackCacheVisible = false;

    const values = vi.fn(
      (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        if (
          Array.isArray(payload) &&
          payload.every((row) => "tableName" in row)
        ) {
          syncEventPayloads.push(payload);
          return Promise.resolve(undefined);
        }
        if (Array.isArray(payload)) {
          rowUpsertPayloads.push(payload);
          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          };
        }
        if ("responseJson" in payload) {
          fallbackCacheVisible = true;
          return Promise.reject(uniqueConstraintError);
        }
        return Promise.resolve(undefined);
      }
    );
    const insert = vi.fn().mockReturnValue({ values });
    const select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(
            fallbackCacheVisible
              ? [
                  {
                    requestHash: "request-hash-race",
                    responseJson: JSON.stringify(cachedResponse),
                    serverTime: "2026-05-17T00:00:00.000Z",
                  },
                ]
              : []
          ),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 100 }]),
          }),
        }),
      }),
    }));

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
      "client-1",
      {
        products: {
          changedRows: [
            {
              createdAt: "2026-05-17T00:00:00.000Z",
              id: "product-1",
              name: "Kopi",
              priceMinorUnits: 15_000n,
              updatedAt: "2026-05-17T00:00:00.000Z",
            },
          ],
          deletedIds: [],
        },
      },
      "sync-request-race",
      "request-hash-race"
    );

    expect(result).toEqual(cachedResponse);
    expect(rowUpsertPayloads).toHaveLength(0);
    expect(syncEventPayloads).toHaveLength(0);
  });
});

describe("pull batch cursor helpers", () => {
  test("parses an empty cursor as baseline", () => {
    expect(parsePullBatchCursor("")).toEqual(null);
  });

  test("parses a row-state cursor", () => {
    expect(parsePullBatchCursor("sync:1716030000:products:p123")).toEqual({
      rowId: "p123",
      syncUpdatedAt: 1_716_030_000,
      tableName: "products",
    });
  });

  test("rejects an invalid cursor prefix", () => {
    expect(() => parsePullBatchCursor("event:1716030000")).toThrow(
      "Invalid pull batch cursor"
    );
  });

  test("rejects an invalid cursor timestamp", () => {
    expect(() =>
      parsePullBatchCursor("sync:not-a-number:products:p123")
    ).toThrow("Invalid pull batch cursor");
  });

  test("round-trips cursor formatting", () => {
    const cursor = formatPullBatchCursor({
      rowId: "p123",
      syncUpdatedAt: 1_716_030_000,
      tableName: "products",
    });

    expect(cursor).toBe("sync:1716030000:products:p123");
    expect(parsePullBatchCursor(cursor)).toEqual({
      rowId: "p123",
      syncUpdatedAt: 1_716_030_000,
      tableName: "products",
    });
  });
});

describe("handleRowStatePullBatch", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns merged rows and a stable cursor across tables", async () => {
    const rowsByTable: Record<string, Record<string, unknown>[]> = {
      orders: [
        {
          deletedAt: null,
          id: "order-1",
          outletId: "outlet-1",
          syncUpdatedAt: 11,
          updatedAt: "2026-05-18T00:00:00.000Z",
        },
      ],
      products: [
        {
          deletedAt: null,
          id: "product-1",
          merchantId: "merchant-1",
          syncUpdatedAt: 10,
          updatedAt: "2026-05-18T00:00:00.000Z",
        },
      ],
    };
    let selectCallCount = 0;

    mockSelect.mockReturnValue({
      from: vi.fn().mockImplementation((table: unknown) => {
        const _tableName = getTableConfig(table as never).name;
        selectCallCount++;
        let rows: Record<string, unknown>[] = rowsByTable.orders;
        if (selectCallCount === 1) {
          rows = rowsByTable.products;
        } else if (selectCallCount === 2) {
          rows = rowsByTable.orders;
        } else if (selectCallCount === 3) {
          rows = [];
        }
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(rows),
            }),
          }),
        };
      }),
    });

    const result = await handleRowStatePullBatch({
      cursor: "",
      limit: 1,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      tables: ["products", "orders"],
    });

    expect(result.cursor).toBe("sync:10:products:product-1");
    expect(result.hasMore).toBe(true);
    expect(result.products?.changedRows).toEqual([
      expect.objectContaining({
        id: "product-1",
        syncUpdatedAt: 10,
      }),
    ]);
    expect(result.orders).toBeUndefined();

    const nextPage = await handleRowStatePullBatch({
      cursor: result.cursor,
      limit: 1,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      tables: ["products", "orders"],
    });

    expect(nextPage.cursor).toBe("");
    expect(nextPage.hasMore).toBe(false);
    expect(nextPage.orders?.changedRows).toEqual([
      expect.objectContaining({
        id: "order-1",
        syncUpdatedAt: 11,
      }),
    ]);
  });
});

describe("handleRowStateSyncStatus", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns changed tables and the latest row-state cursor", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockImplementation((table: unknown) => {
        const tableName = getTableConfig(table as never).name;
        let rows: Record<string, unknown>[] = [];
        if (tableName === "orders") {
          rows = [
            {
              id: "order-1",
              outletId: "outlet-1",
              syncUpdatedAt: 11,
              updatedAt: "2026-05-18T00:00:00.000Z",
            },
          ];
        } else if (tableName === "products") {
          rows = [
            {
              id: "product-1",
              merchantId: "merchant-1",
              syncUpdatedAt: 10,
              updatedAt: "2026-05-18T00:00:00.000Z",
            },
          ];
        }
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(rows),
            }),
          }),
        };
      }),
    });

    const result = await handleRowStateSyncStatus({
      cursor: "",
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });

    expect(result.changedTables).toEqual(["products", "orders"]);
    expect(result.hasChanges).toBe(true);
    expect(result.cursor).toBe("sync:11:orders:order-1");
  });
});
