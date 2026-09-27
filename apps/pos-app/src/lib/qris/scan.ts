/**
 * QRIS image scanning — pick a photo via the image-pipeline plugin, decode
 * the QR payload with jsqr, and clean up the staged file. Pure WebView side;
 * no asset rows are created (the QRIS payload is stored as text).
 */

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import jsQR from "jsqr";
import { createLogger } from "~/lib/utils";

const logger = createLogger({ domain: "SETTINGS", module: "qris-scan" });

interface PickImageResponse {
  readonly jobId: string;
  readonly previewMimeType: string;
  readonly previewPath: string;
  readonly stagedSourcePath: string;
}

export type ScanFailure = "pick-failed" | "image-load-failed" | "no-qr-found";

export type ScanResult =
  | { readonly ok: true; readonly payload: string }
  | { readonly ok: false; readonly reason: ScanFailure };

/** Pick an image (native gallery/photo picker) and decode its QR payload. */
export async function scanQRISFromPicker(): Promise<ScanResult> {
  let staged: PickImageResponse | null = null;

  try {
    staged = await invoke<PickImageResponse>(
      "plugin:image-pipeline|pick_image",
      {
        request: {
          compression: {
            maxLongEdge: 2048,
            previewMaxLongEdge: 1600,
            quality: 92,
          },
          pickerMode: "image",
        },
      }
    );
  } catch (error) {
    logger.warn("QRIS_SCAN_PICK_FAILED", { error: String(error) });
    return { ok: false, reason: "pick-failed" };
  }

  try {
    const payload = await decodeQRFromImageUrl(
      convertFileSrc(staged.previewPath)
    );
    if (payload === null) {
      logger.info("QRIS_SCAN_NO_QR_FOUND", { jobId: staged.jobId });
      return { ok: false, reason: "no-qr-found" };
    }
    logger.info("QRIS_SCAN_DECODED", {
      length: payload.length,
      jobId: staged.jobId,
    });
    return { ok: true, payload };
  } catch (error) {
    logger.warn("QRIS_SCAN_IMAGE_LOAD_FAILED", { error: String(error) });
    return { ok: false, reason: "image-load-failed" };
  } finally {
    await cleanupStagedFile(staged.stagedSourcePath);
  }
}

/** Decode a QR code from an image URL readable by the WebView. */
export async function decodeQRFromImageUrl(
  url: string
): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch image failed: ${res.status}`);
  }
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("canvas 2d context unavailable");
    }
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const decoded = jsQR(imageData.data, imageData.width, imageData.height);
    return decoded?.data ?? null;
  } finally {
    bitmap.close();
  }
}

async function cleanupStagedFile(stagedSourcePath: string): Promise<void> {
  try {
    await invoke("plugin:image-pipeline|delete_asset", {
      request: { assetPath: stagedSourcePath },
    });
  } catch (error) {
    logger.warn("QRIS_SCAN_CLEANUP_FAILED", { error: String(error) });
  }
}
