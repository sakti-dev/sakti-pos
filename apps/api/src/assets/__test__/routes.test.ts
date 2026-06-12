import { afterEach, describe, expect, test, vi } from "bun:test";

const mockSelect = vi.fn();
const mockGetSessionFromRequest = vi.fn();
const mockPresignUploadUrl = vi.fn();
const mockPresignDownloadUrl = vi.fn();

vi.mock("../../db", () => ({
  db: {
    select: () => mockSelect(),
  },
  assets: {
    id: "id",
    merchantId: "merchantId",
    objectKey: "objectKey",
    contentHash: "contentHash",
    byteSize: "byteSize",
    contentType: "contentType",
    kind: "kind",
  },
  userMerchants: {
    userId: "userId",
    merchantId: "merchantId",
  },
}));

vi.mock("../../lib/session", () => ({
  getSessionFromRequest: (...args: unknown[]) =>
    mockGetSessionFromRequest(...args),
}));

vi.mock("../../lib/s3-presign", () => ({
  presignS3Url: (...args: unknown[]) => mockPresignUploadUrl(...args),
  presignS3DownloadUrl: (...args: unknown[]) => mockPresignDownloadUrl(...args),
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    ASSET_S3_ACCESS_KEY_ID: "key",
    ASSET_S3_SECRET_ACCESS_KEY: "secret",
    ASSET_S3_BUCKET: "assets",
    ASSET_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    ASSET_S3_REGION: "auto",
  },
}));

// cloudflare:workers only exists at runtime; must import after vi.mock is hoisted
const { assetsRoutes } = await import("../routes");

function mockMerchantAccess() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: "membership-1" }]),
      }),
    }),
  });
}

function makeJsonRequest(
  path: string,
  body: unknown,
  options: { cookie?: string } = { cookie: "narvik_session=valid-token" }
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }
  return assetsRoutes.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
}

describe("asset JSON routes", () => {
  afterEach(() => {
    mockSelect.mockReset();
    mockGetSessionFromRequest.mockReset();
    mockPresignUploadUrl.mockReset();
    mockPresignDownloadUrl.mockReset();
  });

  test("returns 401 when upload presign request has no session", async () => {
    const response = await makeJsonRequest(
      "/api/assets/presign-upload",
      {
        merchantId: "merchant-1",
        contentType: "image/webp",
      },
      { cookie: undefined }
    );

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Unauthorized"
    );
  });

  test("returns presigned URL without DB writes for new asset", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockMerchantAccess();
    // Collision guard: no existing row
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockPresignUploadUrl.mockResolvedValue("https://upload.example.test");

    const response = await makeJsonRequest("/api/assets/presign-upload", {
      merchantId: "merchant-1",
      contentType: "image/webp",
      assetId: "asset-1",
      objectKey: "merchant-1/assets/asset-1",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.uploadUrl).toBe("https://upload.example.test");
    expect(decoded.objectKey).toBe("merchant-1/assets/asset-1");
    expect(decoded.requiredHeaders).toEqual([
      { name: "Content-Type", value: "image/webp" },
    ]);
    expect(mockPresignUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: "merchant-1/assets/asset-1",
        contentType: "image/webp",
        method: "PUT",
      })
    );
  });

  test("generates objectKey from merchantId and assetId when not provided", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockMerchantAccess();
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockPresignUploadUrl.mockResolvedValue("https://upload.example.test");

    const response = await makeJsonRequest("/api/assets/presign-upload", {
      merchantId: "merchant-1",
      contentType: "image/webp",
      assetId: "my-asset",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.objectKey).toBe("merchant-1/assets/my-asset");
  });

  test("returns a JSON download URL for an accessible asset", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "asset-1",
                merchantId: "merchant-1",
                objectKey: "merchant-1/assets/asset-1",
                contentType: "image/webp",
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "membership-1" }]),
          }),
        }),
      });
    mockPresignDownloadUrl.mockResolvedValue("https://download.example.test");

    const response = await makeJsonRequest("/api/assets/presign-download", {
      assetId: "asset-1",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.downloadUrl).toBe("https://download.example.test");
  });
});
