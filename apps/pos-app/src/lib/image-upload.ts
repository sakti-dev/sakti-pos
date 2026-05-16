import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";

import {
  type AssetProcessingKind,
  type AssetProcessingTarget,
  deleteTempProductPhoto,
  type EnqueueAssetProcessingResult,
  enqueueAssetProcessing,
  type PickedProductPhoto,
  type ProductPhotoSource,
  pickProductPhoto,
} from "~/lib/assets";
import { createLogger } from "~/lib/logger";

export interface CreateImageUploadOptions {
  existingAssetId?: Accessor<string | null>;
  existingImageUrl?: Accessor<string | null>;
  onClearExisting?: () => void;
  processingKind: AssetProcessingKind;
}

export interface ImageUploadState {
  clear: () => void;
  enqueueFor: (
    target: AssetProcessingTarget
  ) => Promise<EnqueueAssetProcessingResult | null>;
  error: Accessor<string>;
  fileName: Accessor<string>;
  hasImage: Accessor<boolean>;
  hasStagedImage: Accessor<boolean>;
  isBusy: Accessor<boolean>;
  pickImage: (source: ProductPhotoSource) => Promise<void>;
  previewUrl: Accessor<string | null>;
}

const photoLogger = createLogger({
  domain: "PHOTO",
  module: "image-upload",
});

function cleanupTempPhoto(path: string): void {
  Promise.resolve(deleteTempProductPhoto(path)).catch(
    (cleanupError: unknown) => {
      photoLogger.warn("temp_photo_cleanup_failed", {
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        path,
      });
    }
  );
}

function previewUrlForPickedPhoto(photo: PickedProductPhoto): string | null {
  if (!photo.previewBase64) {
    return null;
  }
  return `data:${photo.previewMimeType ?? photo.mimeType};base64,${photo.previewBase64}`;
}

export function createImageUpload(
  options: CreateImageUploadOptions
): ImageUploadState {
  const [pendingImage, setPendingImage] =
    createSignal<PickedProductPhoto | null>(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = createSignal<string | null>(
    null
  );
  const [fileName, setFileName] = createSignal("");
  const [error, setError] = createSignal("");
  const [isBusy, setIsBusy] = createSignal(false);

  const existingAssetId = () => options.existingAssetId?.() ?? null;
  const existingImageUrl = () => options.existingImageUrl?.() ?? null;

  const cleanupPending = (): void => {
    const staged = pendingImage();
    if (staged) {
      cleanupTempPhoto(staged.path);
    }
    setPendingImage(null);
    setStagedPreviewUrl(null);
    setFileName("");
  };

  const clear = (): void => {
    if (pendingImage()) {
      cleanupPending();
    } else if (existingAssetId()) {
      options.onClearExisting?.();
    }
    setError("");
  };

  const pickImage = async (source: ProductPhotoSource): Promise<void> => {
    setIsBusy(true);
    setError("");

    try {
      photoLogger.info("native_picker_requested", { source });
      const picked = await pickProductPhoto(source);
      photoLogger.info("native_picker_finished", {
        mimeType: picked.mimeType,
        originalFilename: picked.originalFilename,
        path: picked.path,
        previewMimeType: picked.previewMimeType,
        source: picked.source,
      });

      cleanupPending();
      setPendingImage(picked);
      setFileName(picked.originalFilename);
      setStagedPreviewUrl(previewUrlForPickedPhoto(picked));
    } catch (pickError: unknown) {
      photoLogger.error("processing_failed", pickError, { source });
      setError(
        pickError instanceof Error ? pickError.message : "Gagal memproses foto"
      );
      setPendingImage(null);
      setStagedPreviewUrl(null);
      setFileName("");
    } finally {
      setIsBusy(false);
    }
  };

  const enqueueFor = async (
    target: AssetProcessingTarget
  ): Promise<EnqueueAssetProcessingResult | null> => {
    const staged = pendingImage();
    if (!staged) {
      return null;
    }

    photoLogger.info("path_processing_started", {
      entityId: target.entityId,
      entityType: target.entityType,
      field: target.field,
      name: staged.originalFilename,
      source: staged.source,
      sourceMimeType: staged.mimeType,
      sourcePath: staged.path,
    });

    const result = await enqueueAssetProcessing({
      originalFilename: staged.originalFilename,
      processingKind: options.processingKind,
      sourceMimeType: staged.mimeType,
      sourcePath: staged.path,
      target,
    });

    photoLogger.info("pending_photo_job_enqueued", {
      entityId: target.entityId,
      entityType: target.entityType,
      jobId: result.jobId,
    });

    setPendingImage(null);
    setStagedPreviewUrl(null);
    setFileName("");
    setError("");

    return result;
  };

  onCleanup(() => {
    cleanupPending();
  });

  return {
    clear,
    enqueueFor,
    error,
    fileName,
    hasImage: () => !!(pendingImage() || existingAssetId()),
    hasStagedImage: () => pendingImage() !== null,
    isBusy,
    pickImage,
    previewUrl: () => stagedPreviewUrl() ?? existingImageUrl() ?? null,
  };
}
