export type {
  AssetAttachmentField,
  AssetEntityType,
  AssetProcessingKind,
  AssetProcessingTarget,
  CachedAssetData,
  EnqueueAssetProcessingInput,
  EnqueueAssetProcessingResult,
  PickedProductPhoto,
  PreparedLocalAsset,
  PresignedDownloadAsset,
  ProcessedImageAsset,
  ProcessedImageResponse,
  ProductPhotoSource,
} from "./types";

export {
  ASSET_ATTACHMENT_TARGETS,
  type AssetAttachmentTargetKey,
  createAssetProcessingTarget,
} from "./targets";

export {
  deleteTempProductPhoto,
  pickProductPhoto,
} from "./picking";

export {
  enqueueAssetProcessing,
  prepareLocalImageAsset,
  prepareLocalImageAssetFromPath,
  processImageFile,
  processPendingAssetJobs,
} from "./processing";

export {
  createWebpPreviewUrl,
  getAssetCacheVersion,
  notifyAssetCacheReady,
  persistCachedAsset,
  readCachedAssetData,
  resetAssetCacheVersionsForTest,
} from "./cache";

export { base64ToUint8Array, toBase64FromBytes } from "./utils";

export {
  hydrateMissingAssets,
  uploadPendingAssets,
} from "./sync";

export { createImageUpload } from "./image-upload";
export type {
  CreateImageUploadOptions,
  ImageUploadState,
} from "./image-upload";
