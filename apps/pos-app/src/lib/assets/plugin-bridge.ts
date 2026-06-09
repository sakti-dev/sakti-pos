import { invoke } from "@tauri-apps/api/core";
import type {
  PickImageRequest,
  PickImageResponse,
} from "tauri-plugin-image-pipeline/guest-js";

/**
 * Bridge to the plugin-owned image picker.
 *
 * This is the app-side entry point that calls the plugin's `pick_image` command.
 * The plugin handles native picker, preview staging, and background compression.
 */
export async function pluginPickImage(
  request: PickImageRequest
): Promise<PickImageResponse> {
  return await invoke<PickImageResponse>("plugin:image-pipeline|pick_image", {
    request,
  });
}
