import { beforeEach, describe, expect, test, vi } from "vitest";

const LEADING_SLASH_RE = /^\//;

const mockInvoke = vi.fn();
const mockConvertFileSrc = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...args),
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Static import — vi.mock above hoists and intercepts the calls.
import { resolveAssetUrl } from "~/lib/assets/cache";

describe("resolveAssetUrl", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockConvertFileSrc.mockReset();
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(LEADING_SLASH_RE, "")}`
    );
  });

  test("returns null for null asset id", async () => {
    expect(await resolveAssetUrl(null)).toBeNull();
  });

  test("returns null for undefined asset id", async () => {
    expect(await resolveAssetUrl(undefined)).toBeNull();
  });

  test("returns null for empty string asset id", async () => {
    expect(await resolveAssetUrl("")).toBeNull();
  });

  test("resolves a cached asset URL via asset protocol", async () => {
    mockInvoke.mockResolvedValue({
      localPath:
        "/data/data/com.sakti-dev.sakti-pos/config/asset-cache/assets/abc123.webp",
    });

    const url = await resolveAssetUrl("asset-1");

    expect(url).toContain("asset.localhost");
    expect(url).toContain("abc123.webp");
    expect(mockInvoke).toHaveBeenCalledWith(
      "plugin:image-pipeline|get_asset_path",
      { assetId: "asset-1", jobId: null }
    );
  });

  test("returns null when cached asset path is missing", async () => {
    mockInvoke.mockResolvedValue(null);

    const url = await resolveAssetUrl("asset-missing");
    expect(url).toBeNull();
  });
});
