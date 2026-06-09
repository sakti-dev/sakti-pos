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
  status: "pending" | "processing";
}

const photoLogger = createLogger({
  domain: "PHOTO",
  module: "plugin-bridge",
});

/**
 * Bridge to the plugin-owned image picker.
 *
 * This is the app-side entry point that calls the plugin's `pick_image` command.
 * The plugin handles native picker, preview staging, and background compression.
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
    previewMimeType: response.previewMimeType,
    previewPath: response.previewPath,
    status: response.status,
  });

  return response;
}
