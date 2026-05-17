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
  getPendingPreviewVersion,
  notifyAssetCacheReady,
  notifyAssetAttachmentReady,
  resetAssetCacheVersionsForTest,
  resolveAssetUrl,
  resolvePendingPreviewUrl,
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
    expect(getPendingPreviewVersion("product", "product-1")).toBe(0);

    notifyAssetAttachmentReady({
      assetId: "asset-1",
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });

    expect(getDomainCatalogVersion("product")).toBe(1);
    expect(getPendingPreviewVersion("product", "product-1")).toBe(1);
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

  test("resolves pending preview URL via asset protocol", async () => {
    mockInvoke.mockResolvedValue({
      previewPath:
        "/data/data/com.sakti-dev.sakti-pos/cache/product_photo_inputs/pending_preview_job1.jpg",
      previewMimeType: "image/jpeg",
    });

    const url = await resolvePendingPreviewUrl("product-1");

    expect(url).toContain("asset.localhost");
    expect(url).toContain("pending_preview_job1.jpg");
    expect(mockInvoke).toHaveBeenCalledWith("get_pending_preview_path", {
      productId: "product-1",
    });
  });

  test("returns null when no pending preview exists", async () => {
    mockInvoke.mockResolvedValue(null);

    const url = await resolvePendingPreviewUrl("product-missing");
    expect(url).toBeNull();
  });

  test("returns null for null or undefined entity id", async () => {
    expect(await resolvePendingPreviewUrl(null)).toBeNull();
    expect(await resolvePendingPreviewUrl(undefined)).toBeNull();
  });
});
