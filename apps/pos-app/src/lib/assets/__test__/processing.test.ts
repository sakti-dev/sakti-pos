import { describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const { enqueueAssetProcessing, processPendingAssetJobs } = await import(
  "~/lib/assets/processing"
);

describe("asset processing", () => {
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
