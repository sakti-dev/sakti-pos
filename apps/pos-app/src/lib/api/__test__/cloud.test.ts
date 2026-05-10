import { AuthLoginRequest, AuthResponse } from "@repo/protobuf/auth";
import {
  MerchantCreateRequest,
  MerchantCreateResponse,
} from "@repo/protobuf/merchants";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("~/lib/auth/storage", () => ({
  AuthStorage: {
    getToken: vi.fn().mockResolvedValue("token-1"),
  },
}));

const { authApi } = await import("../auth");
const { merchantsApi } = await import("../merchants");

describe("domain protobuf API clients", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("authApi.login sends protobuf and decodes protobuf response", async () => {
    let capturedRequest: Request | null = null;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      capturedRequest = (input as Request).clone();
      return Promise.resolve(
        new Response(
          AuthResponse.encode({
            sessionToken: "session-1",
            user: { email: "owner@example.com", id: "user-1", name: "Owner" },
          }).finish(),
          {
            headers: { "Content-Type": "application/x-protobuf" },
            status: 200,
          }
        )
      );
    });

    const result = await authApi.login({
      email: "owner@example.com",
      password: "secret",
    });

    const request = capturedRequest as unknown as Request;
    const decoded = AuthLoginRequest.decode(
      new Uint8Array(await request.arrayBuffer())
    );

    expect(request.headers.get("Content-Type")).toBe("application/x-protobuf");
    expect(request.url).toContain("/api/auth/login");
    expect(decoded.email).toBe("owner@example.com");
    expect(result.sessionToken).toBe("session-1");
  });

  test("merchantsApi.create sends protobuf and decodes protobuf response", async () => {
    let capturedRequest: Request | null = null;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      capturedRequest = (input as Request).clone();
      return Promise.resolve(
        new Response(
          MerchantCreateResponse.encode({
            merchant: {
              createdAt: "2026-05-10T00:00:00.000Z",
              id: "merchant-1",
              name: "Warung",
              updatedAt: "2026-05-10T00:00:00.000Z",
            },
          }).finish(),
          {
            headers: { "Content-Type": "application/x-protobuf" },
            status: 200,
          }
        )
      );
    });

    const result = await merchantsApi.create({ name: "Warung" });

    const request = capturedRequest as unknown as Request;
    const decoded = MerchantCreateRequest.decode(
      new Uint8Array(await request.arrayBuffer())
    );

    expect(request.url).toContain("/api/merchants/create");
    expect(decoded.name).toBe("Warung");
    expect(result.merchant?.id).toBe("merchant-1");
  });
});
