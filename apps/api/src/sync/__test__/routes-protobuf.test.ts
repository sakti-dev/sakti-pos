import { afterEach, describe, expect, test, vi } from "bun:test";
import {
  SyncPullBatchRequest,
  SyncPullBatchResponse,
  SyncPushBatchRequest,
  SyncPushBatchResponse,
  SyncStatusRequest,
  SyncStatusResponse,
} from "@repo/protobuf/sync";

const mockSelect = vi.fn();
const mockGetSessionFromRequest = vi.fn();
const mockVerifyOutletAccess = vi.fn();
const mockHandlePushBatch = vi.fn();
const mockHandleSyncStatus = vi.fn();
const mockHandlePullBatch = vi.fn();

vi.mock("../../db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("../../lib/session", () => ({
  getSessionFromRequest: (...args: unknown[]) =>
    mockGetSessionFromRequest(...args),
}));

vi.mock("../service", () => ({
  handlePullBatch: (...args: unknown[]) => mockHandlePullBatch(...args),
  handlePushBatch: (...args: unknown[]) => mockHandlePushBatch(...args),
  handleSyncStatus: (...args: unknown[]) => mockHandleSyncStatus(...args),
  verifyOutletAccess: (...args: unknown[]) => mockVerifyOutletAccess(...args),
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    API_URL: "http://localhost:3001",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    NODE_ENV: "development",
    TURSO_AUTH_TOKEN: "",
    TURSO_DATABASE_URL: "http://127.0.0.1:8080",
  },
}));

const { syncRoutes } = await import("../routes");

function mockOutletLookup(merchantId = "merchant-1") {
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ merchantId }]),
      }),
    }),
  });
}

async function makeProtobufRequest(
  path: string,
  body: Uint8Array,
  options: { cookie?: string } = { cookie: "narvik_session=valid-token" }
) {
  const app = syncRoutes.compile();
  const headers: Record<string, string> = {
    "Content-Type": "application/x-protobuf",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  return await app.handle(
    new Request(`http://localhost${path}`, {
      body,
      headers,
      method: "POST",
    })
  );
}

describe("sync protobuf routes", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  test("POST /api/sync/push accepts batch protobuf and returns batch protobuf ack", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    mockHandlePushBatch.mockResolvedValue({
      latestEventId: 12,
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
    });

    const body = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        idempotencyKey: "sync-request-1",
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
          deletedIds: [],
          updated: [],
        },
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/push", body);
    const decoded = SyncPushBatchResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(mockHandlePushBatch).toHaveBeenCalledWith(
      "outlet-1",
      "merchant-1",
      {
        products: {
          created: [
            expect.objectContaining({
              id: "product-1",
              name: "Kopi",
            }),
          ],
          deletedIds: [],
          updated: [],
        },
      },
      "sync-request-1",
      expect.any(String)
    );
    expect(decoded.tables[0]?.acceptedCreatedIds).toEqual(["product-1"]);
  });

  test("POST /api/sync/status returns JSON 401 when no session exists", async () => {
    mockGetSessionFromRequest.mockResolvedValue(null);
    const body = SyncStatusRequest.encode(
      SyncStatusRequest.create({
        lastServerEventId: 0n,
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/status", body, {});

    expect(response.status).toBe(401);
    const json = (await response.json()) as unknown;
    expect(json).toEqual({ error: "Unauthorized" });
    expect(mockVerifyOutletAccess).not.toHaveBeenCalled();
  });

  test("POST /api/sync/status returns 403 when outlet access is denied", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(false);
    mockOutletLookup();
    const body = SyncStatusRequest.encode(
      SyncStatusRequest.create({
        lastServerEventId: 0n,
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/status", body);

    expect(response.status).toBe(403);
    const json = (await response.json()) as unknown;
    expect(json).toEqual({ error: "Forbidden" });
    expect(mockVerifyOutletAccess).toHaveBeenCalledWith("user-1", "outlet-1");
  });

  test("POST /api/sync/push accepts typed category rows", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    mockHandlePushBatch.mockResolvedValue({
      latestEventId: 12,
      serverTime: "2026-05-17T00:00:00.000Z",
      tables: [
        {
          acceptedCreatedIds: ["cat-1"],
          acceptedDeletedIds: [],
          acceptedUpdatedIds: [],
          rejected: [],
          table: "categories",
        },
      ],
    });

    const body = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        idempotencyKey: "sync-request-1",
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
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/push", body);

    expect(response.status).toBe(200);
    expect(mockHandlePushBatch).toHaveBeenCalledWith(
      "outlet-1",
      "merchant-1",
      {
        categories: {
          created: [
            expect.objectContaining({
              id: "cat-1",
              name: "Minuman",
            }),
          ],
          deletedIds: [],
          updated: [],
        },
      },
      "sync-request-1",
      expect.any(String)
    );
  });

  test("POST /api/sync/push requires an idempotency key", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    const body = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/push", body);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("idempotency");
    expect(mockHandlePushBatch).not.toHaveBeenCalled();
  });

  test("POST /api/sync/push returns 400 for malformed protobuf", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });

    const response = await makeProtobufRequest(
      "/api/sync/push",
      new Uint8Array([0xff])
    );

    expect(response.status).toBe(400);
    expect(mockVerifyOutletAccess).not.toHaveBeenCalled();
    expect(mockHandlePushBatch).not.toHaveBeenCalled();
  });

  test("POST /api/sync/pull returns 400 for invalid cursors", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    mockHandlePullBatch.mockRejectedValue(
      new Error("Invalid pull batch cursor")
    );
    const body = SyncPullBatchRequest.encode(
      SyncPullBatchRequest.create({
        afterEventId: 10n,
        outletId: "outlet-1",
        pageCursor: "bad-cursor",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/pull", body);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Invalid pull batch cursor");
  });

  test("POST /api/sync/pull returns 400 for unsafe afterEventId", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    const body = SyncPullBatchRequest.encode(
      SyncPullBatchRequest.create({
        afterEventId: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/pull", body);

    expect(response.status).toBe(400);
    expect(mockHandlePullBatch).not.toHaveBeenCalled();
  });

  test("POST /api/sync/status returns 404 before access check when outlet is missing", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const body = SyncStatusRequest.encode(
      SyncStatusRequest.create({
        lastServerEventId: 0n,
        outletId: "missing-outlet",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/status", body);

    expect(response.status).toBe(404);
    expect(mockVerifyOutletAccess).not.toHaveBeenCalled();
    expect(mockHandleSyncStatus).not.toHaveBeenCalled();
  });

  test("POST /api/sync/push returns 413 when row count is over the limit", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    const body = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        idempotencyKey: "sync-request-1",
        outletId: "outlet-1",
        products: {
          created: [],
          deletedIds: Array.from(
            { length: 2001 },
            (_, index) => `product-${index}`
          ),
          updated: [],
        },
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/push", body);

    expect(response.status).toBe(413);
    expect(mockHandlePushBatch).not.toHaveBeenCalled();
  });

  test("POST /api/sync/push returns 413 when encoded body is over the byte limit", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    const body = SyncPushBatchRequest.encode(
      SyncPushBatchRequest.create({
        categories: {
          created: [
            {
              id: "cat-1",
              merchantId: "merchant-1",
              name: "x".repeat(2 * 1024 * 1024),
            },
          ],
          deletedIds: [],
          updated: [],
        },
        idempotencyKey: "sync-request-1",
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/push", body);

    expect(response.status).toBe(413);
    expect(mockHandlePushBatch).not.toHaveBeenCalled();
  });

  test("POST /api/sync/status accepts protobuf and returns protobuf", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    mockHandleSyncStatus.mockResolvedValue({
      changedTables: ["products"],
      hasChanges: true,
      latestEventId: 12,
      needsFullResync: false,
      oldestAvailableEventId: null,
    });

    const body = SyncStatusRequest.encode(
      SyncStatusRequest.create({
        lastServerEventId: 10n,
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/status", body);
    const decoded = SyncStatusResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(mockHandleSyncStatus).toHaveBeenCalledWith({
      lastServerEventId: 10,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });
    expect(decoded.latestEventId).toBe(12n);
    expect(decoded.changedTables).toEqual(["products"]);
    expect(decoded.hasOldestAvailableEventId).toBe(false);
  });

  test("POST /api/sync/pull returns protobuf batch changes", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    mockHandlePullBatch.mockResolvedValue({
      categories: {
        created: [],
        deletedIds: [],
        updated: [{ id: "cat-1", merchantId: "merchant-1", name: "Minuman" }],
      },
      hasMore: false,
      latestEventId: 12,
      needsFullResync: false,
      nextPageCursor: "",
      products: {
        created: [],
        deletedIds: [],
        updated: [
          {
            id: "product-1",
            merchantId: "merchant-1",
            name: "Kopi",
            price: 15_000,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
      },
      serverTime: "2026-05-17T00:00:00.000Z",
    });

    const body = SyncPullBatchRequest.encode(
      SyncPullBatchRequest.create({
        afterEventId: 10n,
        limit: 2000,
        outletId: "outlet-1",
        pageCursor: "",
        tables: ["products", "categories"],
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/pull", body);
    const decoded = SyncPullBatchResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(mockHandlePullBatch).toHaveBeenCalledWith({
      afterEventId: 10,
      limit: 2000,
      merchantId: "merchant-1",
      outletId: "outlet-1",
      pageCursor: "",
      tables: ["products", "categories"],
    });
    expect(decoded.products?.updated[0]?.id).toBe("product-1");
    expect(decoded.categories?.updated[0]?.name).toBe("Minuman");
  });
});
