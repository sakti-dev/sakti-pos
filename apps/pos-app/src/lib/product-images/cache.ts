import { invoke } from "@tauri-apps/api/core";
import { readCachedAssetData } from "~/lib/assets";
import { createLogger } from "~/lib/logger";

const productImageCacheLogger = createLogger({
  domain: "PHOTO",
  module: "product-image-cache",
});

export async function resolveCachedProductImageUrl(
  imageAssetId: string | null | undefined
): Promise<string | null> {
  if (!imageAssetId) {
    productImageCacheLogger.info("resolve_cached_image_skipped_no_asset");
    return null;
  }

  productImageCacheLogger.info("resolve_cached_image_started", {
    assetId: imageAssetId,
  });
  const asset = await readCachedAssetData(imageAssetId);
  if (!asset) {
    productImageCacheLogger.info("resolve_cached_image_missing", {
      assetId: imageAssetId,
    });
    return null;
  }

  productImageCacheLogger.info("resolve_cached_image_found", {
    assetId: imageAssetId,
    contentType: asset.contentType,
  });
  return `data:${asset.contentType};base64,${asset.dataBase64}`;
}

export async function hydrateMissingProductImages(input: {
  apiUrl: string;
  limit?: number;
  merchantId: string;
  sessionToken: string;
}): Promise<number> {
  return await invoke<number>("hydrate_missing_assets", {
    apiUrl: input.apiUrl,
    limit: input.limit ?? 20,
    merchantId: input.merchantId,
    sessionToken: input.sessionToken,
  });
}
