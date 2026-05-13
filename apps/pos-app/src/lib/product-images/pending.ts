import { invoke } from "@tauri-apps/api/core";

interface PendingProductPhotoPreview {
  previewBase64: string;
  previewMimeType: string;
}

export async function getPendingProductPhotoPreviewUrl(
  productId: string | null | undefined
): Promise<string | null> {
  if (!productId) {
    return null;
  }

  const preview = await invoke<PendingProductPhotoPreview | null>(
    "get_pending_product_photo_preview",
    { productId }
  );

  if (!preview?.previewBase64) {
    return null;
  }

  return `data:${preview.previewMimeType};base64,${preview.previewBase64}`;
}
