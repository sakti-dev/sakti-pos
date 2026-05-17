import { describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const {
  enqueueAssetProcessing,
  prepareLocalImageAssetFromPath,
  processPendingAssetJobs,
} = await import("~/lib/assets/processing");

describe("asset processing", () => {
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
