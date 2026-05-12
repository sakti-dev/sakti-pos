import { describe, expect, test, vi } from "vitest";

const mockProtoFetch = vi.fn();
const mockInvoke = vi.fn();
vi.mock("~/lib/api/client", () => ({
  protoFetch: (...args: unknown[]) => mockProtoFetch(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const { AssetPresignDownloadRequest } = await import("@repo/protobuf/assets");

const {
  base64ToUint8Array,
  persistCachedAsset,
  pickProductPhoto,
  presignAssetDownload,
  processImageFile,
  prepareLocalProductImageAsset,
  prepareLocalProductImageAssetFromPath,
  readCachedAssetData,
} = await import("../assets");

describe("assets helpers", () => {
  test("base64ToUint8Array decodes base64 payloads", () => {
    const bytes = base64ToUint8Array("SGVsbG8=");
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  test("processImageFile forwards the selected file to rust", async () => {
    mockInvoke.mockResolvedValue({
      byteSize: 100,
      contentHash: "hash-1",
      contentType: "image/webp",
      dataBase64: "d2VicA==",
      height: 600,
      width: 800,
    });

    const file = new File([new Uint8Array([1, 2, 3])], "coffee.png", {
      type: "image/png",
    });

    const result = await processImageFile(file);

    expect(result).toEqual({
      byteSize: 100,
      contentHash: "hash-1",
      contentType: "image/webp",
      dataBase64: "d2VicA==",
      height: 600,
      width: 800,
    });
    expect(mockInvoke).toHaveBeenCalledWith("process_image_to_webp", {
      dataBase64: expect.any(String),
      mimeType: "image/png",
      originalFilename: "coffee.png",
    });
  });

  test("prepareLocalProductImageAsset stores the compressed asset locally", async () => {
    mockInvoke.mockResolvedValue({
      asset: {
        id: "hash-1",
        merchantId: "merchant-1",
        objectKey: "merchant-1/assets/hash-1",
        contentHash: "hash-1",
        contentType: "image/webp",
        byteSize: 5,
        kind: "product_photo",
        originalFilename: "coffee.webp",
        status: "pending_upload",
        createdAt: "2026-05-12T00:00:00.000Z",
        createdByUserId: "",
        deletedAt: "",
        height: 600,
        updatedAt: "2026-05-12T00:00:00.000Z",
        width: 800,
      },
      localPath: "/tmp/cache/merchant-1/assets/hash-1.webp",
    });

    const result = await prepareLocalProductImageAsset({
      byteSize: 5,
      contentHash: "hash-1",
      contentType: "image/webp",
      dataBase64: "SGVsbG8=",
      height: 600,
      kind: "product_photo",
      merchantId: "merchant-1",
      originalFilename: "coffee.webp",
      width: 800,
    });

    expect(result.localPath).toContain("hash-1.webp");
    expect(mockInvoke).toHaveBeenCalledWith(
      "prepare_local_product_image_asset",
      expect.objectContaining({
        byteSize: 5,
        contentHash: "hash-1",
        contentType: "image/webp",
        kind: "product_photo",
        merchantId: "merchant-1",
        originalFilename: "coffee.webp",
      })
    );
  });

  test("pickProductPhoto invokes the native picker with the selected source", async () => {
    mockInvoke.mockResolvedValue({
      path: "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_inputs/photo_1.jpg",
      originalFilename: "photo_1.jpg",
      mimeType: "image/jpeg",
      source: "camera",
    });

    const result = await pickProductPhoto("camera");

    expect(result.source).toBe("camera");
    expect(result.path).toContain("product_photo_inputs");
    expect(mockInvoke).toHaveBeenCalledWith("pick_product_photo", {
      source: "camera",
    });
  });

  test("prepareLocalProductImageAssetFromPath sends only path metadata to Rust", async () => {
    mockInvoke.mockResolvedValue({
      asset: { id: "asset-1", objectKey: "merchant-1/assets/asset-1" },
      localPath: "/tmp/cache/merchant-1/assets/asset-1.webp",
    });

    const result = await prepareLocalProductImageAssetFromPath({
      kind: "product_photo",
      merchantId: "merchant-1",
      originalFilename: "photo_1.jpg",
      path: "/tmp/product_photo_inputs/photo_1.jpg",
    });

    expect(result.asset.id).toBe("asset-1");
    expect(mockInvoke).toHaveBeenCalledWith(
      "prepare_local_product_image_asset_from_path",
      {
        kind: "product_photo",
        merchantId: "merchant-1",
        originalFilename: "photo_1.jpg",
        path: "/tmp/product_photo_inputs/photo_1.jpg",
      }
    );
  });

  test("persistCachedAsset stores the processed webp locally", async () => {
    mockInvoke.mockResolvedValue({
      localPath: "/tmp/cache/merchant-1/assets/asset-1.webp",
      objectKey: "merchant-1/assets/asset-1",
    });

    const result = await persistCachedAsset({
      dataBase64: "d2VicA==",
      objectKey: "merchant-1/assets/asset-1",
    });

    expect(result.localPath).toContain("asset-1.webp");
    expect(mockInvoke).toHaveBeenCalledWith("cache_asset_webp", {
      dataBase64: "d2VicA==",
      objectKey: "merchant-1/assets/asset-1",
    });
  });

  test("readCachedAssetData reads cached asset bytes from Rust", async () => {
    mockInvoke.mockResolvedValue({
      contentType: "image/webp",
      dataBase64: "d2VicA==",
    });

    const result = await readCachedAssetData("asset-1");

    expect(result).toEqual({
      contentType: "image/webp",
      dataBase64: "d2VicA==",
    });
    expect(mockInvoke).toHaveBeenCalledWith("read_cached_asset_data", {
      assetId: "asset-1",
    });
  });

  test("presignAssetDownload requests a signed download url", async () => {
    mockProtoFetch.mockResolvedValue({
      downloadUrl: "https://download.example.test",
    });

    const result = await presignAssetDownload({ assetId: "asset-1" });

    expect(result.downloadUrl).toBe("https://download.example.test");
    expect(mockProtoFetch).toHaveBeenCalledWith(
      "api/assets/presign-download",
      expect.objectContaining({
        req: AssetPresignDownloadRequest,
      }),
      { assetId: "asset-1" }
    );
  });
});
