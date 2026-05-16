import { describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const {
  enqueueAssetProcessing,
  prepareLocalImageAsset,
  prepareLocalImageAssetFromPath,
  processImageFile,
  processPendingAssetJobs,
} = await import("~/lib/assets/processing");

describe("asset processing", () => {
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

  test("prepareLocalImageAsset stores a compressed image asset locally", async () => {
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

    const result = await prepareLocalImageAsset({
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
      "prepare_local_image_asset",
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

  test("prepareLocalImageAssetFromPath sends generic path metadata to Rust", async () => {
    mockInvoke.mockResolvedValue({
      asset: { id: "asset-1", objectKey: "merchant-1/assets/asset-1" },
      localPath: "/tmp/cache/merchant-1/assets/asset-1.webp",
    });

    const result = await prepareLocalImageAssetFromPath({
      kind: "product_photo",
      merchantId: "merchant-1",
      originalFilename: "photo_1.jpg",
      path: "/tmp/product_photo_inputs/photo_1.jpg",
    });

    expect(result.asset.id).toBe("asset-1");
    expect(mockInvoke).toHaveBeenCalledWith(
      "prepare_local_image_asset_from_path",
      {
        kind: "product_photo",
        merchantId: "merchant-1",
        originalFilename: "photo_1.jpg",
        path: "/tmp/product_photo_inputs/photo_1.jpg",
      }
    );
  });

  test("enqueueAssetProcessing invokes the generic asset processing command", async () => {
    mockInvoke.mockResolvedValueOnce({ jobId: "job-1" });

    const result = await enqueueAssetProcessing({
      originalFilename: "nasi.jpg",
      processingKind: "image:webp-thumbnail",
      sourceMimeType: "image/jpeg",
      sourcePath: "/tmp/nasi.jpg",
      target: {
        entityId: "product-1",
        entityType: "product",
        field: "image_asset_id",
      },
    });

    expect(result).toEqual({ jobId: "job-1" });
    expect(mockInvoke).toHaveBeenCalledWith("enqueue_asset_processing", {
      request: {
        originalFilename: "nasi.jpg",
        processingKind: "image:webp-thumbnail",
        sourceMimeType: "image/jpeg",
        sourcePath: "/tmp/nasi.jpg",
        target: {
          entityId: "product-1",
          entityType: "product",
          field: "image_asset_id",
        },
      },
    });
  });

  test("processPendingAssetJobs invokes generic processor", async () => {
    mockInvoke.mockResolvedValueOnce(1);

    const result = await processPendingAssetJobs({ limit: 20 });

    expect(result).toBe(1);
    expect(mockInvoke).toHaveBeenCalledWith("process_pending_asset_jobs", {
      limit: 20,
    });
  });
});
