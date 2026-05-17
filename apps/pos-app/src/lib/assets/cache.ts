import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { createStore } from "solid-js/store";
import { createLogger } from "~/lib/logger";
import type {
  AssetAttachmentField,
  AssetEntityType,
  CachedAssetData,
} from "./types";
import { base64ToUint8Array } from "./utils";

export type { AssetAttachmentField, AssetEntityType };

const [assetVersions, setAssetVersions] = createStore<Record<string, number>>(
  {}
);

const [domainVersions, setDomainVersions] = createStore<
  Partial<Record<AssetEntityType, number>>
>({});

const assetCacheLogger = createLogger({
  domain: "ASSET",
  module: "asset-cache",
});

export async function readCachedAssetData(
  assetId: string
): Promise<CachedAssetData | null> {
  return await invoke<CachedAssetData | null>("read_cached_asset_data", {
    assetId,
  });
}

export async function resolveAssetUrl(
  assetId: string | null | undefined
): Promise<string | null> {
  if (!assetId) {
    return null;
  }

  const result = await invoke<{
    localPath: string;
    contentType: string;
  } | null>("get_cached_asset_path", { assetId });

  if (!result) {
    return null;
  }

  const baseUrl = convertFileSrc(result.localPath);
  const version = getAssetCacheVersion(assetId);
  return `${baseUrl}?v=${version}`;
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
  for (const entityType of Object.keys(domainVersions) as AssetEntityType[]) {
    setDomainVersions(entityType, undefined);
  }
}

export const resetDomainCatalogVersionsForTest = resetAssetCacheVersionsForTest;

export function getDomainCatalogVersion(entityType: AssetEntityType): number {
  return domainVersions[entityType] ?? 0;
}

export function notifyAssetAttachmentReady(input: {
  assetId: string;
  entityId: string;
  entityType: AssetEntityType;
  field: AssetAttachmentField;
}): void {
  if (input.entityType === "product") {
    assetCacheLogger.info("domain_catalog_version_increment", {
      assetId: input.assetId,
      entityId: input.entityId,
      entityType: input.entityType,
      field: input.field,
      nextVersion: (domainVersions.product ?? 0) + 1,
      previousVersion: domainVersions.product ?? 0,
    });
    setDomainVersions("product", (version) => (version ?? 0) + 1);
  }
}
