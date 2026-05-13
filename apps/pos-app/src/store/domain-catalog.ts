import { createStore } from "solid-js/store";
import { createLogger } from "~/lib/logger";

export type AssetEntityType = "product";
export type AssetAttachmentField = "image_asset_id";

interface AssetAttachmentReadyInput {
  assetId: string;
  entityId: string;
  entityType: AssetEntityType;
  field: AssetAttachmentField;
}

const [domainVersions, setDomainVersions] = createStore<
  Partial<Record<AssetEntityType, number>>
>({});
const domainCatalogLogger = createLogger({
  domain: "ASSET",
  module: "domain-catalog",
});

export function getDomainCatalogVersion(entityType: AssetEntityType): number {
  return domainVersions[entityType] ?? 0;
}

export function notifyAssetAttachmentReady(
  input: AssetAttachmentReadyInput
): void {
  if (input.entityType === "product") {
    domainCatalogLogger.info("domain_catalog_version_increment", {
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

export function resetDomainCatalogVersionsForTest(): void {
  setDomainVersions("product", undefined);
}
