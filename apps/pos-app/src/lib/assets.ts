import type { Asset } from "@repo/protobuf/assets";
import {
  AssetPresignDownloadRequest,
  AssetPresignDownloadResponse,
} from "@repo/protobuf/assets";
import { invoke } from "@tauri-apps/api/core";
import { protoFetch } from "~/lib/api/client";
import type {
  AssetAttachmentField,
  AssetEntityType,
  AssetProcessingTarget,
} from "~/lib/assets/targets";
import { createLogger } from "~/lib/logger";

const assetLogger = createLogger({
  domain: "ASSET",
  module: "assets",
});

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function fileToBase64(file: File): Promise<string> {
  if (typeof FileReader === "undefined") {
    const buffer = await file.arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
  }

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
        return;
      }
      reject(new Error("Failed to read image file"));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read image file"));
    };
    reader.readAsArrayBuffer(file);
  });
  return bytesToBase64(new Uint8Array(buffer));
}

export async function processImageFile(
  file: File
): Promise<ProcessedImageResponse> {
  const dataBase64 = await fileToBase64(file);
  return await invoke<ProcessedImageResponse>("process_image_to_webp", {
    dataBase64,
    mimeType: file.type,
    originalFilename: file.name,
  });
}

export async function pickProductPhoto(
  source: ProductPhotoSource
): Promise<PickedProductPhoto> {
  return await invoke<PickedProductPhoto>("pick_product_photo", { source });
}

export async function deleteTempProductPhoto(path: string): Promise<void> {
  await invoke("delete_temp_product_photo", { path });
}

export async function presignAssetDownload(input: {
  assetId: string;
}): Promise<PresignedDownloadAsset> {
  return await protoFetch(
    "api/assets/presign-download",
    { req: AssetPresignDownloadRequest, res: AssetPresignDownloadResponse },
    { assetId: input.assetId }
  );
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

export async function readCachedAssetData(
  assetId: string
): Promise<CachedAssetData | null> {
  return await invoke<CachedAssetData | null>("read_cached_asset_data", {
    assetId,
  });
}

export async function prepareLocalImageAsset(input: {
  byteSize: number;
  contentHash: string;
  contentType: string;
  dataBase64: string;
  height: number;
  kind: string;
  merchantId: string;
  originalFilename: string;
  width: number;
}): Promise<PreparedLocalAsset> {
  return await invoke<PreparedLocalAsset>("prepare_local_image_asset", {
    byteSize: input.byteSize,
    contentHash: input.contentHash,
    contentType: input.contentType,
    dataBase64: input.dataBase64,
    height: input.height,
    kind: input.kind,
    merchantId: input.merchantId,
    originalFilename: input.originalFilename,
    width: input.width,
  });
}

export async function prepareLocalImageAssetFromPath(input: {
  kind: string;
  merchantId: string;
  originalFilename: string;
  path: string;
}): Promise<PreparedLocalAsset> {
  return await invoke<PreparedLocalAsset>(
    "prepare_local_image_asset_from_path",
    {
      kind: input.kind,
      merchantId: input.merchantId,
      originalFilename: input.originalFilename,
      path: input.path,
    }
  );
}

export async function enqueueAssetProcessing(
  input: EnqueueAssetProcessingInput
): Promise<EnqueueAssetProcessingResult> {
  assetLogger.info("enqueue_asset_processing_invoke", {
    entityId: input.target.entityId,
    entityType: input.target.entityType,
    field: input.target.field,
    originalFilename: input.originalFilename,
    processingKind: input.processingKind,
    sourceMimeType: input.sourceMimeType ?? null,
    sourcePath: input.sourcePath,
  });
  try {
    const result = await invoke<EnqueueAssetProcessingResult>(
      "enqueue_asset_processing",
      { request: input }
    );
    assetLogger.info("enqueue_asset_processing_result", {
      entityId: input.target.entityId,
      jobId: result.jobId,
    });
    return result;
  } catch (error) {
    assetLogger.error("enqueue_asset_processing_failed", error, {
      entityId: input.target.entityId,
      sourcePath: input.sourcePath,
    });
    throw error;
  }
}

export async function processPendingAssetJobs(
  input: { limit?: number } = {}
): Promise<number> {
  const limit = input.limit ?? 20;
  assetLogger.info("process_pending_asset_jobs_invoke", { limit });
  try {
    const processedCount = await invoke<number>("process_pending_asset_jobs", {
      limit,
    });
    assetLogger.info("process_pending_asset_jobs_result", { processedCount });
    return processedCount;
  } catch (error) {
    assetLogger.error("process_pending_asset_jobs_failed", error, { limit });
    throw error;
  }
}

export function createWebpPreviewUrl(dataBase64: string): string {
  const bytes = base64ToUint8Array(dataBase64);
  const blob = new Blob([toArrayBuffer(bytes)], { type: "image/webp" });
  return URL.createObjectURL(blob);
}

export function toBase64FromBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}
