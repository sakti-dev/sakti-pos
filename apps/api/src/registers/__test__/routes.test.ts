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

const { registersRoutes } = await import("../routes");

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

  return registersRoutes.compile().handle(request);
}

describe("registers JSON routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("POST /api/registers/pair returns 400 for unknown code", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const response = await makeJsonRequest("/api/registers/pair", {
      body: { pairingCode: "AB12CD34" },
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Invalid pairing code"
    );
  });

  test("POST /api/registers/pair returns outlet and register", async () => {
    const futureTime = new Date(Date.now() + 86_400_000).toISOString();
    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                createdAt: "2026-05-10T00:00:00.000Z",
                id: "reg-1",
                isActive: true,
                name: "Register 1",
                outletId: "outlet-1",
                pairingCode: "AB12CD34",
                pairingExpiresAt: futureTime,
                shortId: "ABC123",
                updatedAt: "2026-05-10T00:00:00.000Z",
              },
            ]),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                address: "Jl. Test",
                createdAt: "2026-05-10T00:00:00.000Z",
                id: "outlet-1",
                isActive: true,
                merchantId: "merchant-1",
                name: "Outlet 1",
                updatedAt: "2026-05-10T00:00:00.000Z",
              },
            ]),
          }),
        }),
      }));

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              createdAt: "2026-05-10T00:00:00.000Z",
              id: "reg-1",
              isActive: true,
              name: "Register 1",
              outletId: "outlet-1",
              pairingCode: null,
              pairingExpiresAt: null,
              shortId: "ABC123",
              updatedAt: "2026-05-10T00:01:00.000Z",
            },
          ]),
        }),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const response = await makeJsonRequest("/api/registers/pair", {
      body: { pairingCode: "AB12CD34" },
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect((decoded.outlet as Record<string, unknown>)?.id).toBe("outlet-1");
    expect((decoded.register as Record<string, unknown>)?.id).toBe("reg-1");
  });

  test("POST /api/registers/create creates register", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "um-1" }]),
        }),
      }),
    }));

    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "reg-1",
            isActive: true,
            name: "Register 1",
            outletId: "outlet-1",
            pairingCode: "AB12CD34",
            pairingExpiresAt: "2026-05-11T00:00:00.000Z",
            shortId: "ABC123",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        ]),
      }),
    }));

    const response = await makeJsonRequest("/api/registers/create", {
      body: { name: "Register 1", outletId: "outlet-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect((decoded.register as Record<string, unknown>)?.name).toBe(
      "Register 1"
    );
  });

  test("POST /api/registers/list returns outlet registers", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "um-1" }]),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "um-2" }]),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              createdAt: "2026-05-10T00:00:00.000Z",
              id: "reg-1",
              isActive: true,
              name: "Register 1",
              outletId: "outlet-1",
              pairingCode: "AB12CD34",
              pairingExpiresAt: "2026-05-11T00:00:00.000Z",
              shortId: "ABC123",
              updatedAt: "2026-05-10T00:00:00.000Z",
            },
          ]),
        }),
      }));

    const response = await makeJsonRequest("/api/registers/list", {
      body: { outletId: "outlet-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.registers).toHaveLength(1);
    expect((decoded.registers as Record<string, unknown>[])[0]?.id).toBe(
      "reg-1"
    );
  });

  test("POST /api/registers/delete deactivates register", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "reg-1",
                outletId: "outlet-1",
                pairingCode: "AB12CD34",
                pairingExpiresAt: "2026-05-11T00:00:00.000Z",
                isActive: true,
              },
            ]),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "um-1" }]),
          }),
        }),
      }));

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const response = await makeJsonRequest("/api/registers/delete", {
      body: { id: "reg-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>).success).toBe(
      true
    );
  });
});
