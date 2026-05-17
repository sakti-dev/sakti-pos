import { render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetAssetCacheVersionsForTest } from "~/lib/assets/cache";

const mockUseImageUrl = vi.fn();

vi.mock("~/lib/assets/adapters/product-images", () => ({
  productImageAdapter: {
    resolveCachedImageUrl: vi.fn(() => Promise.resolve(null)),
    getPendingPreviewUrl: vi.fn(() => Promise.resolve(null)),
    startEventListeners: vi.fn(() => Promise.resolve()),
    stopEventListeners: vi.fn(),
    useImageUrl: (...args: Array<() => string | null | undefined>) =>
      mockUseImageUrl(args[0], args[1]) as () => string | null,
  },
}));

import { ProductImage } from "../image";

describe("ProductImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAssetCacheVersionsForTest();
    mockUseImageUrl.mockReturnValue(() => null);
  });

  test("renders fallback when no image URL is available", () => {
    mockUseImageUrl.mockReturnValue(() => null);

    render(() => (
      <ProductImage
        alt="Nasi goreng"
        class="size-12"
        entityId={null}
        imageAssetId={null}
      />
    ));

    expect(screen.getByText("Foto")).toBeInTheDocument();
    expect(screen.getByText("Foto").classList.toString()).toContain("size-12");
  });

  test("renders image when URL is available", () => {
    mockUseImageUrl.mockReturnValue(
      () => "https://asset.localhost/cached.webp?v=0"
    );

    render(() => (
      <ProductImage
        alt="Nasi goreng"
        class="size-12"
        entityId="product-1"
        imageAssetId="asset-1"
      />
    ));

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("alt", "Nasi goreng");
    expect(img).toHaveAttribute(
      "src",
      "https://asset.localhost/cached.webp?v=0"
    );
    expect(img.classList.toString()).toContain("object-cover");
  });

  test("delegates to adapter useImageUrl hook with accessors", () => {
    mockUseImageUrl.mockReturnValue(() => null);

    render(() => (
      <ProductImage alt="Test" entityId="product-1" imageAssetId="asset-1" />
    ));

    expect(mockUseImageUrl).toHaveBeenCalledTimes(1);
    const callArgs = mockUseImageUrl.mock.calls[0] as unknown as [
      () => string | null | undefined,
      () => string | null | undefined,
    ];
    expect(callArgs[0]()).toBe("asset-1");
    expect(callArgs[1]()).toBe("product-1");
  });
});
