import { afterEach, describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const { pickProductPhoto } = await import("~/lib/assets/picking");

describe("asset picking", () => {
  afterEach(() => {
    mockInvoke.mockReset();
  });

  test("invokes native camera picker", async () => {
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

  test("invokes native gallery picker", async () => {
    mockInvoke.mockResolvedValue({
      path: "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_inputs/gallery_1.jpg",
      originalFilename: "gallery_1.jpg",
      mimeType: "image/jpeg",
      source: "gallery",
    });

    const result = await pickProductPhoto("gallery");

    expect(result.source).toBe("gallery");
    expect(mockInvoke).toHaveBeenCalledWith("pick_product_photo", {
      source: "gallery",
    });
  });
});
