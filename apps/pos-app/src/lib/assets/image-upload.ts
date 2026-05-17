import { convertFileSrc } from "@tauri-apps/api/core";
import type { Accessor } from "solid-js";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { createLogger } from "~/lib/logger";
import { deleteTempProductPhoto, pickProductPhoto } from "./picking";
import { enqueueAssetProcessing } from "./processing";
import type {
  AssetProcessingKind,
  AssetProcessingTarget,
  EnqueueAssetProcessingResult,
  PickedProductPhoto,
  ProductPhotoSource,
} from "./types";

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

  let lastPreviewTrace = "";
  createEffect(() => {
    const staged = pendingImage();
    const assetId = existingAssetId();
    const previewUrl = stagedPreviewUrl() ?? existingImageUrl();
    let previewMode: "empty" | "existing" | "staged" = "empty";
    if (staged) {
      previewMode = "staged";
    } else if (assetId) {
      previewMode = "existing";
    }
    const trace = [
      previewMode,
      staged?.path ?? "",
      assetId ?? "",
      previewUrl ?? "",
      fileName(),
    ].join("|");

    if (trace === lastPreviewTrace) {
      return;
    }

    lastPreviewTrace = trace;
    photoLogger.info("preview_state_changed", {
      existingAssetId: assetId,
      fileName: fileName() || null,
      hasExistingImageUrl: existingImageUrl() !== null,
      hasPendingImage: staged !== null,
      hasPreviewUrl: previewUrl !== null,
      previewMode,
      previewUrl,
      stagedPath: staged?.path ?? null,
    });
  });

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
    photoLogger.info("clear_requested", {
      hasExistingAsset: existingAssetId() !== null,
      hasPendingImage: pendingImage() !== null,
    });
    if (pendingImage()) {
      cleanupPending();
    } else if (existingAssetId()) {
      options.onClearExisting?.();
    }
    setError("");
  };

  const pickImage = async (source: ProductPhotoSource): Promise<void> => {
    photoLogger.info("pick_image_requested", { source });
    setIsBusy(true);
    setError("");

    try {
      const picked = await pickProductPhoto(source);
      photoLogger.info("pick_image_completed", {
        mimeType: picked.mimeType,
        originalFilename: picked.originalFilename,
        path: picked.path,
        source: picked.source,
      });

      cleanupPending();
      setPendingImage(picked);
      setFileName(picked.originalFilename);
      setStagedPreviewUrl(convertFileSrc(picked.path));
    } catch (pickError: unknown) {
      photoLogger.error("pick_image_failed", pickError, { source });
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
      photoLogger.info("enqueue_for_skipped", {
        entityId: target.entityId,
        entityType: target.entityType,
        field: target.field,
      });
      return null;
    }

    photoLogger.info("enqueue_for_started", {
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

    photoLogger.info("enqueue_for_completed", {
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
