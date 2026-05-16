import { invoke } from "@tauri-apps/api/core";
import { createStore } from "solid-js/store";
import { base64ToUint8Array } from "./utils";
import type { CachedAssetData } from "./types";
import { createLogger } from "~/lib/logger";

const [assetVersions, setAssetVersions] = createStore<Record<string, number>>(
  {}
);

export async function readCachedAssetData(
  assetId: string
): Promise<CachedAssetData | null> {
  return await invoke<CachedAssetData | null>("read_cached_asset_data", {
    assetId,
  });
}

export async function persistCachedAsset(input: {
  dataBase64: string;
  objectKey: string;
}): Promise<{ localPath: string; objectKey: string }> {
  return await invoke<{ localPath: string; objectKey: string }>(
    "cache_asset_webp",
    {
      dataBase64: input.dataBase64,
      objectKey: input.objectKey,
    }
  );
}

export function createWebpPreviewUrl(dataBase64: string): string {
  const bytes = base64ToUint8Array(dataBase64);
  const blob = new Blob(
    [
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
    ],
    { type: "image/webp" }
  );
  return URL.createObjectURL(blob);
}

export function getAssetCacheVersion(
  assetId: null | string | undefined
): number {
  if (!assetId) {
    return 0;
  }

  return assetVersions[assetId] ?? 0;
}

const assetCacheLogger = createLogger({
  domain: "ASSET",
  module: "asset-cache",
});

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
