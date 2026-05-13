import { beforeEach, describe, expect, test, vi } from "vitest";

const mockListen = vi.fn();
const unsubscribeAssetCacheReady = vi.fn();
const unsubscribeAssetAttachmentReady = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

describe("asset event listeners", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockListen
      .mockResolvedValueOnce(unsubscribeAssetCacheReady)
      .mockResolvedValueOnce(unsubscribeAssetAttachmentReady);
  });

  test("listens for generic asset readiness events once", async () => {
    const { startAssetEventListeners } = await import(
      "~/lib/product-images/asset-events"
    );

    await startAssetEventListeners();
    await startAssetEventListeners();

    expect(mockListen).toHaveBeenCalledTimes(2);
    expect(mockListen).toHaveBeenNthCalledWith(
      1,
      "asset-cache-ready",
      expect.any(Function)
    );
    expect(mockListen).toHaveBeenNthCalledWith(
      2,
      "asset-attachment-ready",
      expect.any(Function)
    );
  });

  test("routes generic readiness events to asset and product invalidation stores", async () => {
    const { getAssetCacheVersion, resetAssetCacheVersionsForTest } =
      await import("~/store/asset-cache");
    const { getDomainCatalogVersion, resetDomainCatalogVersionsForTest } =
      await import("~/store/domain-catalog");
    const { startAssetEventListeners } = await import(
      "~/lib/product-images/asset-events"
    );

    resetAssetCacheVersionsForTest();
    resetDomainCatalogVersionsForTest();
    await startAssetEventListeners();

    const cacheHandler = mockListen.mock.calls[0]?.[1] as (event: {
      payload: { asset_id: string };
    }) => void;
    const attachmentHandler = mockListen.mock.calls[1]?.[1] as (event: {
      payload: {
        asset_id: string;
        entity_id: string;
        entity_type: "product";
        field: "image_asset_id";
      };
    }) => void;

    cacheHandler({ payload: { asset_id: "asset-1" } });
    attachmentHandler({
      payload: {
        asset_id: "asset-1",
        entity_id: "product-1",
        entity_type: "product",
        field: "image_asset_id",
      },
    });

    expect(getAssetCacheVersion("asset-1")).toBe(2);
    expect(getDomainCatalogVersion("product")).toBe(1);
  });

  test("unsubscribes all generic asset event listeners", async () => {
    const { startAssetEventListeners, stopAssetEventListeners } = await import(
      "~/lib/product-images/asset-events"
    );

    await startAssetEventListeners();
    stopAssetEventListeners();

    expect(unsubscribeAssetCacheReady).toHaveBeenCalledOnce();
    expect(unsubscribeAssetAttachmentReady).toHaveBeenCalledOnce();
  });
});
