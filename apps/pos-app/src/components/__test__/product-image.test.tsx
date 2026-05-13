import { render, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  notifyAssetCacheReady,
  resetAssetCacheVersionsForTest,
} from "~/store/asset-cache";
import { ProductImage } from "../product-image";

const mockResolveCachedProductImageUrl = vi.fn();

vi.mock("~/lib/product-images/cache", () => ({
  resolveCachedProductImageUrl: (...args: unknown[]) =>
    mockResolveCachedProductImageUrl(...args),
}));

vi.mock("~/lib/product-images/pending", () => ({
  getPendingProductPhotoPreviewUrl: vi.fn(() => Promise.resolve(null)),
}));

describe("ProductImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAssetCacheVersionsForTest();
    mockResolveCachedProductImageUrl.mockResolvedValue(null);
  });

  test("reruns cached image lookup when an asset cache event arrives", async () => {
    render(() => (
      <ProductImage
        alt="Nasi goreng"
        imageAssetId="asset-1"
        productId="product-1"
      />
    ));

    await waitFor(() =>
      expect(mockResolveCachedProductImageUrl).toHaveBeenCalledWith("asset-1")
    );

    notifyAssetCacheReady("asset-1");

    await waitFor(() =>
      expect(mockResolveCachedProductImageUrl).toHaveBeenCalledTimes(2)
    );
  });
});
