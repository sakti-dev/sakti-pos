import { render, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  notifyAssetCacheReady,
  resetAssetCacheVersionsForTest,
} from "~/lib/assets/cache";
import { ProductImage } from "../product-image";

const mockResolveCachedImageUrl = vi.fn();

vi.mock("~/lib/assets/adapters/product-images", () => ({
  productImageAdapter: {
    resolveCachedImageUrl: (...args: unknown[]) =>
      mockResolveCachedImageUrl(...args),
    getPendingPreviewUrl: vi.fn(() => Promise.resolve(null)),
    startEventListeners: vi.fn(() => Promise.resolve()),
    stopEventListeners: vi.fn(),
  },
}));

describe("ProductImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAssetCacheVersionsForTest();
    mockResolveCachedImageUrl.mockResolvedValue(null);
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
      expect(mockResolveCachedImageUrl).toHaveBeenCalledWith("asset-1")
    );

    notifyAssetCacheReady("asset-1");

    await waitFor(() =>
      expect(mockResolveCachedImageUrl).toHaveBeenCalledTimes(2)
    );
  });
});
