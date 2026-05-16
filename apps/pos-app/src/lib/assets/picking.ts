import { invoke } from "@tauri-apps/api/core";
import type { PickedProductPhoto, ProductPhotoSource } from "./types";

export async function pickProductPhoto(
  source: ProductPhotoSource
): Promise<PickedProductPhoto> {
  return await invoke<PickedProductPhoto>("pick_product_photo", { source });
}

export async function deleteTempProductPhoto(path: string): Promise<void> {
  await invoke("delete_temp_product_photo", { path });
}
