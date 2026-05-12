import { afterEach, describe, expect, test, vi } from "bun:test";
import {
  AssetCompleteUploadRequest,
  AssetCompleteUploadResponse,
  AssetPresignDownloadRequest,
  AssetPresignDownloadResponse,
  AssetPresignUploadRequest,
  AssetPresignUploadResponse,
} from "@repo/protobuf/assets";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockGetSessionFromRequest = vi.fn();
const mockPresignUploadUrl = vi.fn();
const mockPresignDownloadUrl = vi.fn();
const ASSET_OBJECT_KEY_REGEX = /^merchant-1\/assets\//;
const EXISTING_ASSET = {
  byteSize: 12_345,
  contentHash: "a".repeat(64),
  contentType: "image/webp",
  createdAt: "2026-05-10T00:00:00.000Z",
  createdByUserId: null,
  height: 600,
  id: "hash-1",
  kind: "product_photo",
  merchantId: "merchant-1",
  objectKey: "merchant-1/assets/hash-1",
  originalFilename: "coffee.webp",
  status: "ready",
  updatedAt: "2026-05-10T00:00:00.000Z",
  width: 800,
};

vi.mock("../../db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
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
    API_URL: "http://localhost:3001",
    ASSET_S3_BUCKET: "assets",
    ASSET_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    ASSET_S3_REGION: "auto",
    ASSET_S3_ACCESS_KEY_ID: "key",
    ASSET_S3_SECRET_ACCESS_KEY: "secret",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    NODE_ENV: "development",
    TURSO_AUTH_TOKEN: "",
    TURSO_DATABASE_URL: "http://127.0.0.1:8080",
  },
}));

const { assetsRoutes } = await import("../routes");

function mockMerchantAccess() {
  mockSelect
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "membership-1" }]),
        }),
      }),
    })
    .mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }));
}

async function makeProtobufRequest(
  path: string,
  body: Uint8Array,
  options: { cookie?: string } = { cookie: "narvik_session=valid-token" }
) {
  const app = assetsRoutes.compile();
  const headers: Record<string, string> = {
    Accept: "application/x-protobuf",
    "Content-Type": "application/x-protobuf",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  return await app.handle(
    new Request(`http://localhost${path}`, {
      body,
      headers,
      method: "POST",
    })
  );
}

describe("asset protobuf routes", () => {
  afterEach(() => {
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockGetSessionFromRequest.mockReset();
    mockPresignUploadUrl.mockReset();
    mockPresignDownloadUrl.mockReset();
  });

  test("returns 401 when upload presign request has no session", async () => {
    const response = await makeProtobufRequest(
      "/api/assets/presign-upload",
      AssetPresignUploadRequest.encode(
        AssetPresignUploadRequest.create({
          byteSize: 12_345,
          contentHash: "a".repeat(64),
          contentType: "image/webp",
          height: 600,
          kind: "product_photo",
          merchantId: "merchant-1",
          originalFilename: "coffee.webp",
          width: 800,
        })
      ).finish(),
      { cookie: undefined }
    );

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Unauthorized"
    );
  });

  test("returns a protobuf upload url for an accessible merchant", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockMerchantAccess();
    mockPresignUploadUrl.mockResolvedValue("https://upload.example.test");
    let insertedValues: Record<string, unknown> | null = null;
    const insertedAsset = {
      byteSize: 12_345,
      contentHash: "a".repeat(64),
      contentType: "image/webp",
      createdAt: "2026-05-10T00:00:00.000Z",
      createdByUserId: null,
      height: 600,
      id: "asset-1",
      kind: "product_photo",
      merchantId: "merchant-1",
      objectKey: "merchant-1/assets/asset-1",
      originalFilename: "coffee.webp",
      status: "pending_upload",
      updatedAt: "2026-05-10T00:00:00.000Z",
      width: 800,
    };

    mockInsert.mockReturnValue({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues = values;
        return {
          returning: vi.fn().mockResolvedValue([insertedAsset]),
        };
      }),
    });

    const response = await makeProtobufRequest(
      "/api/assets/presign-upload",
      AssetPresignUploadRequest.encode(
        AssetPresignUploadRequest.create({
          byteSize: 12_345,
          contentHash: "a".repeat(64),
          contentType: "image/webp",
          height: 600,
          kind: "product_photo",
          merchantId: "merchant-1",
          originalFilename: "coffee.webp",
          width: 800,
        })
      ).finish()
    );

    expect(response.status).toBe(200);
    const decoded = AssetPresignUploadResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.asset?.id).toBe("asset-1");
    expect(decoded.uploadUrl).toBe("https://upload.example.test");
    expect(decoded.requiredHeaders).toEqual([
      { name: "Content-Type", value: "image/webp" },
    ]);
    expect(insertedValues).toBeTruthy();
    expect(insertedValues).not.toHaveProperty("createdByUserId");
    expect(mockPresignUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        accessKeyId: "key",
        bucket: "assets",
        contentType: "image/webp",
        endpoint: "https://example.r2.cloudflarestorage.com",
        expiresInSeconds: 900,
        method: "PUT",
        objectKey: expect.stringMatching(ASSET_OBJECT_KEY_REGEX),
        region: "auto",
        secretAccessKey: "secret",
      })
    );
  });

  test("reuses an existing ready asset for the same content hash without upload", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockMerchantAccess();
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([EXISTING_ASSET]),
        }),
      }),
    });

    const response = await makeProtobufRequest(
      "/api/assets/presign-upload",
      AssetPresignUploadRequest.encode(
        AssetPresignUploadRequest.create({
          assetId: "hash-1",
          byteSize: 12_345,
          contentHash: "a".repeat(64),
          contentType: "image/webp",
          height: 600,
          kind: "product_photo",
          merchantId: "merchant-1",
          objectKey: "merchant-1/assets/hash-1",
          originalFilename: "coffee.webp",
          width: 800,
        })
      ).finish()
    );

    expect(response.status).toBe(200);
    const decoded = AssetPresignUploadResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.asset?.id).toBe("hash-1");
    expect(decoded.asset?.status).toBe("ready");
    expect(decoded.uploadUrl).toBe("");
    expect(decoded.requiredHeaders).toHaveLength(0);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockPresignUploadUrl).not.toHaveBeenCalled();
  });

  test("retries an existing failed asset for the same content hash", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockMerchantAccess();
    mockPresignUploadUrl.mockResolvedValue("https://upload.example.test");
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ ...EXISTING_ASSET, status: "failed" }]),
        }),
      }),
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { ...EXISTING_ASSET, status: "pending_upload" },
            ]),
        }),
      }),
    });

    const response = await makeProtobufRequest(
      "/api/assets/presign-upload",
      AssetPresignUploadRequest.encode(
        AssetPresignUploadRequest.create({
          assetId: "hash-1",
          byteSize: 12_345,
          contentHash: "a".repeat(64),
          contentType: "image/webp",
          height: 600,
          kind: "product_photo",
          merchantId: "merchant-1",
          objectKey: "merchant-1/assets/hash-1",
          originalFilename: "coffee.webp",
          width: 800,
        })
      ).finish()
    );

    expect(response.status).toBe(200);
    const decoded = AssetPresignUploadResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.asset?.status).toBe("pending_upload");
    expect(decoded.uploadUrl).toBe("https://upload.example.test");
    expect(decoded.requiredHeaders).toEqual([
      { name: "Content-Type", value: "image/webp" },
    ]);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  test("reuses a caller supplied asset id and object key for presign upload", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockMerchantAccess();
    mockPresignUploadUrl.mockResolvedValue("https://upload.example.test");
    const insertedAsset = {
      byteSize: 12_345,
      contentHash: "a".repeat(64),
      contentType: "image/webp",
      createdAt: "2026-05-10T00:00:00.000Z",
      createdByUserId: null,
      height: 600,
      id: "hash-1",
      kind: "product_photo",
      merchantId: "merchant-1",
      objectKey: "merchant-1/assets/hash-1",
      originalFilename: "coffee.webp",
      status: "pending_upload",
      updatedAt: "2026-05-10T00:00:00.000Z",
      width: 800,
    };

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([insertedAsset]),
      }),
    });

    const response = await makeProtobufRequest(
      "/api/assets/presign-upload",
      AssetPresignUploadRequest.encode(
        AssetPresignUploadRequest.create({
          assetId: "hash-1",
          byteSize: 12_345,
          contentHash: "a".repeat(64),
          contentType: "image/webp",
          height: 600,
          kind: "product_photo",
          merchantId: "merchant-1",
          objectKey: "merchant-1/assets/hash-1",
          originalFilename: "coffee.webp",
          width: 800,
        })
      ).finish()
    );

    expect(response.status).toBe(200);
    expect(mockPresignUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: "merchant-1/assets/hash-1",
      })
    );
  });

  test("returns a protobuf download url for an accessible asset", async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "membership-1" }]),
          }),
        }),
      })
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
      });
    mockPresignDownloadUrl.mockResolvedValue("https://download.example.test");

    const response = await makeProtobufRequest(
      "/api/assets/presign-download",
      AssetPresignDownloadRequest.encode(
        AssetPresignDownloadRequest.create({
          assetId: "asset-1",
        })
      ).finish()
    );

    expect(response.status).toBe(200);
    const decoded = AssetPresignDownloadResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.downloadUrl).toBe("https://download.example.test");
    const [presignInput] = mockPresignDownloadUrl.mock.calls[0];
    expect(presignInput).not.toHaveProperty("contentType");
  });

  test("marks the asset ready after upload completion", async () => {
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
                contentHash: "a".repeat(64),
                byteSize: 1234,
                status: "pending_upload",
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "membership-1",
              },
            ]),
          }),
        }),
      });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "asset-1",
              merchantId: "merchant-1",
              objectKey: "merchant-1/assets/asset-1",
              contentHash: "a".repeat(64),
              byteSize: 1234,
              status: "ready",
            },
          ]),
        }),
      }),
    });

    const response = await makeProtobufRequest(
      "/api/assets/complete-upload",
      AssetCompleteUploadRequest.encode(
        AssetCompleteUploadRequest.create({
          assetId: "asset-1",
          byteSize: 1234,
          contentHash: "a".repeat(64),
          objectKey: "merchant-1/assets/asset-1",
        })
      ).finish()
    );

    expect(response.status).toBe(200);
    const decoded = AssetCompleteUploadResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.asset?.status).toBe("ready");
  });
});
