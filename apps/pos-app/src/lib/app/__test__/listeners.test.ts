import { describe, expect, test, vi } from "vitest";

const mockStartEventListeners = vi.fn();

vi.mock("~/lib/assets/adapters/product-images", () => ({
  productImageAdapter: {
    startEventListeners: (...args: unknown[]) =>
      mockStartEventListeners(...args),
    stopEventListeners: vi.fn(),
    resolveCachedImageUrl: vi.fn(() => Promise.resolve(null)),
    getPendingPreviewUrl: vi.fn(() => Promise.resolve(null)),
  },
}));

describe("app event listeners", () => {
  test("starts generic asset event listeners without awaiting startup", async () => {
    mockStartEventListeners.mockResolvedValue(undefined);

    const { startAppEventListeners } = await import("~/lib/app/listeners");

    startAppEventListeners();

    expect(mockStartEventListeners).toHaveBeenCalledOnce();
  });
});
