import type { Asset } from "@repo/protobuf/assets";
import type {
  AssetAttachmentField,
  AssetEntityType,
  AssetProcessingTarget,
} from "./targets";

export interface ProcessedImageAsset {
  byteSize: number;
  contentHash: string;
  contentType: string;
  dataBase64: string;
  height: number;
  width: number;
}

export interface PresignedDownloadAsset {
  downloadUrl: string;
}

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

export interface CachedAssetData {
  contentType: string;
  dataBase64: string;
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

export interface ProcessedImageResponse {
  byteSize: number;
  contentHash: string;
  contentType: string;
  dataBase64: string;
  height: number;
  width: number;
}

export interface PendingAssetPreview {
  previewBase64: string;
  previewMimeType: string;
}
