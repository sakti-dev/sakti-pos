import { eq } from "drizzle-orm";
import { db, TABLE } from "~/db/index";
import { AuthStorage } from "~/lib/auth/storage";
import { createLogger } from "~/lib/logger";
import { getSyncClient } from "~/lib/sync";
import { currentMerchantId } from "~/store/outlet";
import { uploadSingleAsset } from "./upload";

const logger = createLogger({ domain: "ASSET", module: "recovery" });

export async function recoverAssets(): Promise<void> {
  const sessionToken = await AuthStorage.getToken();
  if (!sessionToken) {
    return;
  }

  const merchantId = currentMerchantId();
  if (!merchantId) {
    return;
  }

  let failedCount = 0;
  let uploadedCount = 0;

  // Recover pending assets — staged source is cleaned up after pick,
  // so re-compression isn't possible. Mark as failed.
  const pendingAssets = await db
    .select()
    .from(TABLE.assets)
    .where(eq(TABLE.assets.status, "pending"));

  for (const asset of pendingAssets) {
    try {
      logger.warn("pending_asset:cannot_recover", {
        assetId: asset.id,
        jobId: asset.jobId,
        note: "staged source cleaned up; needs re-picking",
      });

      await getSyncClient().writeTransaction(db, async (tx) => {
        await tx
          .update(TABLE.assets)
          .set({
            status: "failed",
            updatedAt: new Date().toISOString(),
            isSynced: false,
          })
          .where(eq(TABLE.assets.id, asset.id));

        await getSyncClient().enqueueChange(tx, {
          operation: "update",
          rowId: asset.id,
          table: TABLE.assets,
        });
      });

      failedCount++;
    } catch (error: unknown) {
      logger.error("pending_recovery:mark_failed_error", error, {
        assetId: asset.id,
      });
    }
  }

  // Recover compressed assets — retry upload
  const compressedAssets = await db
    .select()
    .from(TABLE.assets)
    .where(eq(TABLE.assets.status, "compressed"));

  for (const asset of compressedAssets) {
    try {
      await uploadSingleAsset(asset.id, sessionToken);
      uploadedCount++;
    } catch (error: unknown) {
      logger.error("compressed_recovery:upload_failed", error, {
        assetId: asset.id,
      });
    }
  }

  if (failedCount > 0 || uploadedCount > 0) {
    logger.info("recovery_complete", {
      pendingMarkedFailed: failedCount,
      compressedRetried: uploadedCount,
    });
  }
}
