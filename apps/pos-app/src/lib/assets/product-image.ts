/**
 * Product photo entry for the asset pipeline: pick an image, register a
 * pending `assets` row, and kick off background compression. The lifecycle
 * listener (lib/assets/lifecycle.ts) handles job_completed → compressed →
 * R2 upload. Returns the asset id plus a local preview URL for immediate
 * display in the form.
 */

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import { db, TABLE } from "~/db/index";
import { getSyncClient } from "~/lib/api/sync";
import { currentMerchantId } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";

const logger = createLogger({ domain: "ASSET", module: "product-image" });

interface PickImageResponse {
  readonly jobId: string;
  readonly previewMimeType: string;
  readonly previewPath: string;
  readonly stagedSourcePath: string;
}

export interface PickedProductImage {
  readonly assetId: string;
  readonly previewUrl: string;
}

export async function pickProductImage(): Promise<PickedProductImage | null> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    logger.warn("PRODUCT_IMAGE_PICK_FAILED", { reason: "no active merchant" });
    return null;
  }

  let picked: PickImageResponse;
  try {
    picked = await invoke<PickImageResponse>(
      "plugin:image-pipeline|pick_image",
      {
        request: {
          compression: {
            maxLongEdge: 2048,
            previewMaxLongEdge: 800,
            quality: 86,
          },
          pickerMode: "image",
        },
      }
    );
  } catch (error) {
    logger.warn("PRODUCT_IMAGE_PICK_FAILED", { error: String(error) });
    return null;
  }

  const now = dayjs().toISOString();
  const assetId = crypto.randomUUID();
  const objectKey = `merchants/${merchantId}/products/${assetId}`;

  await getSyncClient().writeTransaction(db, async (tx) => {
    await tx.insert(TABLE.assets).values({
      id: assetId,
      merchantId,
      jobId: picked.jobId,
      objectKey,
      originalFilename: "product-image",
      contentType: picked.previewMimeType,
      kind: "productImage",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: assetId,
      table: TABLE.assets,
    });
  });

  try {
    await invoke("plugin:image-pipeline|compress_asset", {
      request: {
        assetId,
        jobId: picked.jobId,
        maxLongEdge: 1600,
        quality: 82,
        stagedSourcePath: picked.stagedSourcePath,
      },
    });
    logger.info("PRODUCT_IMAGE_COMPRESS_ENQUEUED", {
      assetId,
      jobId: picked.jobId,
    });
  } catch (error) {
    logger.warn("PRODUCT_IMAGE_COMPRESS_FAILED", {
      assetId,
      error: String(error),
    });
  }

  return {
    assetId,
    previewUrl: convertFileSrc(picked.previewPath),
  };
}
