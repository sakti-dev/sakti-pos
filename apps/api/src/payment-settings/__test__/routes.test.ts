import { afterEach, describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
type MockFn = ReturnType<typeof vi.fn>;
interface MockDb {
  delete: MockFn;
  insert: typeof mockInsert;
  select: typeof mockSelect;
  transaction: (fn: (tx: MockDb) => Promise<unknown>) => Promise<unknown>;
  update: typeof mockUpdate;
}

const mockDb: MockDb = {
  delete: vi.fn(),
  insert: mockInsert,
  select: mockSelect,
  transaction: async (fn) => await fn(mockDb),
  update: mockUpdate,
};

vi.mock("../../db", () => ({
  db: mockDb,
}));

const mockValidateSession = vi.fn();
vi.mock("../../lib/auth", () => ({
  narvik: {
    createSession: vi.fn(),
    invalidateSession: vi.fn(),
    cookieName: "narvik_session",
    validateSession: (...args: unknown[]) => mockValidateSession(...args),
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

const { paymentSettingsRoutes } = await import("../routes");

function makeJsonRequest(
  path: string,
  options: { body?: unknown; cookie?: string; method?: string } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  const request = new Request(`http://localhost${path}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options.method ?? "POST",
  });

  return paymentSettingsRoutes.compile().handle(request);
}

function mockSelectQueue(rowsByCall: unknown[][]) {
  let callIndex = 0;
  mockSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => {
          const rows = rowsByCall[callIndex] ?? [];
          callIndex += 1;
          return rows;
        }),
      }),
    }),
  }));
}

const settingsRow = {
  createdAt: "2026-09-28T00:00:00.000Z",
  id: "ps-1",
  merchantId: "merchant-1",
  qrisDinamisEnabled: true,
  qrisStatisEnabled: true,
  qrisStaticPayload: "0002010102116304ABCD",
  updatedAt: "2026-09-28T00:00:00.000Z",
};

describe("payment-settings JSON routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("POST /api/payment-settings/get returns 401 when unauthenticated", async () => {
    const response = await makeJsonRequest("/api/payment-settings/get", {
      body: { merchantId: "merchant-1" },
    });

    expect(response.status).toBe(401);
  });

  test("POST /api/payment-settings/get returns the merchant row", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([[{ id: "um-1", role: "owner" }], [settingsRow]]);

    const response = await makeJsonRequest("/api/payment-settings/get", {
      body: { merchantId: "merchant-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect((decoded.paymentSettings as Record<string, unknown>)?.id).toBe(
      "ps-1"
    );
  });

  test("POST /api/payment-settings/get returns null when no row exists", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([[{ id: "um-1", role: "owner" }], []]);

    const response = await makeJsonRequest("/api/payment-settings/get", {
      body: { merchantId: "merchant-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.paymentSettings).toBeNull();
  });

  test("POST /api/payment-settings/get returns 403 without merchant access", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([[]]);

    const response = await makeJsonRequest("/api/payment-settings/get", {
      body: { merchantId: "merchant-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(403);
  });

  test("POST /api/payment-settings/upsert inserts when absent", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([[{ id: "um-1", role: "owner" }], []]);

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([settingsRow]),
      }),
    });

    const response = await makeJsonRequest("/api/payment-settings/upsert", {
      body: {
        merchantId: "merchant-1",
        qrisStatisEnabled: true,
        qrisStaticPayload: "0002010102116304ABCD",
      },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect((decoded.paymentSettings as Record<string, unknown>)?.id).toBe(
      "ps-1"
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("POST /api/payment-settings/upsert updates when present", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([
      [{ id: "um-1", role: "owner" }],
      [{ ...settingsRow, qrisStatisEnabled: false }],
    ]);

    const updateValues = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([settingsRow]),
      }),
    });
    mockUpdate.mockReturnValue({ set: updateValues });

    const response = await makeJsonRequest("/api/payment-settings/upsert", {
      body: { merchantId: "merchant-1", qrisStatisEnabled: true },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(updateValues).toHaveBeenCalled();
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(
      (decoded.paymentSettings as Record<string, unknown>)?.qrisStatisEnabled
    ).toBe(true);
  });
});
