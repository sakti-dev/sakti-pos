import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";
import { createLogger } from "~/lib/logger";
import { pluginPickImage } from "./plugin-bridge";
import type { AssetProcessingKind } from "./types";

const JOB_COMPLETED_EVENT = "image_pipeline://job_completed";
const JOB_FAILED_EVENT = "image_pipeline://job_failed";
const PREVIEW_FILENAME_SUFFIX = /_preview\.jpg$/;

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

interface JobFailedPayload {
  attempts: number;
  error: string;
  jobId: string;
  maxAttempts: number;
  terminal: boolean;
}

export interface CreateImageUploadOptions {
  existingAssetId?: Accessor<string | null>;
  existingImageUrl?: Accessor<string | null>;
  onAssetReady?: (result: {
    assetPath: string;
    byteSize: number;
    contentHash: string;
    contentType: string;
    height: number;
    jobId: string;
    originalFilename: string;
    width: number;
  }) => void;
  onClearExisting?: () => void;
  processingKind: AssetProcessingKind;
}

export interface ImageUploadState {
  clear: () => void;
  error: Accessor<string>;
  fileName: Accessor<string>;
  hasImage: Accessor<boolean>;
  hasStagedImage: Accessor<boolean>;
  isBusy: Accessor<boolean>;
  isReady: Accessor<boolean>;
  jobId: Accessor<string | null>;
  pickImage: () => Promise<void>;
  previewUrl: Accessor<string | null>;
}

const photoLogger = createLogger({
  domain: "PHOTO",
  module: "image-upload",
});

export function createImageUpload(
  options: CreateImageUploadOptions
): ImageUploadState {
  const [stagedPreviewUrl, setStagedPreviewUrl] = createSignal<string | null>(
    null
  );
  const [fileName, setFileName] = createSignal("");
  const [error, setError] = createSignal("");
  const [isBusy, setIsBusy] = createSignal(false);
  const [activeJobId, setActiveJobId] = createSignal<string | null>(null);
  const [isReady, setIsReady] = createSignal(false);

  const existingAssetId = () => options.existingAssetId?.() ?? null;
  const existingImageUrl = () => options.existingImageUrl?.() ?? null;
  let currentJobId: string | null = null;
  let pendingCompletedPayload: JobCompletedPayload | null = null;
  let pendingFailedPayload: JobFailedPayload | null = null;

  // Track the listener unsubscribe for the active job
  let unlistenCompletedFn: (() => void) | undefined;
  let unlistenFailedFn: (() => void) | undefined;

  function cleanupListener(): void {
    if (unlistenCompletedFn) {
      unlistenCompletedFn();
      unlistenCompletedFn = undefined;
    }
    if (unlistenFailedFn) {
      unlistenFailedFn();
      unlistenFailedFn = undefined;
    }
  }

  function cleanupPending(): void {
    cleanupListener();
    setStagedPreviewUrl(null);
    setFileName("");
    setActiveJobId(null);
    setIsReady(false);
    currentJobId = null;
    pendingCompletedPayload = null;
    pendingFailedPayload = null;
  }

  function handleCompletedPayload(payload: JobCompletedPayload): void {
    if (payload.jobId !== currentJobId) {
      pendingCompletedPayload = payload;
      return;
    }

    photoLogger.info("job_completed_received", {
      jobId: payload.jobId,
    });

    setIsReady(true);
    cleanupListener();

    options.onAssetReady?.({
      assetPath: payload.assetPath,
      byteSize: payload.byteSize,
      contentHash: payload.contentHash,
      contentType: payload.contentType,
      height: payload.height,
      jobId: payload.jobId,
      originalFilename: payload.originalFilename,
      width: payload.width,
    });
  }

  function handleFailedPayload(payload: JobFailedPayload): void {
    if (payload.jobId !== currentJobId) {
      pendingFailedPayload = payload;
      return;
    }

    photoLogger.error("job_failed_received", payload);
    setError(payload.error);
    setIsReady(false);
    cleanupListener();
  }

  function flushPendingJobEvents(jobId: string): void {
    currentJobId = jobId;

    if (pendingCompletedPayload?.jobId === jobId) {
      const payload = pendingCompletedPayload;
      pendingCompletedPayload = null;
      handleCompletedPayload(payload);
      return;
    }

    if (pendingFailedPayload?.jobId === jobId) {
      const payload = pendingFailedPayload;
      pendingFailedPayload = null;
      handleFailedPayload(payload);
    }
  }

  const clear = (): void => {
    photoLogger.info("clear_requested", {
      hasExistingAsset: existingAssetId() !== null,
      hasActiveJob: activeJobId() !== null,
    });
    if (activeJobId()) {
      cleanupPending();
    } else if (existingAssetId()) {
      options.onClearExisting?.();
    }
    setError("");
  };

  const pickImage = async (): Promise<void> => {
    photoLogger.info("pick_image_requested");
    setIsBusy(true);
    setError("");

    try {
      // Clean up any previous listener/job before starting new one
      cleanupPending();

      unlistenCompletedFn = await listen<JobCompletedPayload>(
        JOB_COMPLETED_EVENT,
        (event) => {
          handleCompletedPayload(event.payload);
        }
      );
      unlistenFailedFn = await listen<JobFailedPayload>(
        JOB_FAILED_EVENT,
        (event) => {
          handleFailedPayload(event.payload);
        }
      );

      const result = await pluginPickImage({
        pickerMode: "image",
        compression: {
          maxLongEdge: 400,
          previewMaxLongEdge: 320,
          quality: 75,
        },
      });

      photoLogger.info("pick_image_completed", {
        jobId: result.jobId,
        previewMimeType: result.previewMimeType,
        previewPath: result.previewPath,
        status: result.status,
      });

      // Extract filename from preview path for display
      const displayName =
        result.previewPath
          .split("/")
          .pop()
          ?.replace(PREVIEW_FILENAME_SUFFIX, ".jpg") ?? "image";

      setStagedPreviewUrl(convertFileSrc(result.previewPath));
      setFileName(displayName);
      setActiveJobId(result.jobId);
      setIsReady(false);
      flushPendingJobEvents(result.jobId);
    } catch (pickError: unknown) {
      // Handle cancellation silently
      const message =
        pickError instanceof Error ? pickError.message : String(pickError);
      const isCancellation =
        message.toLowerCase().includes("cancel") ||
        message.toLowerCase().includes("picker was cancelled");

      if (!isCancellation) {
        photoLogger.error("pick_image_failed", pickError);
        setError(
          pickError instanceof Error
            ? pickError.message
            : "Gagal memproses foto"
        );
      }

      cleanupPending();
    } finally {
      setIsBusy(false);
    }
  };

  onCleanup(() => {
    cleanupListener();
  });

  return {
    clear,
    error,
    fileName,
    hasImage: () => !!(activeJobId() || existingAssetId()),
    hasStagedImage: () => activeJobId() !== null,
    isBusy,
    isReady,
    jobId: activeJobId,
    pickImage,
    previewUrl: () => stagedPreviewUrl() ?? existingImageUrl() ?? null,
  };
}
