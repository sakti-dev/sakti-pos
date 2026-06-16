import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import { ImageUpload } from "~/components/image-upload";
import { createImageUpload } from "~/lib/assets/image-upload";

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

vi.mock("~/components/ui/button", (_importOriginal) => ({
  Button: (props: {
    children?: JSX.Element;
    class?: string;
    disabled?: boolean;
    onClick?: () => void;
    type?: "button" | "submit";
    variant?: string;
  }) => (
    <button
      class={props.class}
      disabled={props.disabled}
      onClick={props.onClick}
      type={props.type}
    >
      {props.children}
    </button>
  ),
}));

const leadingSlashRegex = /^\//;

const user = userEvent.setup();

describe("ImageUpload", () => {
  test("trigger opens the plugin-owned picker directly", async () => {
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
    mockPluginPickImage.mockResolvedValue({
      jobId: "job-test-1",
      previewPath: "/data/app_cache/sakti-image/previews/test_preview.jpg",
      previewMimeType: "image/jpeg",
      status: "pending",
    });
    mockListen.mockResolvedValue(mockUnlisten);

    const upload = createImageUpload({});

    render(() => (
      <ImageUpload label="Foto Produk" state={upload}>
        <ImageUpload.FileName fallback="Belum ada foto" />
        <ImageUpload.Trigger />
      </ImageUpload>
    ));

    await user.click(screen.getByText("Pilih Foto"));

    expect(mockPluginPickImage).toHaveBeenCalledOnce();
    expect(upload.hasStagedImage()).toBe(true);
  });

  test("stages a picked image and shows preview", async () => {
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
    mockPluginPickImage.mockResolvedValue({
      jobId: "job-test-2",
      previewPath: "/data/app_cache/sakti-image/previews/abc123_preview.jpg",
      previewMimeType: "image/jpeg",
      status: "pending",
    });
    mockListen.mockResolvedValue(mockUnlisten);

    const upload = createImageUpload({});

    render(() => (
      <ImageUpload label="Foto Produk" state={upload}>
        <ImageUpload.Preview alt="Preview foto produk" />
        <ImageUpload.FileName fallback="Pilih foto untuk diunggah" />
        <ImageUpload.StateText />
        <ImageUpload.Trigger />
      </ImageUpload>
    ));

    await user.click(screen.getByText("Pilih Foto"));

    expect(upload.hasStagedImage()).toBe(true);
    expect(upload.jobId()).toBe("job-test-2");
    expect(
      screen.getByRole("img", { name: "Preview foto produk" })
    ).toBeInTheDocument();
  });
});
