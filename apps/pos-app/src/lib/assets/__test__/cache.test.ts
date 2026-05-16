import { beforeEach, describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const {
  getAssetCacheVersion,
  getDomainCatalogVersion,
  notifyAssetCacheReady,
  notifyAssetAttachmentReady,
  persistCachedAsset,
  readCachedAssetData,
  resetAssetCacheVersionsForTest,
} = await import("~/lib/assets/cache");

describe("asset cache", () => {
  beforeEach(() => {
    resetAssetCacheVersionsForTest();
    mockInvoke.mockReset();
  });

  test("reads cached asset bytes from Rust", async () => {
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

  test("persists cached asset locally", async () => {
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

  test("starts unknown and empty asset ids at version zero", () => {
    expect(getAssetCacheVersion("asset-1")).toBe(0);
    expect(getAssetCacheVersion(null)).toBe(0);
    expect(getAssetCacheVersion(undefined)).toBe(0);
  });

  test("increments only the ready asset cache version", () => {
    notifyAssetCacheReady("asset-1");
    notifyAssetCacheReady("asset-1");
    notifyAssetCacheReady("asset-2");

    expect(getAssetCacheVersion("asset-1")).toBe(2);
    expect(getAssetCacheVersion("asset-2")).toBe(1);
  });

  test("increments domain catalog version for product asset attachments", () => {
    expect(getDomainCatalogVersion("product")).toBe(0);

    notifyAssetAttachmentReady({
      assetId: "asset-1",
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });

    expect(getDomainCatalogVersion("product")).toBe(1);
  });
});
