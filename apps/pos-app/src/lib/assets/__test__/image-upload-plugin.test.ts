import { createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockConvertFileSrc = vi.fn();
const mockPluginPickImage = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...args),
}));

vi.mock("~/lib/assets/plugin-bridge", () => ({
  pluginPickImage: (...args: unknown[]) => mockPluginPickImage(...args),
}));

const leadingSlashRegex = /^\//;

// ── Helpers ───────────────────────────────────────────────────

function makePluginPickResponse(overrides?: {
  jobId?: string;
  previewPath?: string;
  previewMimeType?: string;
  stagedSourcePath?: string;
}) {
  return {
    jobId: overrides?.jobId ?? "job-abc-123",
    stagedSourcePath:
      overrides?.stagedSourcePath ??
      "/data/app_cache/sakti-image/picked/source.jpg",
    previewPath:
      overrides?.previewPath ?? "/data/app_cache/sakti-image/preview_abc.jpg",
    previewMimeType: overrides?.previewMimeType ?? "image/jpeg",
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("createImageUpload (deferred compression)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
  });

  test("pickImage calls plugin pick_image", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(makePluginPickResponse());

    const upload = createImageUpload({});
    await upload.pickImage();

    expect(mockPluginPickImage).toHaveBeenCalledOnce();
    expect(mockPluginPickImage).toHaveBeenCalledWith({
      pickerMode: "image",
      compression: expect.objectContaining({
        maxLongEdge: expect.any(Number),
        previewMaxLongEdge: expect.any(Number),
      }),
    });
  });

  test("pickImage renders preview immediately from plugin previewPath", async () => {
    const { createImageUpload } = await import("../image-upload");
    const previewPath = "/data/app_cache/sakti-image/preview_abc.jpg";
    mockPluginPickImage.mockResolvedValue(
      makePluginPickResponse({ previewPath })
    );

    const upload = createImageUpload({});
    await upload.pickImage();

    expect(upload.hasImage()).toBe(true);
    expect(upload.hasStagedImage()).toBe(true);
    expect(upload.previewUrl()).toContain("asset.localhost");
    expect(upload.previewUrl()).toContain("preview_abc.jpg");
    expect(mockConvertFileSrc).toHaveBeenCalledWith(previewPath);
  });

  test("pickImage stores the jobId from plugin response", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(
      makePluginPickResponse({ jobId: "job-unique-42" })
    );

    const upload = createImageUpload({});
    await upload.pickImage();

    expect(upload.jobId()).toBe("job-unique-42");
  });

  test("pickImage returns result with jobId and stagedSourcePath", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(
      makePluginPickResponse({
        jobId: "job-result-1",
        stagedSourcePath: "/data/app_cache/sakti-image/picked/source.jpg",
      })
    );

    const upload = createImageUpload({});
    const result = await upload.pickImage();

    expect(result).toEqual({
      jobId: "job-result-1",
      stagedSourcePath: "/data/app_cache/sakti-image/picked/source.jpg",
      previewPath: expect.any(String),
    });
  });

  test("pickImage stores stagedSourcePath", async () => {
    const { createImageUpload } = await import("../image-upload");
    const stagedSourcePath = "/data/app_cache/sakti-image/picked/source.jpg";
    mockPluginPickImage.mockResolvedValue(
      makePluginPickResponse({ stagedSourcePath })
    );

    const upload = createImageUpload({});
    await upload.pickImage();

    expect(upload.stagedSourcePath()).toBe(stagedSourcePath);
  });

  test("pickImage is not busy after completion", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(makePluginPickResponse());

    const upload = createImageUpload({});
    await upload.pickImage();

    expect(upload.isBusy()).toBe(false);
  });

  test("state does NOT expose isReady", async () => {
    const { createImageUpload } = await import("../image-upload");

    const upload = createImageUpload({});

    expect(
      (upload as unknown as Record<string, unknown>).isReady
    ).toBeUndefined();
  });

  test("clear removes local state", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(makePluginPickResponse());

    const upload = createImageUpload({});
    await upload.pickImage();
    expect(upload.hasStagedImage()).toBe(true);

    upload.clear();

    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.hasImage()).toBe(false);
    expect(upload.jobId()).toBeNull();
    expect(upload.previewUrl()).toBeNull();
    expect(upload.stagedSourcePath()).toBeNull();
  });

  test("pickImage sets error on plugin failure", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockRejectedValue(new Error("Camera denied"));

    const upload = createImageUpload({});
    await upload.pickImage();

    expect(upload.hasImage()).toBe(false);
    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.error()).toBe("Camera denied");
    expect(upload.jobId()).toBeNull();
  });

  test("pickImage handles picker cancellation gracefully", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockRejectedValue(new Error("Picker cancelled"));

    const upload = createImageUpload({});
    await upload.pickImage();

    expect(upload.hasImage()).toBe(false);
    expect(upload.error()).toBe("");
  });

  test("pickImage returns null on failure", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockRejectedValue(new Error("Camera denied"));

    const upload = createImageUpload({});
    const result = await upload.pickImage();

    expect(result).toBeNull();
  });

  test("second pickImage cleans up first staged image before setting new one", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage
      .mockResolvedValueOnce(makePluginPickResponse({ jobId: "job-1" }))
      .mockResolvedValueOnce(makePluginPickResponse({ jobId: "job-2" }));

    const upload = createImageUpload({});

    await upload.pickImage();
    expect(upload.jobId()).toBe("job-1");

    await upload.pickImage();
    expect(upload.jobId()).toBe("job-2");
  });

  test("existing image shows preview without picking", async () => {
    const { createImageUpload } = await import("../image-upload");
    const [existingId] = createSignal("asset-existing-1");
    const [existingUrl] = createSignal("data:image/webp;base64,existing-abc");

    const upload = createImageUpload({
      existingAssetId: existingId,
      existingImageUrl: existingUrl,
    });

    expect(upload.hasImage()).toBe(true);
    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.previewUrl()).toBe("data:image/webp;base64,existing-abc");
  });
});
