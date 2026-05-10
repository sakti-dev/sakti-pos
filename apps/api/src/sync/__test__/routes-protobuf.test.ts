import { afterEach, describe, expect, test, vi } from "bun:test";
import {
  SyncPullEventsRequest,
  SyncPullEventsResponse,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncStatusRequest,
  SyncStatusResponse,
} from "@repo/protobuf/sync";

const mockSelect = vi.fn();
const mockGetSessionFromRequest = vi.fn();
const mockVerifyOutletAccess = vi.fn();
const mockHandlePush = vi.fn();
const mockHandleSyncStatus = vi.fn();
const mockHandleEventPull = vi.fn();
const mockHandlePull = vi.fn();

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
  handleEventPull: (...args: unknown[]) => mockHandleEventPull(...args),
  handlePull: (...args: unknown[]) => mockHandlePull(...args),
  handlePush: (...args: unknown[]) => mockHandlePush(...args),
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
    vi.clearAllMocks();
  });

  test("POST /api/sync/push accepts protobuf and returns protobuf", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    mockHandlePush.mockResolvedValue({
      serverTime: "2026-05-10T00:00:00.000Z",
      serverWins: [{ ids: ["product-1"], table: "products" }],
    });

    const body = SyncPushRequest.encode(
      SyncPushRequest.create({
        outletId: "outlet-1",
        payloadJson: JSON.stringify({ products: [{ id: "product-1" }] }),
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/push", body);
    const decoded = SyncPushResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/x-protobuf"
    );
    expect(mockHandlePush).toHaveBeenCalledWith("outlet-1", "merchant-1", {
      products: [{ id: "product-1" }],
    });
    expect(decoded.serverWins).toEqual([
      { ids: ["product-1"], table: "products" },
    ]);
  });

  test("POST /api/sync/status returns JSON 401 when no session exists", async () => {
    mockGetSessionFromRequest.mockResolvedValue(null);
    const body = SyncStatusRequest.encode(
      SyncStatusRequest.create({
        lastServerEventId: 0,
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
    const body = SyncStatusRequest.encode(
      SyncStatusRequest.create({
        lastServerEventId: 0,
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/status", body);

    expect(response.status).toBe(403);
    const json = (await response.json()) as unknown;
    expect(json).toEqual({ error: "Forbidden" });
    expect(mockVerifyOutletAccess).toHaveBeenCalledWith("user-1", "outlet-1");
  });

  test("POST /api/sync/push returns 400 for malformed embedded JSON", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    const body = SyncPushRequest.encode(
      SyncPushRequest.create({
        outletId: "outlet-1",
        payloadJson: "{bad-json",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/push", body);

    expect(response.status).toBe(400);
    expect(mockHandlePush).not.toHaveBeenCalled();
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
        lastServerEventId: 10,
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
    expect(decoded.latestEventId).toBe(12);
    expect(decoded.changedTables).toEqual(["products"]);
    expect(decoded.hasOldestAvailableEventId).toBe(false);
  });

  test("POST /api/sync/pull-events accepts protobuf and returns protobuf", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    mockHandleEventPull.mockResolvedValue({
      latestEventId: 13,
      needsFullResync: false,
      products: [{ id: "product-1" }],
    });

    const body = SyncPullEventsRequest.encode(
      SyncPullEventsRequest.create({
        afterEventId: 10,
        outletId: "outlet-1",
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/pull-events", body);
    const decoded = SyncPullEventsResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(mockHandleEventPull).toHaveBeenCalledWith({
      afterEventId: 10,
      merchantId: "merchant-1",
      outletId: "outlet-1",
    });
    expect(decoded.latestEventId).toBe(13);
    expect(decoded.tables).toEqual([
      { rowsJson: JSON.stringify([{ id: "product-1" }]), table: "products" },
    ]);
  });

  test("POST /api/sync/pull accepts protobuf and returns protobuf", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockVerifyOutletAccess.mockResolvedValue(true);
    mockOutletLookup();
    mockHandlePull.mockResolvedValue({
      products: [{ id: "product-1" }],
      serverTime: "2026-05-10T00:00:00.000Z",
    });

    const body = SyncPullRequest.encode(
      SyncPullRequest.create({
        outletId: "outlet-1",
        since: "2026-05-10T00:00:00.000Z",
        tables: ["products"],
      })
    ).finish();

    const response = await makeProtobufRequest("/api/sync/pull", body);
    const decoded = SyncPullResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(mockHandlePull).toHaveBeenCalledWith(
      "outlet-1",
      "merchant-1",
      ["products"],
      "2026-05-10T00:00:00.000Z"
    );
    expect(decoded.serverTime).toBe("2026-05-10T00:00:00.000Z");
    expect(decoded.tables).toEqual([
      { rowsJson: JSON.stringify([{ id: "product-1" }]), table: "products" },
    ]);
  });
});
