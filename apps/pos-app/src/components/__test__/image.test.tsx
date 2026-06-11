import { render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockResolveAssetUrl = vi.fn();

vi.mock("~/lib/assets/cache", () => ({
  resolveAssetUrl: (...args: unknown[]) => mockResolveAssetUrl(...args),
}));

import { ProductImage } from "../image";

describe("ProductImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAssetUrl.mockResolvedValue(null);
  });

  test("renders fallback when no image URL is available", () => {
    render(() => (
      <ProductImage
        alt="Nasi goreng"
        class="size-12"
        entityId={null}
        imageAssetId={null}
      />
    ));

    const fallback = screen.getByText("Foto");
    expect(fallback).toBeInTheDocument();
    expect(fallback.closest("div")!.classList.toString()).toContain("size-12");
  });

  test("renders image when resolveAssetUrl returns a URL", async () => {
    mockResolveAssetUrl.mockResolvedValue(
      "https://asset.localhost/cached.webp"
    );

    render(() => (
      <ProductImage
        alt="Nasi goreng"
        class="h-16 w-full rounded-md"
        entityId="product-1"
        imageAssetId="asset-1"
        loading="lazy"
      />
    ));

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("alt", "Nasi goreng");
    expect(img).toHaveAttribute("src", "https://asset.localhost/cached.webp");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img.classList.toString()).toContain("object-cover");
    expect(img.classList.toString()).toContain("h-16");
    expect(img.classList.toString()).toContain("w-full");
  });

  test("calls resolveAssetUrl with imageAssetId on mount", () => {
    mockResolveAssetUrl.mockResolvedValue(null);

    render(() => (
      <ProductImage alt="Test" entityId="product-1" imageAssetId="asset-1" />
    ));

    expect(mockResolveAssetUrl).toHaveBeenCalledWith("asset-1");
  });
});
