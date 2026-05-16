import { describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const { getPendingProductPhotoPreviewUrl } = await import("../pending");

describe("pending product photo previews", () => {
  test("builds a data url from pending preview bytes", async () => {
    mockInvoke.mockResolvedValue({
      previewBase64: "cHJldmlldw==",
      previewMimeType: "image/jpeg",
    });

    await expect(getPendingProductPhotoPreviewUrl("product-1")).resolves.toBe(
      "data:image/jpeg;base64,cHJldmlldw=="
    );
    expect(mockInvoke).toHaveBeenCalledWith("get_pending_asset_preview", {
      productId: "product-1",
    });
  });

  test("returns null when no pending preview exists", async () => {
    mockInvoke.mockResolvedValue(null);

    await expect(getPendingProductPhotoPreviewUrl("product-1")).resolves.toBe(
      null
    );
  });
});
