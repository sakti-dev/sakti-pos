import { beforeEach, describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
const mockConvertFileSrc = vi.fn();
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

const { createAssetAdapter } = await import("~/lib/assets/create-adapter");

describe("createAssetAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(unsubscribeMock);
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
  });

  test("resolves a cached image URL via asset protocol", async () => {
    mockInvoke.mockResolvedValue({
      localPath: "/data/config/asset-cache/merchant-1/assets/abc123.webp",
      contentType: "image/webp",
    });

    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    const url = await adapter.resolveCachedImageUrl("asset-1");
    expect(url).toContain("asset.localhost");
    expect(url).toContain("abc123.webp");
    expect(url).toContain("?v=0");
    expect(mockInvoke).toHaveBeenCalledWith("get_cached_asset_path", {
      assetId: "asset-1",
    });
  });

  test("returns null when cached image is missing", async () => {
    mockInvoke.mockResolvedValue(null);

    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    const url = await adapter.resolveCachedImageUrl("asset-missing");
    expect(url).toBeNull();
  });

  test("returns null for null asset id", async () => {
    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    const url = await adapter.resolveCachedImageUrl(null);
    expect(url).toBeNull();
  });

  test("gets pending preview URL via asset protocol", async () => {
    mockInvoke.mockResolvedValue({
      previewPath: "/data/cache/product_photo_inputs/pending_preview_job1.jpg",
      previewMimeType: "image/jpeg",
    });

    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    const url = await adapter.getPendingPreviewUrl("product-1");
    expect(url).toContain("asset.localhost");
    expect(url).toContain("pending_preview_job1.jpg");
    expect(mockInvoke).toHaveBeenCalledWith("get_pending_preview_path", {
      productId: "product-1",
    });
  });

  test("returns null when no pending preview exists", async () => {
    mockInvoke.mockResolvedValue(null);

    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    const url = await adapter.getPendingPreviewUrl("entity-1");
    expect(url).toBeNull();
  });

  test("starts event listeners for cache-ready and attachment-ready", async () => {
    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    await adapter.startEventListeners();

    expect(mockListen).toHaveBeenCalledTimes(2);
    expect(mockListen).toHaveBeenCalledWith(
      "asset-cache-ready",
      expect.any(Function)
    );
    expect(mockListen).toHaveBeenCalledWith(
      "asset-attachment-ready",
      expect.any(Function)
    );
  });

  test("does not start listeners twice", async () => {
    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    await adapter.startEventListeners();
    await adapter.startEventListeners();

    expect(mockListen).toHaveBeenCalledTimes(2);
  });

  test("stops all event listeners", async () => {
    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    await adapter.startEventListeners();
    adapter.stopEventListeners();

    expect(unsubscribeMock).toHaveBeenCalledTimes(2);
  });

  test("calls onAttachmentReady when attachment-ready event fires", async () => {
    const onAttachmentReady = vi.fn();
    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
      onAttachmentReady,
    });

    await adapter.startEventListeners();

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

    expect(onAttachmentReady).toHaveBeenCalledWith({
      assetId: "asset-1",
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });
  });
});
