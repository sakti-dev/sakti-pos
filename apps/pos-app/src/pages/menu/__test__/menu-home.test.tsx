import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { describe, expect, test, vi } from "vitest";

vi.mock("@solidjs/router", () => ({
  A: (props: { children: JSX.Element; href: string }) => (
    <a data-testid="link" href={props.href}>
      {props.children}
    </a>
  ),
}));

vi.mock("~/components/layout", () => ({
  AppShell: (props: { children: JSX.Element; title: string }) => (
    <div>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  ),
}));

import MenuHome from "../menu-home";

describe("MenuHome", () => {
  test("renders navigation links for Kategori and Produk", async () => {
    render(() => <MenuHome />);
    expect(await screen.findByText("Kelola Menu")).toBeInTheDocument();
    expect(screen.getByText("Kategori")).toBeInTheDocument();
    expect(screen.getByText("Produk")).toBeInTheDocument();
    expect(screen.getByText("Kelola kategori menu")).toBeInTheDocument();
    expect(screen.getByText("Kelola produk menu")).toBeInTheDocument();
  });

  test("links point to correct routes", () => {
    render(() => <MenuHome />);
    const links = screen.getAllByTestId("link");
    expect(links[0]).toHaveAttribute("href", "/menu/categories");
    expect(links[1]).toHaveAttribute("href", "/menu/products");
  });
});
