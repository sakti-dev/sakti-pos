import { beforeEach, describe, expect, test, vi } from "bun:test";
import {
  OutletCreateRequest,
  OutletCreateResponse,
  OutletListRequest,
  OutletListResponse,
  OutletUpdateRequest,
  OutletUpdateResponse,
} from "@repo/protobuf/outlets";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockGetSessionFromRequest = vi.fn();
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

const { outletsRoutes } = await import("../routes");

function makeProtoRequest(
  path: string,
  options: { body?: Uint8Array; cookie?: string; method?: string } = {}
) {
  const headers: Record<string, string> = {
    Accept: "application/x-protobuf",
    "Content-Type": "application/x-protobuf",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  const request = new Request(`http://localhost${path}`, {
    body: options.body ?? new Uint8Array(),
    headers,
    method: options.method ?? "POST",
  });

  return outletsRoutes.compile().handle(request);
}

describe("outlets protobuf routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockGetSessionFromRequest.mockReset();
  });

  test("returns 401 when no session", async () => {
    const response = await makeProtoRequest("/api/outlets/create", {
      body: OutletCreateRequest.encode({
        address: "",
        hasAddress: false,
        merchantId: "merchant-1",
        name: "Test Outlet",
        timezone: "Asia/Jakarta",
      }).finish(),
    });

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Unauthorized"
    );
  });

  test("creates outlet and default register", async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "um-1" }]),
        }),
      }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ name: "Warung" }]),
        }),
      }),
    }));

    const now = new Date().toISOString();
    let insertCallCount = 0;
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          insertCallCount += 1;
          if (insertCallCount === 1) {
            return [
              {
                address: "Jl. Test",
                createdAt: now,
                id: "outlet-1",
                isActive: true,
                merchantId: "merchant-1",
                name: "Test Outlet",
                receiptAddress: "Jl. Test",
                receiptName: "Warung",
                timezone: "Asia/Jakarta",
                updatedAt: now,
              },
            ];
          }

          return [
            {
              createdAt: now,
              id: "register-1",
              isActive: true,
              name: "Register 1",
              outletId: "outlet-1",
              pairingCode: "ABCDEFGH",
              pairingExpiresAt: now,
              shortId: "ABC123",
              updatedAt: now,
            },
          ];
        }),
      }),
    }));

    const response = await makeProtoRequest("/api/outlets/create", {
      body: OutletCreateRequest.encode({
        address: "Jl. Test",
        hasAddress: true,
        merchantId: "merchant-1",
        name: "Test Outlet",
        timezone: "Asia/Jakarta",
      }).finish(),
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = OutletCreateResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.outlet?.name).toBe("Test Outlet");
    expect(decoded.outlet?.receiptName).toBe("Warung");
    expect(decoded.outlet?.receiptAddress).toBe("Jl. Test");
    expect(decoded.register?.name).toBe("Register 1");
  });

  test("lists merchant outlets", async () => {
    mockGetSessionFromRequest.mockResolvedValue({
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
              address: "Jl. Test",
              createdAt: "2026-05-10T00:00:00.000Z",
              id: "outlet-1",
              isActive: true,
              merchantId: "merchant-1",
              name: "Outlet 1",
              receiptAddress: "Jl. Test",
              receiptName: "Warung",
              timezone: "Asia/Jakarta",
              updatedAt: "2026-05-10T00:00:00.000Z",
            },
          ]),
        }),
      }));

    const response = await makeProtoRequest("/api/outlets/list", {
      body: OutletListRequest.encode({ merchantId: "merchant-1" }).finish(),
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = OutletListResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.outlets).toHaveLength(1);
    expect(decoded.outlets[0]?.name).toBe("Outlet 1");
  });

  test("updates an outlet", async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "outlet-1",
                merchantId: "merchant-1",
                address: "Jl. Lama",
                isActive: true,
                name: "Outlet Lama",
                receiptAddress: "Jl. Lama",
                receiptName: "Warung Lama",
                timezone: "Asia/Jakarta",
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
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              address: "Jl. Baru",
              createdAt: "2026-05-10T00:00:00.000Z",
              id: "outlet-1",
              isActive: false,
              merchantId: "merchant-1",
              name: "Outlet Baru",
              receiptAddress: "Jl. Baru",
              receiptName: "Warung Baru",
              timezone: "Asia/Jakarta",
              updatedAt: "2026-05-10T00:01:00.000Z",
            },
          ]),
        }),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "sync-event-1",
          },
        ]),
      }),
    });

    const response = await makeProtoRequest("/api/outlets/update", {
      body: OutletUpdateRequest.encode({
        address: "Jl. Baru",
        hasAddress: true,
        hasIsActive: true,
        hasName: true,
        hasReceiptAddress: true,
        hasReceiptName: true,
        id: "outlet-1",
        isActive: false,
        name: "Outlet Baru",
        receiptAddress: "Jl. Baru",
        receiptName: "Warung Baru",
        hasTimezone: true,
        timezone: "Asia/Jakarta",
      }).finish(),
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = OutletUpdateResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.outlet?.name).toBe("Outlet Baru");
    expect(decoded.outlet?.isActive).toBe(false);
    expect(decoded.outlet?.receiptName).toBe("Warung Baru");
  });
});
