import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "~/lib/logger";
import type {
  EnqueueAssetProcessingInput,
  EnqueueAssetProcessingResult,
} from "./types";

const assetLogger = createLogger({
  domain: "ASSET",
  module: "assets",
});

export async function enqueueAssetProcessing(
  input: EnqueueAssetProcessingInput
): Promise<EnqueueAssetProcessingResult> {
  assetLogger.info("enqueue_asset_processing_invoke", {
    entityId: input.target.entityId,
    entityType: input.target.entityType,
    field: input.target.field,
    originalFilename: input.originalFilename,
    processingKind: input.processingKind,
    sourceMimeType: input.sourceMimeType ?? null,
    sourcePath: input.sourcePath,
  });
  try {
    const result = await invoke<EnqueueAssetProcessingResult>(
      "enqueue_asset_processing",
      { request: input }
    );
    assetLogger.info("enqueue_asset_processing_result", {
      entityId: input.target.entityId,
      jobId: result.jobId,
    });
    return result;
  } catch (error) {
    assetLogger.error("enqueue_asset_processing_failed", error, {
      entityId: input.target.entityId,
      sourcePath: input.sourcePath,
    });
    throw error;
  }
}

export async function processPendingAssetJobs(
  input: { limit?: number } = {}
): Promise<number> {
  const limit = input.limit ?? 20;
  assetLogger.info("process_pending_asset_jobs_invoke", { limit });
  try {
    const processedCount = await invoke<number>("process_pending_asset_jobs", {
      limit,
    });
    assetLogger.info("process_pending_asset_jobs_result", { processedCount });
    return processedCount;
  } catch (error) {
    assetLogger.error("process_pending_asset_jobs_failed", error, { limit });
    throw error;
  }
}
