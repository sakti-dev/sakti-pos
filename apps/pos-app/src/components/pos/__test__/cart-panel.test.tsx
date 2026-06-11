import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Product } from "~/db/menu";
import { addToCart, clearCart } from "~/store/cart";

const TOTAL_20K_REGEX = /20\.000/;

vi.mock("~/store/responsive", () => ({
  useIsPhone: () => () => false,
}));

vi.mock("~/components/ui/drawer", () => ({
  Drawer: (props: { open: boolean; children: unknown }) =>
    props.open ? (
      <div data-testid="drawer">{props.children as JSX.Element}</div>
    ) : null,
  DrawerContent: (props: { children: unknown }) => (
    <div>{props.children as JSX.Element}</div>
  ),
  DrawerOverlay: () => <div data-testid="drawer-overlay" />,
  DrawerPortal: (props: { children: unknown }) => (
    <>{props.children as JSX.Element}</>
  ),
  DrawerTitle: (props: { children: unknown }) => (
    <h2>{props.children as string}</h2>
  ),
}));

vi.mock("~/components/confirm-drawer", () => ({
  ConfirmDrawer: (props: {
    open: boolean;
    message: string;
    title: string;
    confirmLabel: string;
  }) => (
    <Show when={props.open}>
      <div data-testid="confirm-drawer">
        <h3>{props.title}</h3>
        <p>{props.message}</p>
        <button type="button">{props.confirmLabel}</button>
      </div>
    </Show>
  ),
}));

import { CartPanel } from "~/components/pos/cart-panel";

const user = userEvent.setup();

const PRODUCT_A: Product = {
  id: "product-1",
  name: "Nasi Goreng",
  priceMinorUnits: 15_000,
  categoryId: "category-1",
  merchantId: "merchant-1",
  isActive: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  sortOrder: 0,
  deletedAt: null,
  isSynced: false,
};
const PRODUCT_B: Product = {
  id: "product-2",
  name: "Es Teh",
  priceMinorUnits: 5000,
  categoryId: "category-1",
  merchantId: "merchant-1",
  isActive: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  sortOrder: 1,
  deletedAt: null,
  isSynced: false,
};

describe("CartDrawer (portrait mode)", () => {
  beforeEach(() => {
    clearCart();
  });

  afterEach(() => {
    clearCart();
  });

  test("shows empty cart message", () => {
    render(() => <CartPanel onPay={() => {}} />);
    expect(screen.getByText("Keranjang kosong")).toBeInTheDocument();
  });

  test("shows item count and total when cart has items", () => {
    addToCart(PRODUCT_A);
    addToCart(PRODUCT_B);

    render(() => <CartPanel onPay={() => {}} />);
    expect(screen.getByText("2 item")).toBeInTheDocument();
    expect(screen.getByText(TOTAL_20K_REGEX)).toBeInTheDocument();
  });

  test("calls onPay when Bayar is clicked", async () => {
    const onPay = vi.fn();
    addToCart(PRODUCT_A);

    render(() => <CartPanel onPay={onPay} />);
    await user.click(screen.getByText("Bayar"));
    expect(onPay).toHaveBeenCalledOnce();
  });

  test("shows confirm drawer when Kosongkan is clicked", async () => {
    addToCart(PRODUCT_A);

    render(() => <CartPanel onPay={() => {}} />);
    const btn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.textContent === "Kosongkan" && b.className.includes("border-input")
      );
    expect(btn).toBeTruthy();
    if (!btn) {
      throw new Error("Expected Kosongkan button to exist");
    }
    await user.click(btn);
    expect(screen.getByTestId("confirm-drawer")).toBeInTheDocument();
  });
});

describe("CartSidebar (landscape mode)", () => {
  let CartSidebar: typeof import("~/components/pos/cart-panel").CartSidebar;

  beforeEach(async () => {
    clearCart();
    const mod = await import("~/components/pos/cart-panel");
    CartSidebar = mod.CartSidebar;
  });

  afterEach(() => {
    clearCart();
  });

  test("shows empty cart message", () => {
    render(() => <CartSidebar onPay={() => {}} />);
    expect(screen.getByText("Keranjang Kosong")).toBeInTheDocument();
  });

  test("shows cart items and total", () => {
    addToCart(PRODUCT_A);
    addToCart(PRODUCT_B);

    render(() => <CartSidebar onPay={() => {}} />);
    expect(screen.getByText("Nasi Goreng")).toBeInTheDocument();
    expect(screen.getByText("Es Teh")).toBeInTheDocument();
    expect(screen.getByText("2 item")).toBeInTheDocument();
  });

  test("increment and decrement buttons work", async () => {
    addToCart(PRODUCT_A);

    render(() => <CartSidebar onPay={() => {}} />);
    const buttons = screen.getAllByRole("button");

    const plusBtn = buttons.find(
      (b) =>
        b.textContent === "+" &&
        !["Kosongkan", "Bayar"].includes(b.textContent || "")
    );
    const minusBtn = buttons.find(
      (b) =>
        b.textContent === "−" &&
        !["Kosongkan", "Bayar"].includes(b.textContent || "")
    );

    if (plusBtn) {
      await user.click(plusBtn);
      expect(screen.getByText("2")).toBeInTheDocument();
    }

    if (minusBtn) {
      await user.click(minusBtn);
      expect(screen.getByText("1")).toBeInTheDocument();
    }
  });

  test("removes item when decrementing from quantity 1", async () => {
    addToCart(PRODUCT_A);

    render(() => <CartSidebar onPay={() => {}} />);
    const minusBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "−");

    if (minusBtn) {
      await user.click(minusBtn);
      expect(screen.queryByText("Nasi Goreng")).not.toBeInTheDocument();
    }
  });

  test("calls onPay when Bayar is clicked", async () => {
    const onPay = vi.fn();
    addToCart(PRODUCT_A);

    render(() => <CartSidebar onPay={onPay} />);
    await user.click(screen.getByText("Bayar"));
    expect(onPay).toHaveBeenCalledOnce();
  });
});
