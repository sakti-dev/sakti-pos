import { createStore } from "solid-js/store";
import { createLogger } from "~/lib/logger";

const [assetVersions, setAssetVersions] = createStore<Record<string, number>>(
  {}
);
const assetCacheLogger = createLogger({
  domain: "ASSET",
  module: "asset-cache",
});

export function getAssetCacheVersion(
  assetId: null | string | undefined
): number {
  if (!assetId) {
    return 0;
  }

  return assetVersions[assetId] ?? 0;
}

export function notifyAssetCacheReady(assetId: string): void {
  if (!assetId) {
    return;
  }

  assetCacheLogger.info("asset_cache_version_increment", {
    assetId,
    nextVersion: (assetVersions[assetId] ?? 0) + 1,
    previousVersion: assetVersions[assetId] ?? 0,
  });
  setAssetVersions(assetId, (version) => (version ?? 0) + 1);
}

export function resetAssetCacheVersionsForTest(): void {
  for (const assetId of Object.keys(assetVersions)) {
    setAssetVersions(assetId, undefined as never);
  }
}
