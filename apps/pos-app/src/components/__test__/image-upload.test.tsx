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
