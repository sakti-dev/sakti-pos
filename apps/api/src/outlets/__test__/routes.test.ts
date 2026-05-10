import { afterEach, describe, expect, test, vi } from "bun:test";
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

vi.mock("../../db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
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
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when no session", async () => {
    const response = await makeProtoRequest("/api/outlets/create", {
      body: OutletCreateRequest.encode({
        address: "",
        hasAddress: false,
        merchantId: "merchant-1",
        name: "Test Outlet",
      }).finish(),
    });

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Unauthorized"
    );
  });

  test("creates outlet and default register", async () => {
    mockValidateSession.mockResolvedValue({
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

    const now = new Date().toISOString();
    let insertCallCount = 0;
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          insertCallCount += 1;
          if (insertCallCount === 1) {
            return [
              {
                address: null,
                createdAt: now,
                id: "outlet-1",
                isActive: true,
                merchantId: "merchant-1",
                name: "Test Outlet",
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
        address: "",
        hasAddress: false,
        merchantId: "merchant-1",
        name: "Test Outlet",
      }).finish(),
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = OutletCreateResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.outlet?.name).toBe("Test Outlet");
    expect(decoded.register?.name).toBe("Register 1");
  });

  test("lists merchant outlets", async () => {
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
                id: "outlet-1",
                merchantId: "merchant-1",
                address: "Jl. Lama",
                isActive: true,
                name: "Outlet Lama",
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
              updatedAt: "2026-05-10T00:01:00.000Z",
            },
          ]),
        }),
      }),
    });

    const response = await makeProtoRequest("/api/outlets/update", {
      body: OutletUpdateRequest.encode({
        address: "Jl. Baru",
        hasAddress: true,
        hasIsActive: true,
        hasName: true,
        id: "outlet-1",
        isActive: false,
        name: "Outlet Baru",
      }).finish(),
      cookie: "narvik_session=valid-token",
    });

    expect(response.status).toBe(200);
    const decoded = OutletUpdateResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.outlet?.name).toBe("Outlet Baru");
    expect(decoded.outlet?.isActive).toBe(false);
  });
});
