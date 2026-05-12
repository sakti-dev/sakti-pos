import { afterEach, describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("~/db", () => ({ db: {} }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const { hydrateMissingProductImages, resolveCachedProductImageUrl } =
  await import("../cache");

describe("resolveCachedProductImageUrl", () => {
  afterEach(() => {
    mockInvoke.mockReset();
  });

  test("returns null when the product has no image asset", async () => {
    await expect(resolveCachedProductImageUrl(null)).resolves.toBeNull();
  });

  test("returns a data URL for a cached product image", async () => {
    mockInvoke.mockResolvedValue({
      contentType: "image/webp",
      dataBase64: "d2VicA==",
    });

    await expect(resolveCachedProductImageUrl("asset-1")).resolves.toBe(
      "data:image/webp;base64,d2VicA=="
    );
    expect(mockInvoke).toHaveBeenCalledWith("read_cached_asset_data", {
      assetId: "asset-1",
    });
  });

  test("returns null when the cached file is unavailable", async () => {
    mockInvoke.mockResolvedValue(null);

    await expect(resolveCachedProductImageUrl("asset-missing")).resolves.toBe(
      null
    );
  });

  test("does not probe the product image URL with fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mockInvoke.mockResolvedValue({
      contentType: "image/webp",
      dataBase64: "d2VicA==",
    });

    await expect(resolveCachedProductImageUrl("asset-1")).resolves.toBe(
      "data:image/webp;base64,d2VicA=="
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("hydrates missing product images through the native rust command", async () => {
    mockInvoke.mockResolvedValue(2);

    await expect(
      hydrateMissingProductImages({
        apiUrl: "http://localhost:3001",
        merchantId: "merchant-1",
        sessionToken: "token-1",
      })
    ).resolves.toBe(2);

    expect(mockInvoke).toHaveBeenCalledWith("hydrate_product_images", {
      apiUrl: "http://localhost:3001",
      limit: 20,
      merchantId: "merchant-1",
      sessionToken: "token-1",
    });
  });
});
