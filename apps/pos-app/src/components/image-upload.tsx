import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  Show,
  useContext,
} from "solid-js";

import { PhotoSourceDrawer } from "~/components/photo-source-drawer";
import { Button } from "~/components/ui/button";
import {
  type AssetAttachmentField,
  type AssetEntityType,
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

export interface ImageUploadController {
  clear: () => void;
  enqueueFor: (
    target: AssetProcessingTarget
  ) => Promise<EnqueueAssetProcessingResult | null>;
  hasStagedImage: () => boolean;
}

interface ImageUploadProps {
  children: JSX.Element;
  existingAssetId?: string | null;
  existingImageUrl?: string | null;
  label: string;
  onBusyChange?: (busy: boolean) => void;
  onController?: (controller: ImageUploadController) => void;
  onExistingAssetClear?: () => void;
  processingKind: AssetProcessingKind;
}

interface ImageUploadPreviewProps {
  alt: string;
}

interface ImageUploadFileNameProps {
  fallback: string;
}

interface ImageUploadDescriptionProps {
  children: JSX.Element;
}

interface ImageUploadActionsProps {
  children: JSX.Element;
}

interface ImageUploadContextValue {
  clear: () => void;
  error: Accessor<string>;
  fileName: Accessor<string>;
  hasImage: Accessor<boolean>;
  isPicking: Accessor<boolean>;
  label: Accessor<string>;
  openPhotoSourceDrawer: () => void;
  pickCamera: () => void;
  pickGallery: () => void;
  previewUrl: Accessor<string | null>;
  setDrawerOpen: (open: boolean) => void;
  showDrawer: Accessor<boolean>;
}

const photoLogger = createLogger({
  domain: "PHOTO",
  module: "image-upload",
});

const ImageUploadContext = createContext<ImageUploadContextValue>();

function useImageUploadContext() {
  const context = useContext(ImageUploadContext);
  if (!context) {
    throw new Error(
      "ImageUpload compound components must be used inside ImageUpload"
    );
  }
  return context;
}

function cleanupTempPhoto(path: string) {
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
  return `data:${photo.previewMimeType ?? photo.mimeType};base64,${
    photo.previewBase64
  }`;
}

function ImageUploadRoot(props: ImageUploadProps) {
  const [pendingImage, setPendingImage] =
    createSignal<PickedProductPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);
  const [fileName, setFileName] = createSignal("");
  const [error, setError] = createSignal("");
  const [isPicking, setIsPicking] = createSignal(false);
  const [showDrawer, setShowDrawer] = createSignal(false);

  const clearPendingImage = () => {
    const stagedImage = pendingImage();
    if (stagedImage) {
      cleanupTempPhoto(stagedImage.path);
    }
    setPendingImage(null);
    setPreviewUrl(null);
    setFileName("");
  };

  const clear = () => {
    if (pendingImage()) {
      clearPendingImage();
    } else if (props.existingAssetId) {
      props.onExistingAssetClear?.();
    }
    setError("");
  };

  const pickImage = async (source: ProductPhotoSource) => {
    setIsPicking(true);
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

      clearPendingImage();
      setPendingImage(picked);
      setFileName(picked.originalFilename);
      setPreviewUrl(previewUrlForPickedPhoto(picked));
    } catch (pickError) {
      photoLogger.error("processing_failed", pickError, { source });
      setError(
        pickError instanceof Error ? pickError.message : "Gagal memproses foto"
      );
      setPendingImage(null);
      setPreviewUrl(null);
      setFileName("");
    } finally {
      setIsPicking(false);
    }
  };

  const controller: ImageUploadController = {
    clear,
    enqueueFor: async (
      target: AssetProcessingTarget
    ): Promise<EnqueueAssetProcessingResult | null> => {
      const stagedImage = pendingImage();
      if (!stagedImage) {
        return null;
      }

      photoLogger.info("path_processing_started", {
        entityId: target.entityId,
        entityType: target.entityType as AssetEntityType,
        field: target.field as AssetAttachmentField,
        name: stagedImage.originalFilename,
        source: stagedImage.source,
        sourceMimeType: stagedImage.mimeType,
        sourcePath: stagedImage.path,
      });

      const result = await enqueueAssetProcessing({
        originalFilename: stagedImage.originalFilename,
        processingKind: props.processingKind,
        sourceMimeType: stagedImage.mimeType,
        sourcePath: stagedImage.path,
        target,
      });

      photoLogger.info("pending_photo_job_enqueued", {
        entityId: target.entityId,
        entityType: target.entityType,
        jobId: result.jobId,
      });
      setPendingImage(null);
      setPreviewUrl(null);
      setFileName("");
      setError("");
      return result;
    },
    hasStagedImage: () => pendingImage() !== null,
  };

  createEffect(() => {
    props.onBusyChange?.(isPicking());
  });

  createEffect(() => {
    props.onController?.(controller);
  });

  onCleanup(() => {
    clearPendingImage();
  });

  const context: ImageUploadContextValue = {
    clear,
    error,
    fileName,
    hasImage: () => !!(pendingImage() || props.existingAssetId),
    isPicking,
    label: () => props.label,
    openPhotoSourceDrawer: () => {
      photoLogger.info("drawer_opened");
      setShowDrawer(true);
    },
    pickCamera: () => {
      pickImage("camera").catch((pickError: unknown) => {
        photoLogger.error("processing_failed", pickError, { source: "camera" });
      });
    },
    pickGallery: () => {
      pickImage("gallery").catch((pickError: unknown) => {
        photoLogger.error("processing_failed", pickError, {
          source: "gallery",
        });
      });
    },
    previewUrl: () => previewUrl() ?? props.existingImageUrl ?? null,
    setDrawerOpen: (open: boolean) => {
      photoLogger.info("drawer_state_changed", { open });
      setShowDrawer(open);
    },
    showDrawer,
  };

  return (
    <ImageUploadContext.Provider value={context}>
      <div class="flex flex-col gap-1.5">
        <span class="font-medium text-sm leading-none">{props.label}</span>
        <div class="flex items-start gap-4 rounded-xl border border-border bg-card p-3">
          {props.children}
        </div>
      </div>
      <PhotoSourceDrawer
        onOpenChange={context.setDrawerOpen}
        onPickCamera={context.pickCamera}
        onPickGallery={context.pickGallery}
        open={showDrawer()}
      />
    </ImageUploadContext.Provider>
  );
}

function ImageUploadPreview(props: ImageUploadPreviewProps) {
  const context = useImageUploadContext();
  return (
    <div class="flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border border-dashed bg-muted">
      <Show
        fallback={
          <span class="px-2 text-center text-muted-foreground text-xs">
            Belum ada foto
          </span>
        }
        when={context.previewUrl()}
      >
        {(previewUrl) => (
          <img
            alt={props.alt}
            class="size-full object-cover"
            height="96"
            src={previewUrl()}
            width="96"
          />
        )}
      </Show>
    </div>
  );
}

function ImageUploadFileName(props: ImageUploadFileNameProps) {
  const context = useImageUploadContext();
  return (
    <p class="text-muted-foreground text-sm">
      {context.fileName() || props.fallback}
    </p>
  );
}

function ImageUploadDescription(props: ImageUploadDescriptionProps) {
  return <p class="text-muted-foreground text-xs">{props.children}</p>;
}

function ImageUploadStateText() {
  const context = useImageUploadContext();
  return (
    <>
      <Show when={context.hasImage() && context.fileName()}>
        <p class="text-muted-foreground text-xs">
          Foto akan diproses saat disimpan.
        </p>
      </Show>
      <Show when={context.hasImage() && !context.fileName()}>
        <p class="text-muted-foreground text-xs">
          Foto akan diupload saat online.
        </p>
      </Show>
    </>
  );
}

function ImageUploadError() {
  const context = useImageUploadContext();
  return (
    <Show when={context.error()}>
      <p class="text-destructive text-xs" role="alert">
        {context.error()}
      </p>
    </Show>
  );
}

function ImageUploadActions(props: ImageUploadActionsProps) {
  return <div class="flex flex-wrap gap-2">{props.children}</div>;
}

function ImageUploadTrigger() {
  const context = useImageUploadContext();
  const label = () => {
    if (context.isPicking()) {
      return "Memproses...";
    }
    return context.hasImage() ? "Ganti Foto" : "Pilih Foto";
  };

  return (
    <Button
      disabled={context.isPicking()}
      onClick={context.openPhotoSourceDrawer}
      size="sm"
      type="button"
    >
      {label()}
    </Button>
  );
}

function ImageUploadRemove() {
  const context = useImageUploadContext();
  return (
    <Show when={context.hasImage()}>
      <Button onClick={context.clear} size="sm" type="button" variant="outline">
        Hapus
      </Button>
    </Show>
  );
}

export const ImageUpload = Object.assign(ImageUploadRoot, {
  Actions: ImageUploadActions,
  Description: ImageUploadDescription,
  Error: ImageUploadError,
  FileName: ImageUploadFileName,
  Preview: ImageUploadPreview,
  Remove: ImageUploadRemove,
  StateText: ImageUploadStateText,
  Trigger: ImageUploadTrigger,
});
