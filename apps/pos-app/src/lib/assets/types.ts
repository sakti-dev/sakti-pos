import type {
  AssetAttachmentField,
  AssetEntityType,
  AssetProcessingTarget,
} from "./targets";

export type AssetProcessingKind = "image:webp-thumbnail";
export type { AssetAttachmentField, AssetEntityType, AssetProcessingTarget };

export interface EnqueueAssetProcessingInput {
  originalFilename: string;
  processingKind: AssetProcessingKind;
  sourceMimeType?: string | null;
  sourcePath: string;
  target: AssetProcessingTarget;
}

export interface EnqueueAssetProcessingResult {
  jobId: string;
}
