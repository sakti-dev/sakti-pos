import { createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockPickProductPhoto = vi.fn();
const mockDeleteTempProductPhoto = vi.fn();
const mockEnqueueAssetProcessing = vi.fn();

vi.mock("~/lib/assets/picking", () => ({
  deleteTempProductPhoto: (...args: unknown[]) =>
    mockDeleteTempProductPhoto(...args),
  pickProductPhoto: (...args: unknown[]) => mockPickProductPhoto(...args),
}));

vi.mock("~/lib/assets/processing", () => ({
  enqueueAssetProcessing: (...args: unknown[]) =>
    mockEnqueueAssetProcessing(...args),
}));

describe("createImageUpload", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

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
      "/tmp/product_photo_inputs/gallery_1.png"
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
      })
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
      "/tmp/product_photo_inputs/gallery_1.png"
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
