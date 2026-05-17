import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import { ImageUpload } from "~/components/image-upload";
import { createImageUpload } from "~/lib/assets/image-upload";

const mockConvertFileSrc = vi.fn();
const mockPickProductPhoto = vi.fn();
const mockDeleteTempProductPhoto = vi.fn();
const mockEnqueueAssetProcessing = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...args),
}));

vi.mock("~/lib/assets/picking", () => ({
  deleteTempProductPhoto: (...args: unknown[]) =>
    mockDeleteTempProductPhoto(...args),
  pickProductPhoto: (...args: unknown[]) => mockPickProductPhoto(...args),
}));

vi.mock("~/lib/assets/processing", () => ({
  enqueueAssetProcessing: (...args: unknown[]) =>
    mockEnqueueAssetProcessing(...args),
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

vi.mock("~/components/ui/drawer", () => ({
  Drawer: (props: { children: JSX.Element; open: boolean }) =>
    props.open ? props.children : null,
  DrawerClose: (props: { children?: JSX.Element }) => (
    <div>{props.children}</div>
  ),
  DrawerContent: (props: { children?: JSX.Element }) => (
    <div>{props.children}</div>
  ),
  DrawerDescription: (props: { children?: JSX.Element }) => (
    <div>{props.children}</div>
  ),
  DrawerHeader: (props: { children?: JSX.Element }) => (
    <div>{props.children}</div>
  ),
  DrawerOverlay: (props: { children?: JSX.Element }) => (
    <div>{props.children}</div>
  ),
  DrawerPortal: (props: { children?: JSX.Element }) => (
    <div>{props.children}</div>
  ),
  DrawerTitle: (props: { children: JSX.Element }) => <h2>{props.children}</h2>,
  DrawerTrigger: (props: { children?: JSX.Element }) => (
    <div>{props.children}</div>
  ),
}));

const leadingSlashRegex = /^\//;

const user = userEvent.setup();

describe("ImageUpload", () => {
  test("photo source drawer shows only camera and gallery actions", async () => {
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/cam_1.jpg",
      originalFilename: "photo.jpg",
      mimeType: "image/jpeg",
      source: "camera",
    });

    const upload = createImageUpload({
      processingKind: "image:webp-thumbnail",
    });

    render(() => (
      <ImageUpload label="Foto Produk" state={upload}>
        <ImageUpload.FileName fallback="Belum ada foto" />
        <ImageUpload.Trigger />
      </ImageUpload>
    ));

    await user.click(screen.getByText("Pilih Foto"));

    expect(
      screen.getByText("Pilih Foto", { selector: "h2" })
    ).toBeInTheDocument();
    expect(screen.getByText("Ambil Foto")).toBeInTheDocument();
    expect(screen.getByText("Pilih dari Galeri")).toBeInTheDocument();
    expect(screen.queryByText("Batal")).not.toBeInTheDocument();

    await user.click(screen.getByText("Ambil Foto"));

    expect(await screen.findByText("photo.jpg")).toBeInTheDocument();
  });

  test("stages a picked image and enqueues it for a supplied asset target", async () => {
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
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
      "https://asset.localhost/tmp/product_photo_inputs/gallery_1.png"
    );
    expect(
      screen.getByText("Foto akan diproses saat disimpan.")
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
