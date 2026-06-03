import type {
  AssetAttachmentField,
  AssetEntityType,
  AssetProcessingTarget,
} from "./targets";

export interface Asset {
  byteSize: number;
  contentHash: string;
  contentType: string;
  createdAt: string;
  height: number | null;
  id: string;
  kind: string;
  merchantId: string;
  objectKey: string;
  originalFilename: string | null;
  status: string;
  updatedAt: string;
  width: number | null;
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

export type ProductPhotoSource = "camera" | "gallery";

export interface PickedProductPhoto {
  mimeType: string;
  originalFilename: string;
  path: string;
  source: ProductPhotoSource;
}
