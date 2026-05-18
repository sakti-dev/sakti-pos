import { SyncStatusRequest, SyncStatusResponse } from "@repo/protobuf/sync";
import { afterEach, describe, expect, test, vi } from "vitest";
import { protoFetch } from "../client";

const originalFetch = globalThis.fetch;

vi.mock("~/lib/auth/storage", () => ({
  AuthStorage: {
    getToken: vi.fn(),
  },
}));

describe("protoFetch", () => {
  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("posts protobuf request and decodes protobuf response", async () => {
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

      const requestBody = SyncStatusRequest.decode(
        new Uint8Array(await request.arrayBuffer())
      );
      expect(requestBody).toEqual({
        cursor: "sync:10:products:p123",
        outletId: "outlet-1",
      });

      const responseBody = SyncStatusResponse.encode(
        SyncStatusResponse.create({
          changedTables: ["products"],
          hasChanges: true,
          cursor: "sync:12:products:p456",
        })
      ).finish();

      return new Response(responseBody, {
        headers: { "Content-Type": "application/x-protobuf" },
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await protoFetch(
      "api/sync/status",
      { req: SyncStatusRequest, res: SyncStatusResponse },
      SyncStatusRequest.create({
        cursor: "sync:10:products:p123",
        outletId: "outlet-1",
      })
    );

    expect(result.cursor).toBe("sync:12:products:p456");
    expect(result.changedTables).toEqual(["products"]);
  });
});
