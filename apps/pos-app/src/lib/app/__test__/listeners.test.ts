import { describe, expect, test, vi } from "vitest";

const mockStartAssetEventListeners = vi.fn();

vi.mock("~/lib/product-images/asset-events", () => ({
  startAssetEventListeners: (...args: unknown[]) =>
    mockStartAssetEventListeners(...args),
}));

describe("app event listeners", () => {
  test("starts generic asset event listeners without awaiting startup", async () => {
    mockStartAssetEventListeners.mockResolvedValue(undefined);

    const { startAppEventListeners } = await import("~/lib/app/listeners");

    startAppEventListeners();

    expect(mockStartAssetEventListeners).toHaveBeenCalledOnce();
  });
});
