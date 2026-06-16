import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import { and, eq } from "drizzle-orm";
import { db, TABLE } from "~/db/index";
import { API_URL } from "~/lib/api/eden";
import { createLogger } from "~/lib/logger";
import { getSyncClient } from "~/lib/sync";

const logger = createLogger({ domain: "ASSET", module: "upload" });

/**
 * Upload a single compressed asset to R2 via presigned URL.
 *
 * 1. Verify asset exists and is in 'compressed' status
 * 2. Get presigned PUT URL from API (no DB writes on API side)
 * 3. Read compressed file and PUT to R2
 * 4. Mark asset as 'ready' locally via baresync writeTransaction
 * 5. Sync pushes the update to the API DB
 *
 * Returns true on success, false on any recoverable failure
 * (asset stays 'compressed' for retry).
 */
export async function uploadSingleAsset(
  assetId: string,
  sessionToken: string
): Promise<boolean> {
  const rows = await db
    .select()
    .from(TABLE.assets)
    .where(eq(TABLE.assets.id, assetId));

  if (rows.length === 0) {
    logger.warn("upload:asset_not_found", { assetId });
    return false;
  }

  const asset = rows[0];
  if (asset.status !== "compressed") {
    logger.warn("upload:wrong_status", { assetId, status: asset.status });
    return false;
  }

  // Step 1: Get presigned upload URL (API does NOT write to DB)
  const presignRes = await httpFetch(`${API_URL}/api/assets/presign-upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      merchantId: asset.merchantId,
      contentType: asset.contentType,
      assetId: asset.id,
      objectKey: asset.objectKey,
    }),
  });

  if (!presignRes.ok) {
    const errorBody = await presignRes.text().catch(() => "unreadable");
    logger.error("upload:presign_failed", {
      assetId,
      error: errorBody,
      status: presignRes.status,
    });
    return false;
  }

  const presignData = await presignRes.json();
  const uploadUrl: string | undefined = presignData.uploadUrl;
  const objectKey: string = presignData.objectKey;

  // Step 2: Upload to R2 if URL provided (skip if already uploaded)
  if (uploadUrl) {
    const pathResult = await invoke<{
      localPath: string;
      contentType: string;
    } | null>("plugin:image-pipeline|get_asset_path", { assetId });

    if (!pathResult) {
      logger.error("upload:no_local_file", { assetId });
      return false;
    }

    const assetUrl = convertFileSrc(pathResult.localPath);
    const fileRes = await fetch(assetUrl);
    if (!fileRes.ok) {
      logger.error("upload:file_read_failed", {
        assetId,
        status: fileRes.status,
      });
      return false;
    }
    const fileBytes = await fileRes.arrayBuffer();
    const putRes = await httpFetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": asset.contentType ?? "image/webp",
      },
      body: fileBytes,
    });

    if (!putRes.ok) {
      logger.error("upload:s3_put_failed", {
        assetId,
        status: putRes.status,
      });
      return false;
    }
  }

  // Step 3: Mark asset ready in local DB — sync will push to API
  await getSyncClient().writeTransaction(db, async (tx) => {
    await tx
      .update(TABLE.assets)
      .set({
        status: "ready",
        objectKey,
        updatedAt: new Date().toISOString(),
        isSynced: false,
      })
      .where(eq(TABLE.assets.id, assetId));

    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: assetId,
      table: TABLE.assets,
    });
  });

  logger.info("upload:success", { assetId, objectKey });
  return true;
}

/**
 * Upload all compressed assets for a merchant.
 * Returns the count of successfully uploaded assets.
 */
export async function uploadPendingAssets(
  merchantId: string,
  sessionToken: string
): Promise<number> {
  const pending = await db
    .select({ id: TABLE.assets.id })
    .from(TABLE.assets)
    .where(
      and(
        eq(TABLE.assets.merchantId, merchantId),
        eq(TABLE.assets.status, "compressed")
      )
    );

  let successCount = 0;

  for (const row of pending) {
    const ok = await uploadSingleAsset(row.id, sessionToken);
    if (ok) {
      successCount++;
    }
  }

  return successCount;
}
