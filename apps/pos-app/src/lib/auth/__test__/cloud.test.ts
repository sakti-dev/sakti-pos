import {
  StaffCurrentRequest,
  StaffCurrentResponse,
} from "@repo/protobuf/staff";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../storage", () => ({
  AuthStorage: {
    getToken: vi.fn(() => Promise.resolve(null)),
    saveToken: vi.fn(() => Promise.resolve()),
    clearToken: vi.fn(() => Promise.resolve()),
  },
}));

const originalFetch = globalThis.fetch;

describe("isCloudAuthenticated", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  test("returns false when no token stored", async () => {
    const { isCloudAuthenticated } = await import("../cloud");
    expect(await isCloudAuthenticated()).toBe(false);
  });

  test("returns true when token exists", async () => {
    const { AuthStorage } = await import("../storage");
    (AuthStorage.getToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      "test-token"
    );
    const { isCloudAuthenticated } = await import("../cloud");
    expect(await isCloudAuthenticated()).toBe(true);
  });

  test("getCurrentCloudStaff posts to staff me endpoint", async () => {
    let capturedRequest: Request | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      capturedRequest = (input as unknown as Request).clone();
      return Promise.resolve(
        new Response(
          StaffCurrentResponse.encode({
            claimed: false,
            hasStaff: true,
            reason: "",
            staff: {
              createdAt: "2026-05-10T00:00:00.000Z",
              hasOutletId: true,
              hasPin: true,
              id: "staff-1",
              isActive: true,
              merchantId: "merchant-1",
              name: "Owner",
              outletId: "outlet-1",
              role: "owner",
              updatedAt: "2026-05-10T00:00:00.000Z",
            },
          }).finish(),
          {
            status: 200,
            headers: { "Content-Type": "application/x-protobuf" },
          }
        )
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { getCurrentCloudStaff } = await import("../cloud");
    const result = await getCurrentCloudStaff("merchant-1");

    const request = capturedRequest as unknown as Request;
    expect(request.url).toContain("/api/staff/current");
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("application/x-protobuf");
    expect(
      StaffCurrentRequest.decode(new Uint8Array(await request.arrayBuffer()))
    ).toEqual({ merchantId: "merchant-1" });
    expect(result.staff?.id).toBe("staff-1");
  });
});
