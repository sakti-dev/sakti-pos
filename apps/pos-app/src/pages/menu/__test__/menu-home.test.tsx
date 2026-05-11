import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();

vi.mock("@solidjs/router", () => ({
  A: (props: { children: JSX.Element; href: string }) => (
    <a data-testid="link" href={props.href}>
      {props.children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

vi.mock("~/components/layout", () => ({
  AppShell: (props: { children: JSX.Element; title: string }) => (
    <div>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  ),
}));

vi.mock("~/components/ui/page-header", () => ({
  PageHeader: (props: { children: JSX.Element; backHref?: string }) => (
    <div>
      <a href={props.backHref}>Back</a>
      <h1>{props.children}</h1>
    </div>
  ),
}));

vi.mock("~/db/menu", () => ({
  getCategories: vi.fn(() => Promise.resolve([])),
  getProducts: vi.fn(() => Promise.resolve([])),
  deleteCategory: vi.fn(),
  deleteProduct: vi.fn(),
  updateCategory: vi.fn(),
  updateProduct: vi.fn(),
  getProductCountByCategory: vi.fn(() => Promise.resolve(0)),
}));

vi.mock("~/components/confirm-drawer", () => ({
  ConfirmDrawer: () => <div />,
}));

vi.mock("~/components/ui/button", () => ({
  Button: (props: { children: JSX.Element; onClick?: () => void }) => (
    <button onClick={props.onClick} type="button">
      {props.children}
    </button>
  ),
}));

vi.mock("~/components/ui/select", () => ({
  Select: () => <div />,
}));

vi.mock("~/components/ui/skeleton", () => ({
  Skeleton: () => <div />,
}));

vi.mock("~/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  formatIDR: (n: number) => `Rp ${n}`,
}));

vi.mock("solid-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ProductsCategoriesSettings from "../../settings/products-categories";
import MenuHome from "../menu-home";

const user = userEvent.setup();

describe("MenuHome", () => {
  test("redirects to settings products-categories", () => {
    render(() => <MenuHome />);
    expect(mockNavigate).toHaveBeenCalledWith("/settings/products-categories", {
      replace: true,
    });
  });
});

describe("Products & Categories tabbed screen", () => {
  test("shows Kategori and Produk tabs", () => {
    render(() => <ProductsCategoriesSettings />);
    expect(screen.getByText("Kategori")).toBeInTheDocument();
    expect(screen.getByText("Produk")).toBeInTheDocument();
  });

  test("shows Kategori tab content by default", () => {
    render(() => <ProductsCategoriesSettings />);
    expect(screen.getByText("Kategori")).toBeInTheDocument();
  });

  test("switches to Produk content when Produk tab is clicked", async () => {
    render(() => <ProductsCategoriesSettings />);
    await user.click(screen.getByText("Produk"));
    expect(screen.getByText("Produk")).toBeInTheDocument();
  });
});
