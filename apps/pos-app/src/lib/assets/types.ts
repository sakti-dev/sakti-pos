import type { Asset } from "@repo/protobuf/assets";
import type {
  AssetAttachmentField,
  AssetEntityType,
  AssetProcessingTarget,
} from "./targets";

export interface PreparedLocalAsset {
  asset: Asset;
  dataBase64?: string;
  localPath: string;
}

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

export type ProductPhotoSource = "camera" | "gallery";

export interface PickedProductPhoto {
  mimeType: string;
  originalFilename: string;
  path: string;
  previewBase64?: string;
  previewMimeType?: string;
  source: ProductPhotoSource;
}
