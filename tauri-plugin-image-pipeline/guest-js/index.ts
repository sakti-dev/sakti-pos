import { invoke } from "@tauri-apps/api/core";

// ── DTOs ────────────────────────────────────────────────────────────

export interface EnqueueJobRequest {
  attachmentField: string;
  entityId: string;
  entityType: string;
  maxAttempts?: number;
  maxLongEdge: number;
  merchantId: string;
  originalFilename: string;
  previewMaxLongEdge: number;
  processingKind: string;
  sourceMimeType?: string;
  sourcePath: string;
}

export interface EnqueueJobResponse {
  jobId: string;
  previewPath?: string;
}

export interface ProcessJobsResponse {
  attempted: number;
  completed: number;
  retryScheduled: number;
  terminalFailed: number;
}

export interface JobResult {
  assetId: string;
  byteSize: number;
  cachePath: string;
  contentHash: string;
  contentType: string;
  height: number;
  originalFilename: string;
  previewPath?: string;
  width: number;
}

export interface CompletedJob {
  attachmentField: string;
  attempts: number;
  createdAt: string;
  entityId: string;
  entityType: string;
  id: string;
  merchantId: string;
  processingKind: string;
  result: JobResult;
  updatedAt: string;
}

export interface FailedJob {
  attachmentField: string;
  attempts: number;
  entityId: string;
  entityType: string;
  id: string;
  lastError: string;
  maxAttempts: number;
  merchantId: string;
  processingKind: string;
  sourcePath: string;
  updatedAt: string;
}

export interface AttachmentLookup {
  attachmentField: string;
  entityId: string;
  entityType: string;
}

export interface PreviewPathResponse {
  previewMimeType: string;
  previewPath: string;
}

export interface CachedPathResponse {
  contentType: string;
  localPath: string;
}

// ── Commands ────────────────────────────────────────────────────────

export function enqueueJob(
  request: EnqueueJobRequest
): Promise<EnqueueJobResponse> {
  return invoke("plugin:image-pipeline|enqueue_job", { request });
}

export function processPendingJobs(
  limit: number
): Promise<ProcessJobsResponse> {
  return invoke("plugin:image-pipeline|process_pending_jobs", { limit });
}

export function getCompletedJobs(): Promise<CompletedJob[]> {
  return invoke("plugin:image-pipeline|get_completed_jobs");
}

export function consumeCompletedJob(jobId: string): Promise<JobResult> {
  return invoke("plugin:image-pipeline|consume_completed_job", { jobId });
}

export function resetStuckJobs(): Promise<number> {
  return invoke("plugin:image-pipeline|reset_stuck_jobs");
}

export function retryFailedJob(jobId: string): Promise<void> {
  return invoke("plugin:image-pipeline|retry_failed_job", { jobId });
}

export function getFailedJobs(): Promise<FailedJob[]> {
  return invoke("plugin:image-pipeline|get_failed_jobs");
}

export function getPendingPreview(
  target: AttachmentLookup
): Promise<PreviewPathResponse | null> {
  return invoke("plugin:image-pipeline|get_pending_preview", { target });
}

export function getCachedAssetPath(
  merchantId: string,
  assetId: string,
  contentType: string
): Promise<CachedPathResponse | null> {
  return invoke("plugin:image-pipeline|get_cached_asset_path", {
    merchantId,
    assetId,
    contentType,
  });
}

export function cleanupOrphanedTempFiles(): Promise<number> {
  return invoke("plugin:image-pipeline|cleanup_orphaned_temp_files");
}
