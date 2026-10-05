import { beforeEach, describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockGetSessionFromRequest = vi.fn();
interface MockDb {
  insert: typeof mockInsert;
  select: typeof mockSelect;
  transaction: (fn: (tx: MockDb) => Promise<unknown>) => Promise<unknown>;
}
const mockValues = vi.fn();

const mockDb: MockDb = {
  insert: mockInsert,
  select: mockSelect,
  transaction: async (fn) => await fn(mockDb),
};

vi.mock("../../db", () => ({
  db: mockDb,
}));

vi.mock("../../lib/session", () => ({
  getSessionFromRequest: (...args: unknown[]) =>
    mockGetSessionFromRequest(...args),
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

const { startupRoutes } = await import("../routes");

function makeJsonRequest(
  path: string,
  options: { body?: unknown; cookie?: string } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  return startupRoutes.compile().handle(
    new Request(`http://localhost${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers,
      method: "POST",
    })
  );
}

/**
 * Select queue — one entry per query: 1) outlet, 2) merchant access,
 * 3) existing wallets, 4) payment settings. Each `where()` is awaitable
 * (some selects chain `.limit`, some don't).
 */
function selectQueue(rows: unknown[][]) {
  let callIndex = 0;
  mockSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        const result = Promise.resolve(rows[callIndex] ?? []);
        callIndex += 1;
        return Object.assign(result, {
          limit: () => result,
        });
      }),
    }),
  }));
}

const outletRow = { id: "outlet-1", merchantId: "merchant-1" };
const session = { id: "session-1", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockReset();
  mockSelect.mockReset();
  mockGetSessionFromRequest.mockReset();
});

describe("startup handshake", () => {
  test("returns 401 when no session", async () => {
    mockGetSessionFromRequest.mockResolvedValue(null);

    const response = await makeJsonRequest("/api/startup", {
      body: { outletId: "outlet-1" },
    });

    expect(response.status).toBe(401);
  });

  test("returns 404 for an unknown outlet", async () => {
    mockGetSessionFromRequest.mockResolvedValue(session);
    selectQueue([[]]);

    const response = await makeJsonRequest("/api/startup", {
      body: { outletId: "nope" },
    });

    expect(response.status).toBe(404);
  });

  test("seeds Laci Kas only when QRIS is off", async () => {
    mockGetSessionFromRequest.mockResolvedValue(session);
    selectQueue([
      [outletRow], // outlet
      [{ id: "um-1" }], // merchant access
      [], // existing wallets: none
      [
        {
          qrisDinamisEnabled: false,
          qrisStatisEnabled: false,
        },
      ], // payment settings
    ]);
    mockInsert.mockReturnValue({ values: mockValues });

    const response = await makeJsonRequest("/api/startup", {
      body: { outletId: "outlet-1" },
    });
    const json = (await response.json()) as {
      applied: string[];
      ok: boolean;
    };

    expect(json.ok).toBe(true);
    expect(json.applied).toEqual(["ensure_default_wallets"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  test("seeds both wallets when QRIS is enabled", async () => {
    mockGetSessionFromRequest.mockResolvedValue(session);
    selectQueue([
      [outletRow],
      [{ id: "um-1" }],
      [],
      [{ qrisDinamisEnabled: true, qrisStatisEnabled: false }],
    ]);
    mockInsert.mockReturnValue({ values: mockValues });

    const response = await makeJsonRequest("/api/startup", {
      body: { outletId: "outlet-1" },
    });
    const json = (await response.json()) as { applied: string[] };

    expect(json.applied).toEqual([
      "ensure_default_wallets",
      "ensure_qris_wallet",
    ]);
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  test("is a no-op when both wallets already exist", async () => {
    mockGetSessionFromRequest.mockResolvedValue(session);
    selectQueue([
      [outletRow],
      [{ id: "um-1" }],
      [
        { id: "w-1", type: "cash" },
        { id: "w-2", type: "qris" },
      ],
      [{ qrisDinamisEnabled: true, qrisStatisEnabled: true }],
    ]);
    mockInsert.mockReturnValue({ values: mockValues });

    const response = await makeJsonRequest("/api/startup", {
      body: { outletId: "outlet-1" },
    });
    const json = (await response.json()) as { applied: string[] };

    expect(json.applied).toEqual([]);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test("backfills a missing QRIS wallet when only cash exists", async () => {
    mockGetSessionFromRequest.mockResolvedValue(session);
    selectQueue([
      [outletRow],
      [{ id: "um-1" }],
      [{ id: "w-1", type: "cash" }],
      [{ qrisDinamisEnabled: false, qrisStatisEnabled: true }],
    ]);
    mockInsert.mockReturnValue({ values: mockValues });

    const response = await makeJsonRequest("/api/startup", {
      body: { outletId: "outlet-1" },
    });
    const json = (await response.json()) as { applied: string[] };

    expect(json.applied).toEqual(["ensure_qris_wallet"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  test("forbids a user without merchant access", async () => {
    mockGetSessionFromRequest.mockResolvedValue(session);
    selectQueue([
      [outletRow],
      [], // no userMerchants row
    ]);

    const response = await makeJsonRequest("/api/startup", {
      body: { outletId: "outlet-1" },
    });

    expect(response.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
