import { invoke } from "@tauri-apps/api/core";
import { readCachedAssetData } from "~/lib/assets";

export async function resolveCachedProductImageUrl(
  imageAssetId: string | null | undefined
): Promise<string | null> {
  if (!imageAssetId) {
    return null;
  }

  const asset = await readCachedAssetData(imageAssetId);
  if (!asset) {
    return null;
  }

  return `data:${asset.contentType};base64,${asset.dataBase64}`;
}

export async function hydrateMissingProductImages(input: {
  apiUrl: string;
  limit?: number;
  merchantId: string;
  sessionToken: string;
}): Promise<number> {
  return await invoke<number>("hydrate_product_images", {
    apiUrl: input.apiUrl,
    limit: input.limit ?? 20,
    merchantId: input.merchantId,
    sessionToken: input.sessionToken,
  });
}
