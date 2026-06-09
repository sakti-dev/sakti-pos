import { createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockConvertFileSrc = vi.fn();
const mockPluginPickImage = vi.fn();
const mockListen = vi.fn();
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
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
}) {
  return {
    jobId: overrides?.jobId ?? "job-abc-123",
    previewPath:
      overrides?.previewPath ?? "/data/app_cache/sakti-image/preview_abc.jpg",
    previewMimeType: overrides?.previewMimeType ?? "image/jpeg",
    status: "pending" as const,
  };
}

function makeJobCompletedEvent(jobId: string) {
  return {
    jobId,
    assetPath: "/data/app_cache/sakti-image/assets/abc.webp",
    contentHash: "sha256:abcdef",
    contentType: "image/webp",
    byteSize: 42_000,
    width: 400,
    height: 300,
    originalFilename: "photo.jpg",
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("createImageUpload (plugin-owned picker)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
    mockListen.mockResolvedValue(mockUnlisten);
  });

  test("pickImage calls plugin pick_image", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(makePluginPickResponse());

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

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

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

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

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();

    expect(upload.jobId()).toBe("job-unique-42");
  });

  test("isReady is false immediately after pickImage returns", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(makePluginPickResponse());

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();

    expect(upload.isReady()).toBe(false);
    expect(upload.isBusy()).toBe(false);
  });

  test("pickImage sets up listeners for job completion and failure", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(makePluginPickResponse());

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();

    expect(mockListen).toHaveBeenCalledTimes(2);
    expect(mockListen).toHaveBeenNthCalledWith(
      1,
      "image_pipeline://job_completed",
      expect.any(Function)
    );
    expect(mockListen).toHaveBeenNthCalledWith(
      2,
      "image_pipeline://job_failed",
      expect.any(Function)
    );
  });

  test("onAssetReady is called when job_completed matches active jobId", async () => {
    const { createImageUpload } = await import("../image-upload");
    const onAssetReady = vi.fn();
    const activeJobId = "job-active-99";

    mockPluginPickImage.mockResolvedValue(
      makePluginPickResponse({ jobId: activeJobId })
    );
    mockListen.mockImplementation(
      (_eventName: string, handler: (event: { payload: unknown }) => void) => {
        // Simulate the plugin emitting a completion event for our job
        handler({ payload: makeJobCompletedEvent(activeJobId) });
        return mockUnlisten;
      }
    );

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
      onAssetReady,
    });

    await upload.pickImage();

    expect(onAssetReady).toHaveBeenCalledOnce();
    expect(onAssetReady).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: activeJobId,
        assetPath: expect.stringContaining("assets"),
        contentHash: "sha256:abcdef",
      })
    );
  });

  test("isReady becomes true after job_completed event", async () => {
    const { createImageUpload } = await import("../image-upload");
    const activeJobId = "job-ready-77";

    mockPluginPickImage.mockResolvedValue(
      makePluginPickResponse({ jobId: activeJobId })
    );
    mockListen.mockImplementation(
      (_eventName: string, handler: (event: { payload: unknown }) => void) => {
        handler({ payload: makeJobCompletedEvent(activeJobId) });
        return mockUnlisten;
      }
    );

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();
    expect(upload.isReady()).toBe(true);
  });

  test("job_failed event surfaces an error and keeps the staged image pending", async () => {
    const { createImageUpload } = await import("../image-upload");
    const activeJobId = "job-failed-88";

    mockPluginPickImage.mockResolvedValue(
      makePluginPickResponse({ jobId: activeJobId })
    );
    mockListen.mockImplementation(
      (eventName: string, handler: (event: { payload: unknown }) => void) => {
        if (eventName === "image_pipeline://job_failed") {
          handler({
            payload: {
              jobId: activeJobId,
              error: "encoder crash",
              attempts: 1,
              maxAttempts: 1,
              terminal: true,
            },
          });
        }
        return mockUnlisten;
      }
    );

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();

    expect(upload.hasStagedImage()).toBe(true);
    expect(upload.isReady()).toBe(false);
    expect(upload.error()).toBe("encoder crash");
  });

  test("state does NOT expose enqueueFor — plugin owns the pipeline", async () => {
    const { createImageUpload } = await import("../image-upload");

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    expect((upload as Record<string, unknown>).enqueueFor).toBeUndefined();
  });

  test("clear removes local state without calling old deleteTempProductPhoto", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(makePluginPickResponse());

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();
    expect(upload.hasStagedImage()).toBe(true);

    upload.clear();

    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.hasImage()).toBe(false);
    expect(upload.jobId()).toBeNull();
    expect(upload.previewUrl()).toBeNull();
  });

  test("pickImage sets error on plugin failure", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockRejectedValue(new Error("Camera denied"));

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();

    expect(upload.hasImage()).toBe(false);
    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.error()).toBe("Camera denied");
    expect(upload.jobId()).toBeNull();
  });

  test("pickImage handles picker cancellation gracefully", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockRejectedValue(new Error("Picker cancelled"));

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();

    expect(upload.hasImage()).toBe(false);
    expect(upload.error()).toBe("");
  });

  test("clear unsubscribes the job_completed listener", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage.mockResolvedValue(makePluginPickResponse());

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();
    upload.clear();

    expect(mockUnlisten).toHaveBeenCalledTimes(2);
  });

  test("second pickImage cleans up first listener before setting new one", async () => {
    const { createImageUpload } = await import("../image-upload");
    mockPluginPickImage
      .mockResolvedValueOnce(makePluginPickResponse({ jobId: "job-1" }))
      .mockResolvedValueOnce(makePluginPickResponse({ jobId: "job-2" }));

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    await upload.pickImage();
    expect(upload.jobId()).toBe("job-1");

    await upload.pickImage();
    expect(upload.jobId()).toBe("job-2");

    expect(mockUnlisten).toHaveBeenCalledTimes(2);
  });

  test("existing image shows preview without picking", async () => {
    const { createImageUpload } = await import("../image-upload");
    const [existingId] = createSignal("asset-existing-1");
    const [existingUrl] = createSignal("data:image/webp;base64,existing-abc");

    const upload = createImageUpload({
      existingAssetId: existingId,
      existingImageUrl: existingUrl,
      processingKind: "image:webp-thumbnail",
    });

    expect(upload.hasImage()).toBe(true);
    expect(upload.hasStagedImage()).toBe(false);
    expect(upload.previewUrl()).toBe("data:image/webp;base64,existing-abc");
  });
});
