import { beforeEach, describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
const mockListen = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
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
    mockListen.mockResolvedValue(unsubscribeMock);
  });

  test("resolves a cached product image URL", async () => {
    mockInvoke.mockResolvedValue({
      contentType: "image/webp",
      dataBase64: "d2VicA==",
    });

    const url = await productImageAdapter.resolveCachedImageUrl("asset-1");
    expect(url).toBe("data:image/webp;base64,d2VicA==");
  });

  test("gets pending product photo preview URL", async () => {
    mockInvoke.mockResolvedValue({
      previewBase64: "cHJldmlldw==",
      previewMimeType: "image/jpeg",
    });

    const url = await productImageAdapter.getPendingPreviewUrl("product-1");
    expect(url).toBe("data:image/jpeg;base64,cHJldmlldw==");
  });

  test("starts and stops event listeners", async () => {
    await productImageAdapter.startEventListeners();
    expect(mockListen).toHaveBeenCalledTimes(2);

    productImageAdapter.stopEventListeners();
    expect(unsubscribeMock).toHaveBeenCalledTimes(2);
  });

  test("notifies domain catalog on attachment ready", async () => {
    const { resetDomainCatalogVersionsForTest, getDomainCatalogVersion } =
      await import("~/store/domain-catalog");
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
