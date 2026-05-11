import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ProductWithCategory } from "~/db/orders";

const mockGroupedData: {
  categoryName: string;
  products: ProductWithCategory[];
}[] = [
  {
    categoryName: "Minuman",
    products: [
      {
        categoryId: "category-1",
        categoryName: "Minuman",
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "product-1",
        imageUrl: null,
        isActive: true,
        merchantId: "merchant-1",
        name: "Kopi Susu",
        price: 15_000,
        sortOrder: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        isSynced: false,
      },
      {
        categoryId: "category-1",
        categoryName: "Minuman",
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "product-2",
        imageUrl: null,
        isActive: true,
        merchantId: "merchant-1",
        name: "Teh Manis",
        price: 8000,
        sortOrder: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        isSynced: false,
      },
    ],
  },
  {
    categoryName: "Makanan",
    products: [
      {
        categoryId: "category-2",
        categoryName: "Makanan",
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "product-3",
        imageUrl: null,
        isActive: true,
        merchantId: "merchant-1",
        name: "Nasi Goreng",
        price: 20_000,
        sortOrder: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        isSynced: false,
      },
    ],
  },
];

vi.mock("~/db/orders", () => ({
  getActiveProductsByCategory: vi.fn(() => Promise.resolve(mockGroupedData)),
  createOrder: vi.fn(() => Promise.resolve("2026-05-04-001")),
}));

vi.mock("~/store/auth", () => ({
  currentUser: vi.fn(() => ({ id: "staff-1", name: "Kasir", role: "cashier" })),
  currentUserRole: vi.fn(() => "cashier"),
}));

vi.mock("~/store/cart", () => ({
  cartItems: vi.fn(() => []),
  cartTotal: vi.fn(() => 0),
  clearCart: vi.fn(),
}));

const mockPrintReceipt = vi.fn();
const mockGetDefaultPrinter = vi.fn<() => string | null>(() => null);
const mockGetOutletReceiptHeader = vi.fn();
const mockCurrentOutletId = vi.fn<() => string | null>(() => null);
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

vi.mock("~/lib/printer/client", () => ({
  printReceipt: (...args: unknown[]) => mockPrintReceipt(...args),
  getDefaultPrinter: () => mockGetDefaultPrinter(),
}));

vi.mock("~/db/outlets", () => ({
  getAllOutlets: vi.fn(() => Promise.resolve([])),
  getOutletReceiptHeader: (...args: unknown[]) =>
    mockGetOutletReceiptHeader(...args),
}));

vi.mock("~/store/outlet", () => ({
  currentOutletId: () => mockCurrentOutletId(),
  currentOutletTimezone: () => "Asia/Jakarta",
}));

vi.mock("~/store/responsive", () => ({
  useIsPhone: () => () => false,
}));

vi.mock("~/components/layout", () => ({
  AppShell: (props: {
    children: JSX.Element;
    class?: string;
    title: string;
    topbarSuffix?: JSX.Element;
  }) => (
    <div>
      <h1>{props.title}</h1>
      {props.topbarSuffix}
      {props.children}
    </div>
  ),
}));

vi.mock("~/components/pos/category-tabs", () => ({
  CategoryTabs: (props: {
    categories: string[];
    onChange: (v: string | null) => void;
    selected: string | null;
  }) => (
    <div data-testid="category-tabs">
      <span data-testid="categories">{props.categories.join(", ")}</span>
      <button
        data-testid="select-category"
        onClick={() => props.onChange("Minuman")}
        type="button"
      >
        Select Minuman
      </button>
      <button
        data-testid="clear-category"
        onClick={() => props.onChange(null)}
        type="button"
      >
        Clear
      </button>
    </div>
  ),
}));

vi.mock("~/components/pos/product-grid", () => ({
  ProductGrid: (props: { products: ProductWithCategory[] }) => (
    <div data-testid="product-grid">
      <For each={props.products}>
        {(p) => <span data-testid="product-name">{p.name}</span>}
      </For>
    </div>
  ),
}));

vi.mock("~/components/pos/cart-panel", () => ({
  CartPanel: (props: { onPay: () => void }) => (
    <div data-testid="cart-panel">
      <button data-testid="cart-panel-pay" onClick={props.onPay} type="button">
        Bayar
      </button>
    </div>
  ),
  CartSidebar: (props: { onPay: () => void }) => (
    <div data-testid="cart-sidebar">
      <button
        data-testid="cart-sidebar-pay"
        onClick={props.onPay}
        type="button"
      >
        Bayar
      </button>
    </div>
  ),
}));

vi.mock("~/components/pos/payment-dialog", () => ({
  PaymentDialog: (props: {
    loading: boolean;
    onClose: () => void;
    onConfirm: (data: {
      amountPaid: number | null;
      changeAmount: number | null;
      paymentMethod: "cash" | "qris";
    }) => void;
    open: boolean;
  }) => (
    <Show when={props.open}>
      <div data-testid="payment-dialog">
        <button
          data-testid="payment-close"
          onClick={props.onClose}
          type="button"
        >
          Close
        </button>
        <button
          data-testid="payment-confirm"
          onClick={() =>
            props.onConfirm({
              amountPaid: 50_000,
              changeAmount: 30_000,
              paymentMethod: "cash",
            })
          }
          type="button"
        >
          Confirm
        </button>
      </div>
    </Show>
  ),
}));

vi.mock("~/components/ui/text-field", () => ({
  TextField: (props: {
    children: JSX.Element;
    onChange: (v: string) => void;
    value: string;
  }) => (
    <div data-testid="text-field">
      {props.children}
      <input
        data-testid="search-input"
        onInput={(e) => props.onChange(e.currentTarget.value)}
        value={props.value}
      />
    </div>
  ),
  TextFieldInput: (props: {
    class?: string;
    placeholder?: string;
    type: string;
  }) => (
    <input
      class={props.class}
      placeholder={props.placeholder}
      type={props.type}
    />
  ),
}));

vi.mock("solid-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import POS from "../pos-shell";

const user = userEvent.setup();

describe("POS page", () => {
  beforeEach(() => {
    mockPrintReceipt.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockCurrentOutletId.mockReturnValue(null);
  });

  test("renders title 'Kasir'", async () => {
    render(() => <POS />);
    expect(await screen.findByText("Kasir")).toBeInTheDocument();
  });

  test("shows CategoryTabs and ProductGrid", async () => {
    render(() => <POS />);
    await screen.findByText("Kasir");
    expect(screen.getByTestId("category-tabs")).toBeInTheDocument();
    expect(screen.getByTestId("product-grid")).toBeInTheDocument();
  });

  test("renders all products from all categories", async () => {
    render(() => <POS />);
    await screen.findByText("Kasir");
    expect(screen.getByText("Kopi Susu")).toBeInTheDocument();
    expect(screen.getByText("Teh Manis")).toBeInTheDocument();
    expect(screen.getByText("Nasi Goreng")).toBeInTheDocument();
  });

  test("filters products by category", async () => {
    render(() => <POS />);
    await screen.findByText("Kasir");
    await user.click(screen.getByTestId("select-category"));
    const productNames = screen.getAllByTestId("product-name");
    expect(productNames).toHaveLength(2);
    expect(productNames[0]).toHaveTextContent("Kopi Susu");
    expect(productNames[1]).toHaveTextContent("Teh Manis");
  });

  test("clears category filter to show all products", async () => {
    render(() => <POS />);
    await screen.findByText("Kasir");
    await user.click(screen.getByTestId("select-category"));
    expect(screen.getAllByTestId("product-name")).toHaveLength(2);
    await user.click(screen.getByTestId("clear-category"));
    expect(screen.getAllByTestId("product-name")).toHaveLength(3);
  });

  test("filters products by search text", async () => {
    render(() => <POS />);
    await screen.findByText("Kasir");
    const searchInput = screen.getByTestId("search-input");
    await user.type(searchInput, "kopi");
    expect(screen.getAllByTestId("product-name")).toHaveLength(1);
    expect(screen.getByText("Kopi Susu")).toBeInTheDocument();
  });

  test("opens PaymentDialog when cart panel pay is clicked", async () => {
    render(() => <POS />);
    await screen.findByText("Kasir");
    await user.click(screen.getByTestId("cart-panel-pay"));
    expect(screen.getByTestId("payment-dialog")).toBeInTheDocument();
  });

  test("shows 'Selesai!' overlay after successful order", async () => {
    render(() => <POS />);
    await screen.findByText("Kasir");
    await user.click(screen.getByTestId("cart-panel-pay"));
    expect(screen.getByTestId("payment-dialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("payment-confirm"));
    expect(await screen.findByText("Selesai!")).toBeInTheDocument();
    expect(screen.getByText("2026-05-04-001")).toBeInTheDocument();
  });

  test("prints receipt after checkout when default printer is set", async () => {
    const { cartItems, cartTotal } = await import("~/store/cart");

    vi.mocked(cartItems).mockReturnValue([
      {
        product: {
          categoryId: "cat-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          id: "product-1",
          imageUrl: null,
          isActive: true,
          merchantId: "merchant-1",
          name: "Kopi Susu",
          price: 15_000,
          sortOrder: 0,
          updatedAt: "2026-01-01T00:00:00.000Z",
          deletedAt: null,
          isSynced: false,
        },
        quantity: 2,
      },
    ]);
    vi.mocked(cartTotal).mockReturnValue(30_000);
    mockGetDefaultPrinter.mockReturnValue("00:11:22:33:44:55");
    mockCurrentOutletId.mockReturnValue("outlet-1");
    mockGetOutletReceiptHeader.mockResolvedValue({
      address: "Jl. Merdeka No. 123",
      name: "Warung Satu",
    });

    render(() => <POS />);
    await screen.findByText("Kasir");
    await user.click(screen.getByTestId("cart-panel-pay"));
    await user.click(screen.getByTestId("payment-confirm"));
    await screen.findByText("Selesai!");

    expect(mockPrintReceipt).toHaveBeenCalledWith(
      "00:11:22:33:44:55",
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            name: "Kopi Susu",
            quantity: 2,
          }),
        ]),
        business: expect.objectContaining({
          address: "Jl. Merdeka No. 123",
          name: "Warung Satu",
          timezone: "Asia/Jakarta",
        }),
        order: expect.objectContaining({
          orderNumber: "2026-05-04-001",
          cashierName: "Kasir",
          createdAt: expect.stringMatching(UTC_TIMESTAMP_PATTERN),
        }),
        totals: expect.objectContaining({ total: 30_000 }),
      })
    );
  });

  test("shows Cetak Ulang button and retries printing when clicked", async () => {
    const { cartItems, cartTotal } = await import("~/store/cart");

    vi.mocked(cartItems).mockReturnValue([
      {
        product: {
          categoryId: "cat-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          id: "product-1",
          imageUrl: null,
          isActive: true,
          merchantId: "merchant-1",
          name: "Kopi Susu",
          price: 15_000,
          sortOrder: 0,
          updatedAt: "2026-01-01T00:00:00.000Z",
          deletedAt: null,
          isSynced: false,
        },
        quantity: 1,
      },
    ]);
    vi.mocked(cartTotal).mockReturnValue(15_000);
    mockGetDefaultPrinter.mockReturnValue("00:11:22:33:44:55");
    mockCurrentOutletId.mockReturnValue("outlet-1");
    mockGetOutletReceiptHeader.mockResolvedValue({
      address: "Jl. Merdeka No. 123",
      name: "Warung Satu",
    });

    render(() => <POS />);
    await screen.findByText("Kasir");
    await user.click(screen.getByTestId("cart-panel-pay"));
    await user.click(screen.getByTestId("payment-confirm"));
    await screen.findByText("Selesai!");

    expect(screen.getByText("Cetak Ulang")).toBeInTheDocument();

    mockPrintReceipt.mockClear();
    await user.click(screen.getByText("Cetak Ulang"));

    expect(mockPrintReceipt).toHaveBeenCalledWith(
      "00:11:22:33:44:55",
      expect.objectContaining({
        business: expect.objectContaining({
          address: "Jl. Merdeka No. 123",
          name: "Warung Satu",
        }),
        order: expect.objectContaining({
          orderNumber: "2026-05-04-001",
        }),
      })
    );
  });
});
