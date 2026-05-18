import { SyncStatusRequest, SyncStatusResponse } from "@repo/protobuf/sync";
import { afterEach, describe, expect, test, vi } from "vitest";

const originalFetch = globalThis.fetch;

vi.mock("~/lib/auth/storage", () => ({
  AuthStorage: {
    getToken: vi.fn(),
  },
}));

describe("getSyncStatus", () => {
  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("posts protobuf status request and decodes protobuf response", async () => {
    const { getSyncStatus } = await import("../sync?actual" as "../sync");
    const { AuthStorage } = await import("~/lib/auth/storage");
    (AuthStorage.getToken as ReturnType<typeof vi.fn>).mockResolvedValue(
      "test-token"
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as unknown as Request;
      expect(request.method).toBe("POST");
      expect(request.headers.get("content-type")).toBe(
        "application/x-protobuf"
      );
      expect(request.headers.get("accept")).toBe("application/x-protobuf");
      expect(request.headers.get("authorization")).toBe("Bearer test-token");
      const responseBody = SyncStatusResponse.encode(
        SyncStatusResponse.create({
          changedTables: ["products"],
          hasChanges: true,
          cursor: "sync:12:products:p456",
        })
      ).finish();

      expect(
        SyncStatusRequest.decode(new Uint8Array(await request.arrayBuffer()))
      ).toEqual({
        cursor: "sync:10:products:p123",
        outletId: "outlet-1",
      });

      return new Response(responseBody, {
        headers: { "Content-Type": "application/x-protobuf" },
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await getSyncStatus({
      cursor: "sync:10:products:p123",
      outletId: "outlet-1",
    });

    expect(result).toEqual({
      changedTables: ["products"],
      hasChanges: true,
      cursor: "sync:12:products:p456",
    });
  });

  test("passes through an empty cursor unchanged", async () => {
    const { getSyncStatus } = await import("../sync?actual" as "../sync");
    const { AuthStorage } = await import("~/lib/auth/storage");
    (AuthStorage.getToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const request = input as unknown as Request;
      expect(request.headers.get("authorization")).toBeNull();
      const responseBody = SyncStatusResponse.encode(
        SyncStatusResponse.create({
          changedTables: [],
          hasChanges: false,
          cursor: "",
        })
      ).finish();

      return Promise.resolve(
        new Response(responseBody, {
          headers: { "Content-Type": "application/x-protobuf" },
          status: 200,
        })
      );
    }) as typeof fetch;

    const result = await getSyncStatus({
      cursor: "",
      outletId: "outlet-1",
    });

    expect(result.cursor).toBe("");
  });
});
