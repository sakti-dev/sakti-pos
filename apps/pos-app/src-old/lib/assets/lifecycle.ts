import { listen } from "@tauri-apps/api/event";
import { eq } from "drizzle-orm";
import { db, TABLE } from "~/db/index";
import { AuthStorage } from "~/lib/auth/storage";
import { createLogger } from "~/lib/logger";
import { getSyncClient } from "~/lib/sync";
import { uploadSingleAsset } from "./upload";

const logger = createLogger({ domain: "ASSET", module: "lifecycle" });

interface JobCompletedPayload {
  assetPath: string;
  byteSize: number;
  contentHash: string;
  contentType: string;
  height: number;
  jobId: string;
  originalFilename: string;
  width: number;
}

export async function startAssetLifecycleListener(): Promise<void> {
  await listen<JobCompletedPayload>(
    "image_pipeline://job_completed",
    async (event) => {
      const { jobId, contentHash, byteSize, width, height } = event.payload;

      try {
        const rows = await db
          .select()
          .from(TABLE.assets)
          .where(eq(TABLE.assets.jobId, jobId));

        if (rows.length === 0) {
          logger.warn("compressed_event:no_matching_asset", { jobId });
          return;
        }

        const asset = rows[0];
        const assetId = asset.id;

        await getSyncClient().writeTransaction(db, async (tx) => {
          await tx
            .update(TABLE.assets)
            .set({
              status: "compressed",
              contentHash,
              byteSize,
              width,
              height,
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

        logger.info("asset_marked_compressed", {
          assetId,
          jobId,
          contentHash,
          byteSize,
          width,
          height,
        });

        const sessionToken = await AuthStorage.getToken();
        if (!sessionToken) {
          logger.warn("upload_skipped:no_session_token", { assetId });
          return;
        }

        await uploadSingleAsset(assetId, sessionToken);
      } catch (error: unknown) {
        logger.error("compressed_event:handler_failed", error, { jobId });
      }
    }
  );
}
