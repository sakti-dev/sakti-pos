import { afterEach, describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const mockValidateSession = vi.fn();
vi.mock("../lib/auth", () => ({
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

const { outletsRoutes } = await import("../routes/outlets");

async function makeRequest(
  path: string,
  options: { body?: unknown; cookie?: string; method?: string } = {}
) {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = {};
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = { headers, method: options.method ?? "GET" };
  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  const request = new Request(url, init);
  const app = outletsRoutes.compile();
  const response = await app.handle(request);

  const status = response.status;
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { json, status };
}

describe("POST /api/merchants/:merchantId/outlets", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when no session", async () => {
    const { json, status } = await makeRequest(
      "/api/merchants/merchant-1/outlets",
      {
        method: "POST",
        body: { name: "Test Outlet" },
      }
    );
    expect(status).toBe(401);
    expect((json as Record<string, unknown>).error).toBe("Unauthorized");
  });

  test("returns 403 when user is not member of merchant", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const { json, status } = await makeRequest(
      "/api/merchants/merchant-1/outlets",
      {
        method: "POST",
        body: { name: "Test Outlet" },
        cookie: "narvik_session=valid-token",
      }
    );

    expect(status).toBe(403);
    expect((json as Record<string, unknown>).error).toBe("Forbidden");
  });

  test("creates outlet when user has access", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    let selectCallCount = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return [{ id: "um-1", role: "owner" }];
            }
            return [];
          }),
        }),
      }),
    }));

    const now = new Date().toISOString();
    let insertCallCount = 0;
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          insertCallCount++;
          if (insertCallCount === 1) {
            return [
              {
                id: "outlet-1",
                merchantId: "merchant-1",
                name: "Test Outlet",
                createdAt: now,
                updatedAt: now,
              },
            ];
          }
          return [
            {
              id: "register-1",
              outletId: "outlet-1",
              name: "Register 1",
              shortId: "ABC123",
              createdAt: now,
              updatedAt: now,
            },
          ];
        }),
      }),
    }));

    const { json, status } = await makeRequest(
      "/api/merchants/merchant-1/outlets",
      {
        method: "POST",
        body: { name: "Test Outlet" },
        cookie: "narvik_session=valid-token",
      }
    );

    expect(status).toBe(200);
    expect((json as Record<string, unknown>).name).toBe("Test Outlet");
    expect(mockInsert).toHaveBeenCalledTimes(4);
    expect(
      ((json as Record<string, unknown>).register as Record<string, unknown>)
        .name
    ).toBe("Register 1");
    const outletEventValues = (
      mockInsert.mock.results[2]?.value as { values: ReturnType<typeof vi.fn> }
    ).values;
    const registerEventValues = (
      mockInsert.mock.results[3]?.value as { values: ReturnType<typeof vi.fn> }
    ).values;
    expect(outletEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "insert",
        rowId: "outlet-1",
        scopeId: "merchant-1",
        scopeType: "merchant",
        tableName: "outlets",
      })
    );
    expect(registerEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "insert",
        rowId: "register-1",
        scopeId: "outlet-1",
        scopeType: "outlet",
        tableName: "registers",
      })
    );
  });
});

describe("GET /api/merchants/:merchantId/outlets", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when no session", async () => {
    const { json, status } = await makeRequest(
      "/api/merchants/merchant-1/outlets"
    );
    expect(status).toBe(401);
    expect((json as Record<string, unknown>).error).toBe("Unauthorized");
  });
});
