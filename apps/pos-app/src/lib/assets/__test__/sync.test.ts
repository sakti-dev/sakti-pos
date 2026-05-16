import { describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const { hydrateMissingAssets, uploadPendingAssets } = await import(
  "~/lib/assets/sync"
);

describe("asset sync", () => {
  test("hydrates missing assets through the native rust command", async () => {
    mockInvoke.mockResolvedValue(2);

    const result = await hydrateMissingAssets({
      apiUrl: "http://localhost:3001",
      merchantId: "merchant-1",
      sessionToken: "token-1",
    });

    expect(result).toBe(2);
    expect(mockInvoke).toHaveBeenCalledWith("hydrate_missing_assets", {
      apiUrl: "http://localhost:3001",
      limit: 20,
      merchantId: "merchant-1",
      sessionToken: "token-1",
    });
  });

  test("uploads pending assets through the native rust command", async () => {
    mockInvoke.mockResolvedValue(5);

    const result = await uploadPendingAssets({
      apiUrl: "http://localhost:3001",
      merchantId: "merchant-1",
      sessionToken: "token-1",
    });

    expect(result).toBe(5);
    expect(mockInvoke).toHaveBeenCalledWith("upload_pending_assets", {
      apiUrl: "http://localhost:3001",
      merchantId: "merchant-1",
      sessionToken: "token-1",
    });
  });
});
