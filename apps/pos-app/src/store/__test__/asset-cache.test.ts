import { beforeEach, describe, expect, test } from "vitest";
import {
  getAssetCacheVersion,
  notifyAssetCacheReady,
  resetAssetCacheVersionsForTest,
} from "~/lib/assets/cache";

describe("asset cache invalidation", () => {
  beforeEach(() => {
    resetAssetCacheVersionsForTest();
  });

  test("starts unknown and empty asset ids at version zero", () => {
    expect(getAssetCacheVersion("asset-1")).toBe(0);
    expect(getAssetCacheVersion(null)).toBe(0);
    expect(getAssetCacheVersion(undefined)).toBe(0);
  });

  test("increments only the ready asset cache version", () => {
    notifyAssetCacheReady("asset-1");
    notifyAssetCacheReady("asset-1");
    notifyAssetCacheReady("asset-2");

    expect(getAssetCacheVersion("asset-1")).toBe(2);
    expect(getAssetCacheVersion("asset-2")).toBe(1);
  });
});
