import { afterEach, describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
type MockFn = ReturnType<typeof vi.fn>;
interface MockDb {
  delete: MockFn;
  insert: typeof mockInsert;
  select: typeof mockSelect;
  transaction: (fn: (tx: MockDb) => Promise<unknown>) => Promise<unknown>;
  update: MockFn;
}

const mockDb: MockDb = {
  delete: vi.fn(),
  insert: mockInsert,
  select: mockSelect,
  transaction: async (fn) => await fn(mockDb),
  update: vi.fn(),
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

const { merchantsRoutes } = await import("../routes");

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
  const app = merchantsRoutes.compile();
  return app.handle(request);
}

describe("POST /api/merchants/create", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when no session", async () => {
    const response = await makeJsonRequest("/api/merchants/create", {
      body: { name: "Test Merchant" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Unauthorized"
    );
  });

  test("creates merchant and adds user as owner via user_merchants", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: unknown) => ({
        returning: vi.fn().mockResolvedValue([vals]),
      })),
    }));

    const response = await makeJsonRequest("/api/merchants/create", {
      body: { name: "Test Merchant" },
      cookie: "narvik_session=valid-token",
      method: "POST",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect((decoded.merchant as Record<string, unknown>)?.name).toBe(
      "Test Merchant"
    );
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  test("injects session into merchant creation", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    const insertedValues: unknown[] = [];
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: unknown) => {
        insertedValues.push(vals);
        return {
          returning: vi
            .fn()
            .mockResolvedValue([
              { id: "merchant-1", ...(vals as Record<string, unknown>) },
            ]),
        };
      }),
    }));

    const response = await makeJsonRequest("/api/merchants/create", {
      body: { name: "Test Merchant" },
      cookie: "narvik_session=valid-token",
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(insertedValues[1]).toEqual(
      expect.objectContaining({
        merchantId: "merchant-1",
        role: "owner",
        userId: "user-1",
      })
    );
  });
});

describe("POST /api/merchants/list", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when no session", async () => {
    const response = await makeJsonRequest("/api/merchants/list", {
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Unauthorized"
    );
  });

  test("returns user's merchants", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { merchantId: "m-1", name: "Merchant 1", role: "owner" },
            ]),
        }),
      }),
    }));

    const response = await makeJsonRequest("/api/merchants/list", {
      cookie: "narvik_session=valid-token",
      method: "POST",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.merchants).toHaveLength(1);
    expect((decoded.merchants as Record<string, unknown>[])[0]?.name).toBe(
      "Merchant 1"
    );
  });
});
