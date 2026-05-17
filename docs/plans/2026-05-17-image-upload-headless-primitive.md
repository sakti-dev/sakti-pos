# ImageUpload Headless Primitive Refactor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `ImageUpload` from a callback-controller pattern to a SolidJS-idiomatic headless primitive (`createImageUpload`), eliminating `let` refs, `onController`, `onBusyChange`, and `onExistingAssetClear` callbacks.

**Architecture:** Extract all reactive state and actions into a `createImageUpload()` primitive that returns typed accessors and action functions. The existing `ImageUpload` component becomes a thin UI wrapper that accepts the primitive's return value as `state`. The only consumer (`product-form.tsx`) is migrated to call the primitive directly. Old callback-based API is removed entirely (no backwards compat shim).

**Tech Stack:** SolidJS (signals, memos, effects), Vitest, @solidjs/testing-library, @testing-library/user-event

---

## Impact Analysis

### Files Modified
| File | Change |
|------|--------|
| `apps/pos-app/src/lib/image-upload.ts` | **NEW** — the primitive |
| `apps/pos-app/src/components/image-upload.tsx` | Rebuild to accept `state` prop |
| `apps/pos-app/src/pages/settings/product-categories/product-form.tsx` | Migrate to primitive |
| `apps/pos-app/src/lib/__test__/image-upload.test.ts` | **NEW** — primitive unit tests |
| `apps/pos-app/src/components/__test__/image-upload.test.tsx` | Update to new API |

### Files Untouched
- `apps/pos-app/src/lib/assets.ts` — no changes to pick/enqueue/delete functions
- `apps/pos-app/src/lib/asset-targets.ts` — no changes
- `apps/pos-app/src/components/photo-source-drawer.tsx` — no changes to drawer props
- `apps/pos-app/src-tauri/` — no Rust changes

### Breaking Changes
- `ImageUploadProps` loses `onController`, `onBusyChange`, `onExistingAssetClear`
- `ImageUploadProps` gains required `state` prop (return type of `createImageUpload`)
- `ImageUploadController` type is deleted — replaced by the primitive return type

---

## Task 1: Create `createImageUpload` Primitive — Unit Tests (RED)

**Files:**
- Create: `apps/pos-app/src/lib/__test__/image-upload.test.ts`

**Why this file:** The primitive is pure reactive logic (no JSX). Unit tests without rendering are faster and more focused. We test every accessor and action in isolation.

**Step 1: Write failing tests for the primitive**

```typescript
import { createSignal } from "solid-js";
import { describe, expect, test, vi } from "vitest";

const mockPickProductPhoto = vi.fn();
const mockDeleteTempProductPhoto = vi.fn();
const mockEnqueueAssetProcessing = vi.fn();

vi.mock("~/lib/assets", () => ({
  deleteTempProductPhoto: (...args: unknown[]) =>
    mockDeleteTempProductPhoto(...args),
  enqueueAssetProcessing: (...args: unknown[]) =>
    mockEnqueueAssetProcessing(...args),
  pickProductPhoto: (...args: unknown[]) => mockPickProductPhoto(...args),
}));

describe("createImageUpload", () => {
  test("initial state has no image", async () => {
    const { createImageUpload } = await import("../image-upload");
    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    expect(upload.hasImage()).toBe(false);
    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.isBusy()).toBe(false);
    expect(upload.previewUrl()).toBe(null);
    expect(upload.fileName()).toBe("");
    expect(upload.error()).toBe("");
  });

  test("initial state shows existing image when provided", async () => {
    const { createImageUpload } = await import("../image-upload");
    const [existingId] = createSignal("asset-1");
    const [existingUrl] = createSignal("data:image/webp;base64,abc");

    const upload = createImageUpload({
      existingAssetId: existingId,
      existingImageUrl: existingUrl,
      processingKind: "image:webp-thumbnail",
    });

    expect(upload.hasImage()).toBe(true);
    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.previewUrl()).toBe("data:image/webp;base64,abc");
  });

  test("pickImage stages a photo and returns preview", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
      previewBase64: "cHJldmlldw==",
      previewMimeType: "image/jpeg",
      source: "gallery",
    });

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage("gallery");

    expect(upload.hasImage()).toBe(true);
    expect(upload.hasStagedImage()).toBe(true);
    expect(upload.fileName()).toBe("menu.png");
    expect(upload.previewUrl()).toBe("data:image/jpeg;base64,cHJldmlldw==");
    expect(upload.error()).toBe("");
    expect(mockPickProductPhoto).toHaveBeenCalledWith("gallery");
  });

  test("pickImage sets error on failure", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPickProductPhoto.mockRejectedValue(new Error("Camera denied"));

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage("camera");

    expect(upload.hasImage()).toBe(false);
    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.error()).toBe("Camera denied");
  });

  test("clear removes staged image and cleans up temp file", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
      previewBase64: "cHJldmlldw==",
      previewMimeType: "image/jpeg",
      source: "gallery",
    });

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage("gallery");
    expect(upload.hasStagedImage()).toBe(true);

    upload.clear();

    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.hasImage()).toBe(false);
    expect(upload.fileName()).toBe("");
    expect(upload.previewUrl()).toBe(null);
    expect(mockDeleteTempProductPhoto).toHaveBeenCalledWith(
      "/tmp/product_photo_inputs/gallery_1.png",
    );
  });

  test("clear with existing image calls onClearExisting", async () => {
    const { createImageUpload } = await import("../image-upload");
    const onClearExisting = vi.fn();
    const [existingId] = createSignal("asset-1");

    const upload = createImageUpload({
      existingAssetId: existingId,
      onClearExisting,
      processingKind: "image:webp-thumbnail",
    });

    upload.clear();

    expect(onClearExisting).toHaveBeenCalledOnce();
  });

  test("clear does nothing when no image exists", async () => {
    const { createImageUpload } = await import("../image-upload");
    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    upload.clear();

    expect(upload.hasImage()).toBe(false);
    expect(mockDeleteTempProductPhoto).not.toHaveBeenCalled();
  });

  test("enqueueFor processes staged photo and returns result", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
      previewBase64: "cHJldmlldw==",
      previewMimeType: "image/jpeg",
      source: "gallery",
    });
    mockEnqueueAssetProcessing.mockResolvedValue({ jobId: "job-1" });

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage("gallery");

    const result = await upload.enqueueFor({
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });

    expect(result).toEqual({ jobId: "job-1" });
    expect(mockEnqueueAssetProcessing).toHaveBeenCalledWith({
      originalFilename: "menu.png",
      processingKind: "image:webp-thumbnail",
      sourceMimeType: "image/png",
      sourcePath: "/tmp/product_photo_inputs/gallery_1.png",
      target: {
        entityId: "product-1",
        entityType: "product",
        field: "image_asset_id",
      },
    });

    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.fileName()).toBe("");
    expect(upload.previewUrl()).toBe(null);
  });

  test("enqueueFor returns null when no staged image", async () => {
    const { createImageUpload } = await import("../image-upload");
    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    const result = await upload.enqueueFor({
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });

    expect(result).toBeNull();
    expect(mockEnqueueAssetProcessing).not.toHaveBeenCalled();
  });

  test("isBusy is true while picking", async () => {
    const { createImageUpload } = await import("../image-upload");
    let resolvePick: (value: unknown) => void;
    mockPickProductPhoto.mockReturnValue(
      new Promise((resolve) => {
        resolvePick = resolve;
      }),
    );

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    const pickPromise = upload.pickImage("gallery");
    expect(upload.isBusy()).toBe(true);

    resolvePick!({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
      source: "gallery",
    });
    await pickPromise;

    expect(upload.isBusy()).toBe(false);
  });

  test("replacing staged image cleans up previous temp file", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPickProductPhoto
      .mockResolvedValueOnce({
        path: "/tmp/product_photo_inputs/gallery_1.png",
        originalFilename: "first.png",
        mimeType: "image/png",
        previewBase64: "Zmlyc3Q=",
        previewMimeType: "image/jpeg",
        source: "gallery",
      })
      .mockResolvedValueOnce({
        path: "/tmp/product_photo_inputs/gallery_2.jpg",
        originalFilename: "second.jpg",
        mimeType: "image/jpeg",
        previewBase64: "c2Vjb25k",
        previewMimeType: "image/jpeg",
        source: "gallery",
      });

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage("gallery");
    expect(upload.fileName()).toBe("first.png");

    await upload.pickImage("gallery");
    expect(upload.fileName()).toBe("second.jpg");

    expect(mockDeleteTempProductPhoto).toHaveBeenCalledWith(
      "/tmp/product_photo_inputs/gallery_1.png",
    );
    expect(upload.previewUrl()).toBe("data:image/jpeg;base64,c2Vjb25k");
  });

  test("existingImageUrl falls through when no staged preview", async () => {
    const { createImageUpload } = await import("../image-upload");
    const [existingUrl] = createSignal("data:image/webp;base64,existing");

    const upload = createImageUpload({
      existingImageUrl: existingUrl,
      processingKind: "image:webp-thumbnail",
    });

    expect(upload.previewUrl()).toBe("data:image/webp;base64,existing");
  });

  test("previewUrl prefers staged image over existing", async () => {
    const { createImageUpload } = await import("../image-upload");
    const [existingUrl] = createSignal("data:image/webp;base64,existing");
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "new.png",
      mimeType: "image/png",
      previewBase64: "bmV3",
      previewMimeType: "image/jpeg",
      source: "gallery",
    });

    const upload = createImageUpload({
      existingImageUrl: existingUrl,
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage("gallery");
    expect(upload.previewUrl()).toBe("data:image/jpeg;base64,bmV3");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun x vitest run apps/pos-app/src/lib/__test__/image-upload.test.ts`
Expected: FAIL — `Cannot find module '../image-upload'`

---

## Task 2: Implement `createImageUpload` Primitive (GREEN)

**Files:**
- Create: `apps/pos-app/src/lib/image-upload.ts`

**Why this file:** New file holds the headless primitive — pure reactive logic extracted from the component. Placed in `lib/` alongside other primitives and utilities (not in `components/` since it has no JSX).

**Step 1: Write the primitive implementation**

```typescript
import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";

import {
  type AssetProcessingKind,
  type AssetProcessingTarget,
  type EnqueueAssetProcessingResult,
  deleteTempProductPhoto,
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
  error: Accessor<string>;
  fileName: Accessor<string>;
  hasImage: Accessor<boolean>;
  hasStagedImage: Accessor<boolean>;
  isBusy: Accessor<boolean>;
  pickImage: (source: ProductPhotoSource) => Promise<void>;
  previewUrl: Accessor<string | null>;
  enqueueFor: (
    target: AssetProcessingTarget,
  ) => Promise<EnqueueAssetProcessingResult | null>;
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
    },
  );
}

function previewUrlForPickedPhoto(photo: PickedProductPhoto): string | null {
  if (!photo.previewBase64) {
    return null;
  }
  return `data:${photo.previewMimeType ?? photo.mimeType};base64,${photo.previewBase64}`;
}

export function createImageUpload(
  options: CreateImageUploadOptions,
): ImageUploadState {
  const [pendingImage, setPendingImage] =
    createSignal<PickedProductPhoto | null>(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = createSignal<string | null>(
    null,
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
        pickError instanceof Error
          ? pickError.message
          : "Gagal memproses foto",
      );
      setPendingImage(null);
      setStagedPreviewUrl(null);
      setFileName("");
    } finally {
      setIsBusy(false);
    }
  };

  const enqueueFor = async (
    target: AssetProcessingTarget,
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
```

**Step 2: Run test to verify all pass**

Run: `bun x vitest run apps/pos-app/src/lib/__test__/image-upload.test.ts`
Expected: ALL PASS (12 tests)

**Step 3: Commit**

```bash
git add apps/pos-app/src/lib/image-upload.ts apps/pos-app/src/lib/__test__/image-upload.test.ts
git commit -m "feat(pos-app): add createImageUpload headless primitive with tests"
```

---

## Task 3: Rewrite `ImageUpload` Component to Use Primitive

**Files:**
- Modify: `apps/pos-app/src/components/image-upload.tsx`

**Why:** The component becomes a thin UI shell. All state comes from the `state` prop (the primitive return). Context now just forwards the primitive's accessors and the drawer signal.

**Step 1: Rewrite the component**

The new `image-upload.tsx`:

```typescript
import {
  type Accessor,
  createContext,
  createSignal,
  type JSX,
  onCleanup,
  Show,
  useContext,
} from "solid-js";

import { PhotoSourceDrawer } from "~/components/photo-source-drawer";
import { Button } from "~/components/ui/button";
import type { AssetProcessingTarget } from "~/lib/asset-targets";
import type { AssetProcessingKind } from "~/lib/assets";
import type { EnqueueAssetProcessingResult } from "~/lib/assets";
import { createLogger } from "~/lib/logger";
import type { ImageUploadState } from "~/lib/image-upload";

export type { type ImageUploadState } from "~/lib/image-upload";

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

function useImageUploadContext(): ImageUploadContextValue {
  const context = useContext(ImageUploadContext);
  if (!context) {
    throw new Error(
      "ImageUpload compound components must be used inside ImageUpload",
    );
  }
  return context;
}

function ImageUploadRoot(props: ImageUploadProps) {
  const [showDrawer, setShowDrawer] = createSignal(false);

  const context: ImageUploadContextValue = {
    clear: props.state.clear,
    error: props.state.error,
    fileName: props.state.fileName,
    hasImage: props.state.hasImage,
    isBusy: props.state.isBusy,
    label: () => props.label,
    openPhotoSourceDrawer: () => {
      photoLogger.info("drawer_opened");
      setShowDrawer(true);
    },
    pickCamera: () => {
      props.state.pickImage("camera").catch((pickError: unknown) => {
        photoLogger.error("processing_failed", pickError, { source: "camera" });
      });
    },
    pickGallery: () => {
      props.state.pickImage("gallery").catch((pickError: unknown) => {
        photoLogger.error("processing_failed", pickError, {
          source: "gallery",
        });
      });
    },
    previewUrl: props.state.previewUrl,
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
    if (context.isBusy()) {
      return "Memproses...";
    }
    return context.hasImage() ? "Ganti Foto" : "Pilih Foto";
  };

  return (
    <Button
      disabled={context.isBusy()}
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
```

**Key changes from old component:**
- Removed: `createSignal` for pendingImage, previewUrl, fileName, error, isPicking (all moved to primitive)
- Removed: `onController`, `onBusyChange`, `onExistingAssetClear`, `existingAssetId`, `existingImageUrl`, `processingKind` props
- Removed: `ImageUploadController` interface (replaced by `ImageUploadState`)
- Removed: `onCleanup` for temp photo (primitive handles it)
- Added: `state: ImageUploadState` required prop
- Context now delegates to `props.state.*` instead of local signals
- `isPicking` → `isBusy` (naming aligned with primitive)
- Drawer signal (`showDrawer`) remains local to the component (UI concern, not primitive concern)

**Step 2: Run typecheck**

Run: `bun x tsc --noEmit` (workdir: `apps/pos-app`)
Expected: Errors in `product-form.tsx` and `image-upload.test.tsx` (expected — they still use old API)

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/image-upload.tsx
git commit -m "refactor(pos-app): rewrite ImageUpload component to accept primitive state"
```

---

## Task 4: Update Component Test to New API

**Files:**
- Modify: `apps/pos-app/src/components/__test__/image-upload.test.tsx`

**Why:** The integration test now creates the primitive externally and passes it to the component, mirroring real usage.

**Step 1: Rewrite the component test**

```typescript
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import { ImageUpload } from "~/components/image-upload";
import { createImageUpload } from "~/lib/image-upload";

const mockPickProductPhoto = vi.fn();
const mockDeleteTempProductPhoto = vi.fn();
const mockEnqueueAssetProcessing = vi.fn();

vi.mock("~/lib/assets", () => ({
  deleteTempProductPhoto: (...args: unknown[]) =>
    mockDeleteTempProductPhoto(...args),
  enqueueAssetProcessing: (...args: unknown[]) =>
    mockEnqueueAssetProcessing(...args),
  pickProductPhoto: (...args: unknown[]) => mockPickProductPhoto(...args),
}));

vi.mock("~/components/ui/button", () => ({
  Button: (props: {
    children: JSX.Element;
    disabled?: boolean;
    onClick?: () => void;
    type?: "button" | "submit";
  }) => (
    <button
      disabled={props.disabled}
      onClick={props.onClick}
      type={props.type ?? "button"}
    >
      {props.children}
    </button>
  ),
}));

const user = userEvent.setup();

describe("ImageUpload", () => {
  test("stages a picked image and enqueues it for a supplied asset target", async () => {
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
      previewBase64: "cHJldmlldw==",
      previewMimeType: "image/jpeg",
      source: "gallery",
    });
    mockEnqueueAssetProcessing.mockResolvedValue({ jobId: "job-1" });

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    render(() => (
      <ImageUpload label="Foto Produk" state={upload}>
        <ImageUpload.Preview alt="Preview foto produk" />
        <ImageUpload.FileName fallback="Pilih foto untuk diunggah" />
        <ImageUpload.StateText />
        <ImageUpload.Trigger />
      </ImageUpload>
    ));

    await user.click(screen.getByText("Pilih Foto"));
    await user.click(screen.getByText("Pilih dari Galeri"));

    expect(await screen.findByText("menu.png")).toBeInTheDocument();
    expect(await screen.findByAltText("Preview foto produk")).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,cHJldmlldw==",
    );
    expect(
      screen.getByText("Foto akan diproses saat disimpan."),
    ).toBeInTheDocument();
    expect(upload.hasStagedImage()).toBe(true);

    await upload.enqueueFor({
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });

    expect(mockEnqueueAssetProcessing).toHaveBeenCalledWith({
      originalFilename: "menu.png",
      processingKind: "image:webp-thumbnail",
      sourceMimeType: "image/png",
      sourcePath: "/tmp/product_photo_inputs/gallery_1.png",
      target: {
        entityId: "product-1",
        entityType: "product",
        field: "image_asset_id",
      },
    });
    await waitFor(() => expect(upload.hasStagedImage()).toBe(false));
  });
});
```

**Step 2: Run the component test**

Run: `bun x vitest run apps/pos-app/src/components/__test__/image-upload.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/__test__/image-upload.test.tsx
git commit -m "test(pos-app): update ImageUpload component test to use primitive API"
```

---

## Task 5: Migrate `product-form.tsx` Consumer

**Files:**
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`

**Why:** The only consumer of `ImageUpload`. Must switch from `let controller` + callback props to creating the primitive directly.

**Step 1: Migrate the consumer**

Changes to make:

1. **Remove** `import type { ImageUploadController }` — replaced by `ImageUploadState`
2. **Add** `import { createImageUpload } from "~/lib/image-upload"`
3. **Remove** `let imageUpload: ImageUploadController | undefined;`
4. **Remove** `const [isImageBusy, setIsImageBusy] = createSignal(false);`
5. **Add** the primitive creation:
   ```typescript
   const upload = createImageUpload({
     existingAssetId: imageAssetId,
     existingImageUrl: savedImagePreviewUrl,
     onClearExisting: () => setImageAssetId(null),
     processingKind: "image:webp-thumbnail",
   });
   ```
6. **Update** `canSubmit` memo — replace `!isImageBusy()` with `!upload.isBusy()`
7. **Update** `handleSave` — replace `imageUpload?.hasStagedImage()` with `upload.hasStagedImage()` and `imageUpload?.enqueueFor(...)` with `upload.enqueueFor(...)`
8. **Update** `<ImageUpload>` JSX — replace callback props with `state={upload}`

The full `canSubmit` memo:
```typescript
const canSubmit = createMemo(() => {
  const input = getInput(form);
  return (
    !!input?.name?.trim() &&
    !!input?.categoryId &&
    !!input?.price?.trim() &&
    !upload.isBusy() &&
    !form.isSubmitting
  );
});
```

The full `<ImageUpload>` JSX block:
```tsx
<ImageUpload label="Foto Produk" state={upload}>
  <ImageUpload.Preview alt="Preview foto produk" />
  <div class="flex min-w-0 flex-1 flex-col gap-2">
    <ImageUpload.FileName fallback="Pilih foto untuk diunggah sebagai WebP" />
    <ImageUpload.Description>
      JPG/PNG, akan diproses menjadi WebP 400px.
    </ImageUpload.Description>
    <ImageUpload.StateText />
    <ImageUpload.Error />
    <ImageUpload.Actions>
      <ImageUpload.Trigger />
      <ImageUpload.Remove />
    </ImageUpload.Actions>
  </div>
</ImageUpload>
```

The `handleSave` changes:
```typescript
// Before:
const hasStagedImage = imageUpload?.hasStagedImage() ?? false;
// After:
const hasStagedImage = upload.hasStagedImage();

// Before:
const enqueueResult = await imageUpload?.enqueueFor(
  createAssetProcessingTarget("productImage", savedProductId)
);
// After:
const enqueueResult = await upload.enqueueFor(
  createAssetProcessingTarget("productImage", savedProductId)
);
```

**Step 2: Run typecheck**

Run: `bun x tsc --noEmit` (workdir: `apps/pos-app`)
Expected: PASS — no errors

**Step 3: Run all image upload tests**

Run: `bun x vitest run apps/pos-app/src/lib/__test__/image-upload.test.ts apps/pos-app/src/components/__test__/image-upload.test.tsx`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add apps/pos-app/src/pages/settings/product-categories/product-form.tsx
git commit -m "refactor(pos-app): migrate product-form to createImageUpload primitive"
```

---

## Task 6: Cleanup — Remove Dead Code

**Files:**
- Verify no remaining imports of `ImageUploadController`
- Verify no remaining references to old props

**Step 1: Search for any remaining old API usage**

Run: `rg "ImageUploadController" apps/pos-app/src/`
Expected: No matches

Run: `rg "onController|onBusyChange|onExistingAssetClear" apps/pos-app/src/`
Expected: No matches

**Step 2: Run lint check**

Run: `bun x ultracite check` (workdir: `apps/pos-app`)
Expected: No errors related to changed files

**Step 3: Run full test suite**

Run: `bun x vitest run` (workdir: `apps/pos-app`)
Expected: ALL PASS

---

## Task 7: Final Verification

**Step 1: Run typecheck**

Run: `bun x tsc --noEmit` (workdir: `apps/pos-app`)
Expected: PASS

**Step 2: Run lint**

Run: `bun x ultracite check` (workdir: `apps/pos-app`)
Expected: PASS

**Step 3: Run all tests**

Run: `bun x vitest run` (workdir: `apps/pos-app`)
Expected: ALL PASS

---

## Summary of API Changes

### Before (callback-based)
```tsx
let imageUpload: ImageUploadController | undefined;
const [isImageBusy, setIsImageBusy] = createSignal(false);

<ImageUpload
  existingAssetId={imageAssetId()}
  existingImageUrl={savedImagePreviewUrl()}
  label="Foto Produk"
  onBusyChange={setIsImageBusy}
  onController={(c) => { imageUpload = c; }}
  onExistingAssetClear={() => setImageAssetId(null)}
  processingKind="image:webp-thumbnail"
>
```

### After (primitive-based)
```tsx
const upload = createImageUpload({
  existingAssetId: imageAssetId,
  existingImageUrl: savedImagePreviewUrl,
  onClearExisting: () => setImageAssetId(null),
  processingKind: "image:webp-thumbnail",
});

<ImageUpload label="Foto Produk" state={upload}>
```

### What was eliminated
| Old pattern | New pattern |
|-------------|-------------|
| `let controller` mutable ref | `const upload = createImageUpload(...)` — available immediately |
| `onController` callback prop | N/A — parent creates primitive directly |
| `onBusyChange` callback + separate signal | `upload.isBusy()` — read in memos directly |
| `onExistingAssetClear` callback | `onClearExisting` option on primitive |
| `existingAssetId={value}` passing snapshot | `existingAssetId: accessor` — stays reactive |
| `existingImageUrl={value}` passing snapshot | `existingImageUrl: accessor` — stays reactive |
| `ImageUploadController` interface | `ImageUploadState` interface (from primitive) |
