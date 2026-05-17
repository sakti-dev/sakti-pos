import { beforeEach, describe, expect, test, vi } from "vitest";

const mockConvertFileSrc = vi.fn();
const mockInvoke = vi.fn();
const mockListen = vi.fn();
const unsubscribeMock = vi.fn();
const leadingSlashRegex = /^\//;

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...args),
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

const { productImageAdapter } = await import(
  "~/lib/assets/adapters/product-images"
);

describe("product image adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
    mockListen.mockResolvedValue(unsubscribeMock);
  });

  test("resolves a cached product image URL", async () => {
    mockInvoke.mockResolvedValue({
      localPath: "/data/config/asset-cache/merchant-1/assets/abc123.webp",
      contentType: "image/webp",
    });

    const url = await productImageAdapter.resolveCachedImageUrl("asset-1");
    expect(url).toContain("asset.localhost");
    expect(url).toContain("abc123.webp");
    expect(url).toContain("?v=0");
  });

  test("gets pending product photo preview URL", async () => {
    mockInvoke.mockResolvedValue({
      previewPath: "/data/cache/product_photo_inputs/pending_preview_job1.jpg",
      previewMimeType: "image/jpeg",
    });

    const url = await productImageAdapter.getPendingPreviewUrl("product-1");
    expect(url).toContain("asset.localhost");
    expect(url).toContain("pending_preview_job1.jpg");
  });

  test("starts and stops event listeners", async () => {
    await productImageAdapter.startEventListeners();
    expect(mockListen).toHaveBeenCalledTimes(2);

    productImageAdapter.stopEventListeners();
    expect(unsubscribeMock).toHaveBeenCalledTimes(2);
  });

  test("notifies domain catalog on attachment ready", async () => {
    const { resetDomainCatalogVersionsForTest, getDomainCatalogVersion } =
      await import("~/lib/assets/cache");
    resetDomainCatalogVersionsForTest();

    await productImageAdapter.startEventListeners();

    const attachmentHandler = mockListen.mock.calls[1]?.[1] as (event: {
      payload: {
        asset_id: string;
        entity_id: string;
        entity_type: string;
        field: string;
      };
    }) => void;

    attachmentHandler({
      payload: {
        asset_id: "asset-1",
        entity_id: "product-1",
        entity_type: "product",
        field: "image_asset_id",
      },
    });

    expect(getDomainCatalogVersion("product")).toBe(1);
  });
});
