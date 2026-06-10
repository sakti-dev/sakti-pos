import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "~/lib/logger";

export interface PickImageCompressionOptions {
  maxLongEdge: number;
  previewMaxLongEdge: number;
  quality: number;
}

export interface PickImageRequest {
  compression: PickImageCompressionOptions;
  pickerMode: string;
}

export interface PickImageResponse {
  jobId: string;
  previewMimeType: string;
  previewPath: string;
  stagedSourcePath: string;
}

export interface CompressAssetRequest {
  assetId: string;
  jobId: string;
  maxLongEdge: number;
  quality: number;
  stagedSourcePath: string;
}

export interface CompressAssetResponse {
  jobId: string;
}

export interface DeleteAssetRequest {
  assetPath: string;
}

const photoLogger = createLogger({
  domain: "PHOTO",
  module: "plugin-bridge",
});

/**
 * Bridge to the plugin-owned image picker.
 *
 * Opens the native picker, stages the source file, and generates a preview.
 * Does NOT start compression — call `pluginCompressAsset` at submit time.
 */
export async function pluginPickImage(
  request: PickImageRequest
): Promise<PickImageResponse> {
  photoLogger.info("pick_image_command_invoked", {
    maxLongEdge: request.compression.maxLongEdge,
    pickerMode: request.pickerMode,
    previewMaxLongEdge: request.compression.previewMaxLongEdge,
    quality: request.compression.quality,
  });

  const response = await invoke<PickImageResponse>(
    "plugin:image-pipeline|pick_image",
    {
      request,
    }
  );

  photoLogger.info("pick_image_command_returned", {
    jobId: response.jobId,
    stagedSourcePath: response.stagedSourcePath,
    previewMimeType: response.previewMimeType,
    previewPath: response.previewPath,
  });

  return response;
}

/**
 * Trigger background compression for a staged source image.
 * Emits `image_pipeline://job_completed` when done.
 */
export async function pluginCompressAsset(
  request: CompressAssetRequest
): Promise<CompressAssetResponse> {
  photoLogger.info("compress_asset_command_invoked", {
    jobId: request.jobId,
    maxLongEdge: request.maxLongEdge,
    quality: request.quality,
  });

  const response = await invoke<CompressAssetResponse>(
    "plugin:image-pipeline|compress_asset",
    { request }
  );

  photoLogger.info("compress_asset_command_returned", {
    jobId: response.jobId,
  });

  return response;
}

/**
 * Delete an asset file at the given path. Idempotent — no error if file doesn't exist.
 */
export async function pluginDeleteAsset(
  request: DeleteAssetRequest
): Promise<void> {
  photoLogger.info("delete_asset_command_invoked", {
    assetPath: request.assetPath,
  });

  await invoke<void>("plugin:image-pipeline|delete_asset", { request });

  photoLogger.info("delete_asset_command_returned", {
    assetPath: request.assetPath,
  });
}
