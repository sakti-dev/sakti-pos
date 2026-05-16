export const ASSET_ATTACHMENT_TARGETS = {
  productImage: {
    entityType: "product",
    field: "image_asset_id",
  },
} as const;

export type AssetAttachmentTargetKey =
  keyof typeof ASSET_ATTACHMENT_TARGETS;
export type AssetEntityType =
  (typeof ASSET_ATTACHMENT_TARGETS)[AssetAttachmentTargetKey]["entityType"];
export type AssetAttachmentField =
  (typeof ASSET_ATTACHMENT_TARGETS)[AssetAttachmentTargetKey]["field"];

export interface AssetProcessingTarget {
  entityId: string;
  entityType: AssetEntityType;
  field: AssetAttachmentField;
}

export function createAssetProcessingTarget(
  key: AssetAttachmentTargetKey,
  entityId: string
): AssetProcessingTarget {
  const target = ASSET_ATTACHMENT_TARGETS[key];
  return {
    entityId,
    entityType: target.entityType,
    field: target.field,
  };
}
