import {
  type Accessor,
  createContext,
  type JSX,
  onCleanup,
  Show,
  useContext,
} from "solid-js";

import { Button } from "~/components/ui/button";
import type { ImageUploadState } from "~/lib/assets/image-upload";
import { createLogger } from "~/lib/logger";

export type { ImageUploadState } from "~/lib/assets/image-upload";

interface ImageUploadProps {
  children: JSX.Element;
  label: string;
  state: ImageUploadState;
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
  isBusy: Accessor<boolean>;
  label: Accessor<string>;
  pickImage: () => void;
  previewUrl: Accessor<string | null>;
}

const photoLogger = createLogger({
  domain: "PHOTO",
  module: "image-upload",
});

const ImageUploadContext = createContext<ImageUploadContextValue>();

function useImageUploadContext(): ImageUploadContextValue {
  const context = useContext(ImageUploadContext);
  if (!context) {
    throw new Error(
      "ImageUpload compound components must be used inside ImageUpload"
    );
  }
  return context;
}

function ImageUploadRoot(props: ImageUploadProps) {
  const context: ImageUploadContextValue = {
    clear: props.state.clear,
    error: props.state.error,
    fileName: props.state.fileName,
    hasImage: props.state.hasImage,
    isBusy: props.state.isBusy,
    label: () => props.label,
    pickImage: () => {
      props.state.pickImage().catch((pickError: unknown) => {
        photoLogger.error("processing_failed", pickError);
      });
    },
    previewUrl: props.state.previewUrl,
  };

  return (
    <ImageUploadContext.Provider value={context}>
      <div class="flex flex-col gap-1.5">
        <span class="font-medium text-sm leading-none">{props.label}</span>
        <div class="flex items-start gap-4 rounded-xl border border-border bg-card p-3">
          {props.children}
        </div>
      </div>
    </ImageUploadContext.Provider>
  );
}

function ImageUploadPreview(props: ImageUploadPreviewProps) {
  const context = useImageUploadContext();
  let cleanupPreviewImageListener: (() => void) | undefined;

  const registerPreviewImage = (
    element: HTMLImageElement | undefined
  ): void => {
    cleanupPreviewImageListener?.();
    cleanupPreviewImageListener = undefined;

    if (!element) {
      return;
    }

    const handleImageError = (): void => {
      photoLogger.error("preview_image_failed_to_load", undefined, {
        alt: props.alt,
        currentSrc: element.currentSrc || element.src,
        fileName: context.fileName() || null,
        hasPendingImage: context.hasImage(),
      });
    };

    const handleImageLoad = (): void => {
      photoLogger.info("preview_image_loaded", {
        alt: props.alt,
        currentSrc: element.currentSrc || element.src,
        fileName: context.fileName() || null,
        hasPendingImage: context.hasImage(),
      });
    };

    element.addEventListener("load", handleImageLoad);
    element.addEventListener("error", handleImageError);
    cleanupPreviewImageListener = () => {
      element.removeEventListener("load", handleImageLoad);
      element.removeEventListener("error", handleImageError);
    };
  };

  onCleanup(() => {
    cleanupPreviewImageListener?.();
  });

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
            ref={registerPreviewImage}
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
    <Show when={context.hasImage()}>
      <p class="text-muted-foreground text-xs">Foto siap disimpan.</p>
    </Show>
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
    if (context.isBusy()) {
      return "Memproses...";
    }
    return context.hasImage() ? "Ganti Foto" : "Pilih Foto";
  };

  return (
    <Button
      disabled={context.isBusy()}
      onClick={context.pickImage}
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
