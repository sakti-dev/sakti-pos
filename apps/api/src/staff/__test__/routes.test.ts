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

const { staffRoutes } = await import("../routes");

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

  return staffRoutes.compile().handle(request);
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

describe("staff JSON routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("POST /api/staff/current returns 401 when unauthenticated", async () => {
    const response = await makeJsonRequest("/api/staff/current", {
      body: { merchantId: "merchant-1" },
    });

    expect(response.status).toBe(401);
  });

  test("POST /api/staff/current claims the owner staff row", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([
      [{ id: "um-1", role: "owner" }],
      [],
      [
        {
          createdAt: "2026-05-10T00:00:00.000Z",
          id: "staff-1",
          isActive: true,
          merchantId: "merchant-1",
          name: "Owner",
          outletId: "outlet-1",
          pin: "pin-hash",
          role: "owner",
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
    ]);

    const updateValues = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "staff-1",
            isActive: true,
            merchantId: "merchant-1",
            name: "Owner",
            outletId: "outlet-1",
            pin: "pin-hash",
            role: "owner",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        ]),
      }),
    });
    mockUpdate.mockReturnValue({
      set: updateValues,
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const response = await makeJsonRequest("/api/staff/current", {
      body: { merchantId: "merchant-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.claimed).toBe(true);
    expect(decoded.hasStaff).toBe(true);
    expect((decoded.staff as Record<string, unknown>)?.id).toBe("staff-1");
    expect(updateValues).toHaveBeenCalledWith(
      expect.objectContaining({ cloudUserId: "user-1" })
    );
  });

  test("POST /api/staff/create creates staff", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([[{ id: "um-1" }]]);

    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "staff-1",
            isActive: true,
            merchantId: "merchant-1",
            name: "Cashier",
            outletId: "outlet-1",
            pin: "hash",
            role: "cashier",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        ]),
      }),
    }));

    const response = await makeJsonRequest("/api/staff/create", {
      body: {
        hasOutletId: true,
        merchantId: "merchant-1",
        name: "Cashier",
        outletId: "outlet-1",
        pin: "123456",
        role: "cashier",
      },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect((decoded.staff as Record<string, unknown>)?.name).toBe("Cashier");
  });

  test("POST /api/staff/list returns staff rows", async () => {
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
          where: vi.fn().mockResolvedValue([
            {
              createdAt: "2026-05-10T00:00:00.000Z",
              id: "staff-1",
              isActive: true,
              merchantId: "merchant-1",
              name: "Cashier",
              outletId: "outlet-1",
              pin: "hash",
              role: "cashier",
              updatedAt: "2026-05-10T00:00:00.000Z",
            },
          ]),
        }),
      }));

    const response = await makeJsonRequest("/api/staff/list", {
      body: { merchantId: "merchant-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.staff).toHaveLength(1);
    expect((decoded.staff as Record<string, unknown>[])[0]?.name).toBe(
      "Cashier"
    );
  });

  test("POST /api/staff/update-pin updates the pin", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([[{ merchantId: "merchant-1" }], [{ id: "um-1" }]]);

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              createdAt: "2026-05-10T00:00:00.000Z",
              id: "staff-1",
              isActive: true,
              merchantId: "merchant-1",
              name: "Cashier",
              outletId: "outlet-1",
              pin: "hash",
              role: "cashier",
              updatedAt: "2026-05-10T00:01:00.000Z",
            },
          ]),
        }),
      }),
    });

    const response = await makeJsonRequest("/api/staff/update-pin", {
      body: { id: "staff-1", pin: "654321" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect((decoded.staff as Record<string, unknown>)?.id).toBe("staff-1");
  });

  test("POST /api/staff/delete deactivates staff", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });
    mockSelectQueue([[{ merchantId: "merchant-1" }], [{ id: "um-1" }]]);
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const response = await makeJsonRequest("/api/staff/delete", {
      body: { id: "staff-1" },
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>).success).toBe(
      true
    );
  });
});
