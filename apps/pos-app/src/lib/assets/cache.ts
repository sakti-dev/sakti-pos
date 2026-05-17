import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { createStore } from "solid-js/store";
import { createLogger } from "~/lib/logger";
import type { AssetAttachmentField, AssetEntityType } from "./types";

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

export async function resolvePendingPreviewUrl(
  entityId: string | null | undefined
): Promise<string | null> {
  if (!entityId) {
    return null;
  }

  const result = await invoke<{
    previewPath: string;
    previewMimeType: string;
  } | null>("get_pending_preview_path", { productId: entityId });

  if (!result) {
    return null;
  }

  return convertFileSrc(result.previewPath);
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
