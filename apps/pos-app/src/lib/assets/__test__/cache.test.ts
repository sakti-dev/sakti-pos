import { beforeEach, describe, expect, test, vi } from "vitest";

const LEADING_SLASH_RE = /^\//;

const mockInvoke = vi.fn();
const mockConvertFileSrc = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...args),
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
  resolveAssetUrl,
} = await import("~/lib/assets/cache");

describe("asset cache", () => {
  beforeEach(() => {
    resetAssetCacheVersionsForTest();
    mockInvoke.mockReset();
    mockConvertFileSrc.mockReset();
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(LEADING_SLASH_RE, "")}`
    );
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

  test("resolves a cached asset URL via asset protocol", async () => {
    mockInvoke.mockResolvedValue({
      localPath:
        "/data/data/com.sakti-dev.sakti-pos/config/asset-cache/merchant-1/assets/abc123.webp",
      contentType: "image/webp",
    });

    const url = await resolveAssetUrl("asset-1");

    expect(url).toContain("asset.localhost");
    expect(url).toContain("merchant-1/assets/abc123.webp");
    expect(url).toContain("?v=0");
    expect(mockInvoke).toHaveBeenCalledWith("get_cached_asset_path", {
      assetId: "asset-1",
    });
  });

  test("returns null when cached asset path is missing", async () => {
    mockInvoke.mockResolvedValue(null);

    const url = await resolveAssetUrl("asset-missing");
    expect(url).toBeNull();
  });

  test("resolves URL with current cache version as cache buster", async () => {
    notifyAssetCacheReady("asset-1");
    mockInvoke.mockResolvedValue({
      localPath:
        "/data/data/com.sakti-dev.sakti-pos/config/asset-cache/merchant-1/assets/abc123.webp",
      contentType: "image/webp",
    });

    const url = await resolveAssetUrl("asset-1");
    expect(url).toContain("?v=1");
  });

  test("returns null for null or undefined asset id", async () => {
    expect(await resolveAssetUrl(null)).toBeNull();
    expect(await resolveAssetUrl(undefined)).toBeNull();
  });
});
