import { useParams } from "@solidjs/router";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCreateProduct = vi.fn();
const mockUpdateProduct = vi.fn();
const mockPickProductPhoto = vi.fn();
const mockDeleteTempProductPhoto = vi.fn();
const mockEnqueueAssetProcessing = vi.fn();
const mockResolveCachedProductImageUrl = vi.fn();
const mockToastSuccess = vi.fn();
const mockSyncNow = vi.fn();
let mockMerchantId: string | null = "merchant-1";

const mockCategories = [
  {
    id: "category-1",
    name: "Minuman",
    sortOrder: 0,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "category-2",
    name: "Makanan",
    sortOrder: 1,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
];

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: vi.fn(() => ({})),
}));

vi.mock("~/db/menu", () => ({
  getCategories: vi.fn(() => Promise.resolve(mockCategories)),
  getProduct: vi.fn(() =>
    Promise.resolve({
      id: "product-1",
      name: "Kopi Susu",
      priceMinorUnits: 15_000,
      categoryId: "category-1",
      imageAssetId: "asset-existing",
      imageUrl: null,
      isActive: true,
      createdAt: "",
      updatedAt: "",
    })
  ),
  createProduct: (...args: unknown[]) => mockCreateProduct(...args),
  updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
}));

vi.mock("~/store/outlet", () => ({
  currentMerchantId: () => mockMerchantId,
}));

vi.mock("~/store/sync", () => ({
  syncNow: (...args: unknown[]) => mockSyncNow(...args),
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

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock("~/lib/assets/adapters/product-images", () => ({
  productImageAdapter: {
    resolveCachedImageUrl: (...args: unknown[]) =>
      mockResolveCachedProductImageUrl(...args),
    getPendingPreviewUrl: vi.fn(() => Promise.resolve(null)),
    startEventListeners: vi.fn(() => Promise.resolve()),
    stopEventListeners: vi.fn(),
    useImageUrl: vi.fn(() => () => null),
  },
}));

vi.mock("~/components/ui/page-header", () => ({
  PageHeader: (props: { backHref?: string; children: JSX.Element }) => (
    <div data-testid="page-header">
      <span data-testid="back-href">{props.backHref ?? ""}</span>
      <h1>{props.children}</h1>
    </div>
  ),
}));

vi.mock("~/components/ui/button", () => ({
  Button: (props: {
    children: JSX.Element;
    class?: string;
    disabled?: boolean;
    onClick?: () => void;
    size?: string;
    type?: "button" | "submit";
  }) => (
    <button
      class={props.class}
      data-testid={props.type === "submit" ? "save-btn" : "action-btn"}
      disabled={props.disabled}
      onClick={props.onClick}
      type={props.type ?? "button"}
    >
      {props.children}
    </button>
  ),
}));

vi.mock("~/components/ui/select", () => ({
  Select: (props: {
    label?: string;
    name?: string;
    onChange: (v: unknown) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    value?: unknown;
  }) => (
    <select
      data-testid="category-select"
      name={props.name}
      onChange={(e) => props.onChange(e.currentTarget.value)}
      value={String(props.value ?? "")}
    >
      <option value="">{props.placeholder}</option>
      <option value="category-1">Minuman</option>
      <option value="category-2">Makanan</option>
    </select>
  ),
}));

vi.mock("solid-sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

import ProductForm from "../product-form";

const user = userEvent.setup();

describe("ProductForm (create mode)", () => {
  beforeEach(() => {
    mockResolveCachedProductImageUrl.mockResolvedValue(null);
    mockSyncNow.mockResolvedValue({
      mode: "skipped",
      pull: { rows_received: 0, server_time: "" },
      purged: 0,
      push: { server_time: "", server_wins_count: 0, tables_synced: [] },
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    vi.clearAllMocks();
    mockMerchantId = "merchant-1";
  });

  test("shows 'Tambah Produk' title", () => {
    render(() => <ProductForm />);
    expect(screen.getByText("Tambah Produk")).toBeInTheDocument();
  });

  test("shows name, category, price, and photo picker", () => {
    render(() => <ProductForm />);
    expect(
      screen.getByPlaceholderText("Contoh: Kopi Susu")
    ).toBeInTheDocument();
    expect(screen.getByTestId("category-select")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();
    expect(screen.getAllByText("Pilih Foto").length).toBeGreaterThan(0);
  });

  test("submit is disabled when required fields are empty", () => {
    render(() => <ProductForm />);
    expect(screen.getByTestId("save-btn")).toBeDisabled();
  });

  test("submit is enabled when all required fields are filled", async () => {
    render(() => <ProductForm />);
    await user.type(screen.getByPlaceholderText("Contoh: Kopi Susu"), "Es Teh");
    await user.selectOptions(
      screen.getByTestId("category-select"),
      "category-1"
    );
    await user.type(screen.getByPlaceholderText("0"), "10000");
    expect(screen.getByTestId("save-btn")).not.toBeDisabled();
  });

  test("category select is populated with options", () => {
    render(() => <ProductForm />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveTextContent("Minuman");
    expect(options[2]).toHaveTextContent("Makanan");
  });

  test("submit calls createProduct with imageAssetId: null when no image is set", async () => {
    render(() => <ProductForm />);
    await user.type(screen.getByPlaceholderText("Contoh: Kopi Susu"), "Es Teh");
    await user.selectOptions(
      screen.getByTestId("category-select"),
      "category-1"
    );
    await user.type(screen.getByPlaceholderText("0"), "10000");
    await user.click(screen.getByTestId("save-btn"));
    expect(mockCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ imageAssetId: null })
    );
    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  test("shows required asterisk on required fields", () => {
    render(() => <ProductForm />);
    expect(screen.getAllByText("*")).toHaveLength(3);
  });

  test("opens the photo source drawer when pilih foto is clicked", async () => {
    render(() => <ProductForm />);

    await user.click(screen.getAllByTestId("action-btn")[0]);

    expect(screen.getAllByText("Pilih Foto").length).toBeGreaterThan(0);
    expect(screen.getByText("Ambil Foto")).toBeInTheDocument();
    expect(screen.getByText("Pilih dari Galeri")).toBeInTheDocument();
  });

  test("choosing camera stages a temp photo without preparing a local asset", async () => {
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/photo_1.jpg",
      originalFilename: "photo_1.jpg",
      mimeType: "image/jpeg",
      source: "camera",
    });

    render(() => <ProductForm />);
    await user.click(screen.getAllByTestId("action-btn")[0]);
    await user.click(screen.getByText("Ambil Foto"));

    expect(mockPickProductPhoto).toHaveBeenCalledWith("camera");
    expect(
      await screen.findByText("Foto akan diproses saat disimpan.")
    ).toBeInTheDocument();
    expect(await screen.findByAltText("Preview foto produk")).toHaveAttribute(
      "src",
      "asset:///tmp/product_photo_inputs/photo_1.jpg"
    );
  });

  test("choosing gallery stages a temp photo without preparing a local asset", async () => {
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
      source: "gallery",
    });

    render(() => <ProductForm />);
    await user.click(screen.getAllByTestId("action-btn")[0]);
    await user.click(screen.getByText("Pilih dari Galeri"));

    expect(mockPickProductPhoto).toHaveBeenCalledWith("gallery");
  });

  test("submit saves the product immediately and enqueues staged photo processing", async () => {
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
      source: "gallery",
    });
    mockCreateProduct.mockResolvedValue({
      id: "product-2",
      merchantId: "merchant-1",
      name: "Es Teh",
      categoryId: "category-1",
      price: "10000",
      imageAssetId: null,
    });
    mockEnqueueAssetProcessing.mockResolvedValue({ jobId: "job-1" });

    render(() => <ProductForm />);
    await user.type(screen.getByPlaceholderText("Contoh: Kopi Susu"), "Es Teh");
    await user.selectOptions(
      screen.getByTestId("category-select"),
      "category-1"
    );
    await user.type(screen.getByPlaceholderText("0"), "10000");
    await user.click(screen.getAllByTestId("action-btn")[0]);
    await user.click(screen.getByText("Pilih dari Galeri"));
    await user.click(screen.getByTestId("save-btn"));

    expect(mockCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ imageAssetId: null })
    );
    expect(mockEnqueueAssetProcessing).toHaveBeenCalledWith({
      originalFilename: "menu.png",
      processingKind: "image:webp-thumbnail",
      sourceMimeType: "image/png",
      sourcePath: "/tmp/product_photo_inputs/gallery_1.png",
      target: {
        entityId: "product-2",
        entityType: "product",
        field: "image_asset_id",
      },
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Foto akan diproses di background"
    );
    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
  });

  test("submit navigates before starting background photo sync", async () => {
    const callOrder: string[] = [];
    mockNavigate.mockImplementation(() => {
      callOrder.push("navigate");
    });
    mockSyncNow.mockImplementation(() => {
      callOrder.push("sync");
      return Promise.resolve({
        mode: "skipped",
        pull: { rows_received: 0, server_time: "" },
        purged: 0,
        push: { server_time: "", server_wins_count: 0, tables_synced: [] },
      });
    });
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/gallery_1.png",
      originalFilename: "menu.png",
      mimeType: "image/png",
      source: "gallery",
    });
    mockCreateProduct.mockResolvedValue({
      id: "product-2",
      merchantId: "merchant-1",
      name: "Es Teh",
      categoryId: "category-1",
      price: "10000",
      imageAssetId: null,
    });
    mockEnqueueAssetProcessing.mockResolvedValue({ jobId: "job-1" });

    render(() => <ProductForm />);
    await user.type(screen.getByPlaceholderText("Contoh: Kopi Susu"), "Es Teh");
    await user.selectOptions(
      screen.getByTestId("category-select"),
      "category-1"
    );
    await user.type(screen.getByPlaceholderText("0"), "10000");
    await user.click(screen.getAllByTestId("action-btn")[0]);
    await user.click(screen.getByText("Pilih dari Galeri"));
    await user.click(screen.getByTestId("save-btn"));

    expect(mockNavigate).toHaveBeenCalledWith("/settings/products-categories", {
      replace: true,
    });
    await waitFor(() => expect(callOrder).toContain("sync"));
    expect(callOrder[0]).toBe("navigate");
  });

  test("removing a staged native photo deletes its temp file", async () => {
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/photo_1.jpg",
      originalFilename: "photo_1.jpg",
      mimeType: "image/jpeg",
      source: "camera",
    });

    render(() => <ProductForm />);
    await user.click(screen.getAllByTestId("action-btn")[0]);
    await user.click(screen.getByText("Ambil Foto"));
    await user.click(screen.getByText("Hapus"));

    expect(mockDeleteTempProductPhoto).toHaveBeenCalledWith(
      "/tmp/product_photo_inputs/photo_1.jpg"
    );
  });
});

describe("ProductForm (edit mode)", () => {
  beforeEach(() => {
    mockResolveCachedProductImageUrl.mockResolvedValue(null);
    mockSyncNow.mockResolvedValue({
      mode: "skipped",
      pull: { rows_received: 0, server_time: "" },
      purged: 0,
      push: { server_time: "", server_wins_count: 0, tables_synced: [] },
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    vi.clearAllMocks();
    mockMerchantId = "merchant-1";
  });

  test("shows 'Edit Produk' title", async () => {
    vi.mocked(useParams).mockReturnValue({ id: "1" });
    render(() => <ProductForm />);
    await screen.findByText("Edit Produk");
    expect(screen.getByText("Edit Produk")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Kopi Susu")).toBeInTheDocument();
    expect(screen.getByTestId("category-select")).toHaveValue("category-1");
    expect(screen.getByDisplayValue("15000")).toBeInTheDocument();
  });

  test("shows the existing product photo preview", async () => {
    vi.mocked(useParams).mockReturnValue({ id: "1" });
    mockResolveCachedProductImageUrl.mockResolvedValue(
      "data:image/webp;base64,d2VicA=="
    );

    render(() => <ProductForm />);

    expect(await screen.findByAltText("Preview foto produk")).toHaveAttribute(
      "src",
      "data:image/webp;base64,d2VicA=="
    );
    expect(screen.getByText("Ganti Foto")).toBeInTheDocument();
  });

  test("staging a photo after edit data loads does not delete the temp file", async () => {
    vi.mocked(useParams).mockReturnValue({ id: "1" });
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/edit_photo.jpg",
      originalFilename: "edit_photo.jpg",
      mimeType: "image/jpeg",
      source: "gallery",
    });

    render(() => <ProductForm />);
    await screen.findByDisplayValue("Kopi Susu");
    await user.click(screen.getAllByTestId("action-btn")[0]);
    await user.click(screen.getByText("Pilih dari Galeri"));
    await screen.findByText("Foto akan diproses saat disimpan.");

    expect(mockDeleteTempProductPhoto).not.toHaveBeenCalled();
  });

  test("edit submit preserves the current asset and enqueues replacement processing", async () => {
    vi.mocked(useParams).mockReturnValue({ id: "1" });
    mockPickProductPhoto.mockResolvedValue({
      path: "/tmp/product_photo_inputs/edit_photo.jpg",
      originalFilename: "edit_photo.jpg",
      mimeType: "image/jpeg",
      source: "gallery",
    });
    mockUpdateProduct.mockResolvedValue({
      id: "1",
      merchantId: "merchant-1",
      name: "Kopi Susu",
      categoryId: "category-1",
      price: "15000",
      imageAssetId: "asset-existing",
    });
    mockEnqueueAssetProcessing.mockResolvedValue({ jobId: "job-1" });

    render(() => <ProductForm />);
    await screen.findByDisplayValue("Kopi Susu");
    await user.click(screen.getAllByTestId("action-btn")[0]);
    await user.click(screen.getByText("Pilih dari Galeri"));
    await user.click(screen.getByTestId("save-btn"));

    expect(mockUpdateProduct).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ imageAssetId: "asset-existing" })
    );
    expect(mockEnqueueAssetProcessing).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ entityId: "1" }),
      })
    );
    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
  });
});
