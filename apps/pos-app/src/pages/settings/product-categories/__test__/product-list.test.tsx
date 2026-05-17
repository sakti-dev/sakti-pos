import { render, screen, waitFor } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Category, Product } from "~/db/menu";
import {
  notifyAssetAttachmentReady,
  resetDomainCatalogVersionsForTest,
} from "~/lib/assets/cache";

vi.mock("~/lib/assets/adapters/product-images", () => ({
  productImageAdapter: {
    resolveCachedImageUrl: vi.fn(() => Promise.resolve(null)),
    getPendingPreviewUrl: vi.fn(() => Promise.resolve(null)),
    startEventListeners: vi.fn(() => Promise.resolve()),
    stopEventListeners: vi.fn(),
    useImageUrl: vi.fn(() => () => null),
  },
}));

const mockCategories: Category[] = [
  {
    id: "category-1",
    merchantId: "merchant-1",
    name: "Minuman",
    sortOrder: 0,
    isActive: true,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    isSynced: false,
  },
  {
    id: "category-2",
    merchantId: "merchant-1",
    name: "Makanan",
    sortOrder: 1,
    isActive: true,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    isSynced: false,
  },
];

const mockProducts: Product[] = [
  {
    id: "product-1",
    name: "Kopi Susu",
    priceMinorUnits: 15_000,
    categoryId: "category-1",
    merchantId: "merchant-1",
    imageUrl: null,
    isActive: true,
    createdAt: "",
    updatedAt: "",
    sortOrder: 0,
    deletedAt: null,
    isSynced: false,
  },
  {
    id: "product-2",
    name: "Teh Manis",
    priceMinorUnits: 8000,
    categoryId: "category-1",
    merchantId: "merchant-1",
    imageUrl: null,
    isActive: true,
    createdAt: "",
    updatedAt: "",
    sortOrder: 0,
    deletedAt: null,
    isSynced: false,
  },
  {
    id: "product-3",
    name: "Nasi Goreng",
    priceMinorUnits: 20_000,
    categoryId: "category-2",
    merchantId: "merchant-1",
    imageUrl: null,
    isActive: false,
    createdAt: "",
    updatedAt: "",
    sortOrder: 0,
    deletedAt: null,
    isSynced: false,
  },
];

const mockNavigate = vi.fn();
const mockDeleteProduct = vi.fn();
const mockUpdateProduct = vi.fn();

vi.mock("@solidjs/router", () => ({
  A: (props: { children: JSX.Element; href: string }) => (
    <a data-testid="link" href={props.href}>
      {props.children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock("~/db/menu", () => ({
  getCategories: vi.fn(() => Promise.resolve(mockCategories)),
  getProducts: vi.fn(() => Promise.resolve(mockProducts)),
  deleteProduct: (...args: unknown[]) => mockDeleteProduct(...args),
  updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
}));

vi.mock("~/components/ui/page-header", () => ({
  PageHeader: (props: { backHref?: string; children: JSX.Element }) => (
    <div data-testid="page-header">
      <h1>{props.children}</h1>
    </div>
  ),
}));

vi.mock("~/components/ui/button", () => ({
  Button: (props: { children: JSX.Element; size?: string }) => (
    <button data-testid="btn-add" type="button">
      {props.children}
    </button>
  ),
}));

vi.mock("~/components/ui/select", () => ({
  Select: (props: {
    children?: unknown;
    class?: string;
    label?: string;
    onChange: (v: unknown) => void;
    options: { label: string; value: string | number }[];
    placeholder?: string;
    value?: unknown;
  }) => (
    <select
      data-testid="category-filter"
      onChange={(e) => props.onChange(e.currentTarget.value)}
      value={String(props.value ?? "")}
    >
      <option value="">Semua Kategori</option>
      <option value="1">Minuman</option>
      <option value="2">Makanan</option>
    </select>
  ),
}));

vi.mock("~/components/ui/skeleton", () => ({
  Skeleton: (props: { class?: string }) => (
    <div class={props.class} data-testid="skeleton" />
  ),
}));

vi.mock("~/components/confirm-drawer", () => ({
  ConfirmDrawer: (props: {
    open: boolean;
    message: string;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) => (
    <Show when={props.open}>
      <div data-testid="confirm-drawer">
        <h3>{props.title}</h3>
        <p>{props.message}</p>
        <button
          data-testid="confirm-btn"
          onClick={props.onConfirm}
          type="button"
        >
          {props.confirmLabel}
        </button>
      </div>
    </Show>
  ),
}));

vi.mock("solid-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ProductList from "../product-list";

describe("ProductList", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetDomainCatalogVersionsForTest();
  });

  test("renders products grouped by category", async () => {
    render(() => <ProductList />);
    await screen.findByText("Produk");
    await screen.findByText("Kopi Susu");
    expect(screen.getAllByText("Minuman").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Makanan").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Kopi Susu")).toBeInTheDocument();
    expect(screen.getByText("Teh Manis")).toBeInTheDocument();
    expect(screen.getByText("Nasi Goreng")).toBeInTheDocument();
  });

  test("shows active/inactive status for products", async () => {
    render(() => <ProductList />);
    await screen.findByText("Produk");
    await screen.findByText("Kopi Susu");
    const activeButtons = screen.getAllByText("Aktif");
    expect(activeButtons.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();
  });

  test("shows empty state when no products", async () => {
    const { getProducts } = await import("~/db/menu");
    vi.mocked(getProducts).mockResolvedValueOnce([]);
    render(() => <ProductList />);
    await screen.findByText("Belum ada produk");
    expect(screen.getByText("Belum ada produk")).toBeInTheDocument();
  });

  test("shows category filter and add button", async () => {
    render(() => <ProductList />);
    await screen.findByText("Produk");
    expect(screen.getByTestId("category-filter")).toBeInTheDocument();
    expect(screen.getByText("+ Tambah")).toBeInTheDocument();
  });

  test("refetches products when product asset attachment is ready", async () => {
    const { getProducts } = await import("~/db/menu");

    render(() => <ProductList />);
    await screen.findByText("Kopi Susu");
    expect(getProducts).toHaveBeenCalledTimes(1);

    notifyAssetAttachmentReady({
      assetId: "asset-1",
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });

    await waitFor(() => expect(getProducts).toHaveBeenCalledTimes(2));
  });

  test("shows product count grouped correctly", async () => {
    render(() => <ProductList />);
    await screen.findByText("Produk");
    await screen.findByText("Teh Manis");
    expect(screen.getAllByText("Kopi Susu").length).toBe(1);
    expect(screen.getAllByText("Teh Manis").length).toBe(1);
  });
});
