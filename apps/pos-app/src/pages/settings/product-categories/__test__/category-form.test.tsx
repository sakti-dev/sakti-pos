import { useParams } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCreateCategory = vi.fn();
const mockUpdateCategory = vi.fn();
const mockSyncNow = vi.fn();

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: vi.fn(() => ({})),
}));

vi.mock("~/db/menu", () => ({
  getCategory: vi.fn(() =>
    Promise.resolve({
      id: 1,
      name: "Minuman",
      sortOrder: 0,
      isActive: true,
      createdAt: "",
      updatedAt: "",
    })
  ),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
}));

vi.mock("~/store/sync", () => ({
  syncNow: (...args: unknown[]) => mockSyncNow(...args),
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
      data-testid="save-btn"
      disabled={props.disabled}
      onClick={props.onClick}
      type={props.type ?? "button"}
    >
      {props.children}
    </button>
  ),
}));

import CategoryForm from "../category-form";

const user = userEvent.setup();

describe("CategoryForm (create mode)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows 'Tambah Kategori' title", () => {
    render(() => <CategoryForm />);
    expect(screen.getByText("Tambah Kategori")).toBeInTheDocument();
  });

  test("submit is disabled when name is empty", () => {
    render(() => <CategoryForm />);
    expect(screen.getByTestId("save-btn")).toBeDisabled();
  });

  test("submit syncs after creating a category", async () => {
    mockCreateCategory.mockResolvedValue({
      id: "category-1",
      merchantId: "",
      name: "Minuman",
    });
    mockSyncNow.mockResolvedValue({
      mode: "skipped",
      pull: { rows_received: 0, server_time: "" },
      purged: 0,
      push: { server_time: "", server_wins_count: 0, tables_synced: [] },
    });

    render(() => <CategoryForm />);
    await user.type(screen.getByPlaceholderText("Contoh: Minuman"), "Minuman");
    await user.click(screen.getByTestId("save-btn"));

    expect(mockCreateCategory).toHaveBeenCalledWith({
      merchantId: "",
      name: "Minuman",
    });
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  test("submit is enabled when name is filled", async () => {
    render(() => <CategoryForm />);
    await user.type(screen.getByPlaceholderText("Contoh: Minuman"), "Minuman");
    expect(screen.getByTestId("save-btn")).not.toBeDisabled();
  });
  test("shows an error when saving fails", async () => {
    mockCreateCategory.mockRejectedValueOnce(
      new Error("Gagal menyimpan kategori")
    );
    render(() => <CategoryForm />);
    await user.type(screen.getByPlaceholderText("Contoh: Minuman"), "Minuman");
    await user.click(screen.getByTestId("save-btn"));
    expect(
      await screen.findByText("Gagal menyimpan kategori")
    ).toBeInTheDocument();
  });

  test("shows required asterisk on name field", () => {
    render(() => <CategoryForm />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});

describe("CategoryForm (edit mode)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows 'Edit Kategori' title", async () => {
    vi.mocked(useParams).mockReturnValue({ id: "1" });
    render(() => <CategoryForm />);
    await screen.findByText("Edit Kategori");
    expect(screen.getByText("Edit Kategori")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Minuman")).toBeInTheDocument();
  });
});
