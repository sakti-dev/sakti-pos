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

const { createAssetAdapter } = await import("~/lib/assets/create-adapter");

describe("createAssetAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(unsubscribeMock);
  });

  test("resolves a cached image URL for the configured entity", async () => {
    mockInvoke.mockResolvedValue({
      contentType: "image/webp",
      dataBase64: "d2VicA==",
    });

    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    const url = await adapter.resolveCachedImageUrl("asset-1");
    expect(url).toBe("data:image/webp;base64,d2VicA==");
    expect(mockInvoke).toHaveBeenCalledWith("read_cached_asset_data", {
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

  test("gets pending preview URL for an entity using configured param name", async () => {
    mockInvoke.mockResolvedValue({
      previewBase64: "cHJldmlldw==",
      previewMimeType: "image/jpeg",
    });

    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    const url = await adapter.getPendingPreviewUrl("product-1");
    expect(url).toBe("data:image/jpeg;base64,cHJldmlldw==");
    expect(mockInvoke).toHaveBeenCalledWith("get_pending_asset_preview", {
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
