import { convertFileSrc } from "@tauri-apps/api/core";
import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import { createLogger } from "~/lib/logger";
import { pluginPickImage } from "./plugin-bridge";

const PREVIEW_FILENAME_SUFFIX = /_preview\.jpg$/;

export interface CreateImageUploadOptions {
  existingAssetId?: Accessor<string | null>;
  existingImageUrl?: Accessor<string | null>;
  onClearExisting?: () => void;
}

export interface PickImageResult {
  jobId: string;
  previewPath: string;
  stagedSourcePath: string;
}

export interface ImageUploadState {
  clear: () => void;
  error: Accessor<string>;
  fileName: Accessor<string>;
  hasImage: Accessor<boolean>;
  hasStagedImage: Accessor<boolean>;
  isBusy: Accessor<boolean>;
  jobId: Accessor<string | null>;
  pickImage: () => Promise<PickImageResult | null>;
  previewUrl: Accessor<string | null>;
  stagedSourcePath: Accessor<string | null>;
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
  const [stagedSourcePath, setStagedSourcePath] = createSignal<string | null>(
    null
  );
  const [fileName, setFileName] = createSignal("");
  const [error, setError] = createSignal("");
  const [isBusy, setIsBusy] = createSignal(false);
  const [activeJobId, setActiveJobId] = createSignal<string | null>(null);

  const existingAssetId = () => options.existingAssetId?.() ?? null;
  const existingImageUrl = () => options.existingImageUrl?.() ?? null;

  function cleanupStaged(): void {
    setStagedPreviewUrl(null);
    setStagedSourcePath(null);
    setFileName("");
    setActiveJobId(null);
  }

  const clear = (): void => {
    photoLogger.info("clear_requested", {
      hasExistingAsset: existingAssetId() !== null,
      hasActiveJob: activeJobId() !== null,
    });
    if (activeJobId()) {
      cleanupStaged();
    } else if (existingAssetId()) {
      options.onClearExisting?.();
    }
    setError("");
  };

  const pickImage = async (): Promise<PickImageResult | null> => {
    photoLogger.info("pick_image_requested");
    setIsBusy(true);
    setError("");

    try {
      // Clean up any previous staged image
      cleanupStaged();

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
        stagedSourcePath: result.stagedSourcePath,
        previewPath: result.previewPath,
      });

      // Extract filename from preview path for display
      const displayName =
        result.previewPath
          .split("/")
          .pop()
          ?.replace(PREVIEW_FILENAME_SUFFIX, ".jpg") ?? "image";

      const previewUrl = convertFileSrc(result.previewPath);

      setStagedPreviewUrl(previewUrl);
      setStagedSourcePath(result.stagedSourcePath);
      setFileName(displayName);
      setActiveJobId(result.jobId);

      return {
        jobId: result.jobId,
        stagedSourcePath: result.stagedSourcePath,
        previewPath: result.previewPath,
      };
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

      cleanupStaged();
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  return {
    clear,
    error,
    fileName,
    hasImage: () => !!(activeJobId() || existingAssetId()),
    hasStagedImage: () => activeJobId() !== null,
    isBusy,
    jobId: activeJobId,
    pickImage,
    previewUrl: () => stagedPreviewUrl() ?? existingImageUrl() ?? null,
    stagedSourcePath,
  };
}
