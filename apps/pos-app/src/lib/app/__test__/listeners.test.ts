import { describe, expect, test, vi } from "vitest";

const mockStartAssetLifecycleListener = vi.fn();

vi.mock("~/lib/assets/lifecycle", () => ({
  startAssetLifecycleListener: (...args: unknown[]) =>
    mockStartAssetLifecycleListener(...args),
}));

describe("app event listeners", () => {
  test("starts asset lifecycle listener without awaiting startup", async () => {
    mockStartAssetLifecycleListener.mockResolvedValue(undefined);

    const { startAppEventListeners } = await import("~/lib/app/listeners");

    startAppEventListeners();

    expect(mockStartAssetLifecycleListener).toHaveBeenCalledOnce();
  });
});
