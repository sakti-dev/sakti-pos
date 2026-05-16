import { invoke } from "@tauri-apps/api/core";
import type {
  EnqueueAssetProcessingInput,
  EnqueueAssetProcessingResult,
  PreparedLocalAsset,
  ProcessedImageResponse,
} from "./types";
import { bytesToBase64 } from "./utils";
import { createLogger } from "~/lib/logger";

const assetLogger = createLogger({
  domain: "ASSET",
  module: "assets",
});

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
