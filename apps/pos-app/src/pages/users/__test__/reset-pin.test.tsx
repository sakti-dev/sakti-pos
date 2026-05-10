import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockChangePin = vi.fn();

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: "1" }),
}));

vi.mock("~/lib/auth/provider", () => ({
  changePin: (...args: unknown[]) => mockChangePin(...args),
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

vi.mock("~/components/ui/page-header", () => ({
  PageHeader: (props: { backHref?: string; children: JSX.Element }) => (
    <div data-testid="page-header">
      <span data-testid="back-href">{props.backHref ?? ""}</span>
      <h1>{props.children}</h1>
    </div>
  ),
}));

vi.mock("solid-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ResetPin from "../reset-pin";

const user = userEvent.setup();

describe("ResetPin", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders 'Ubah PIN' title", () => {
    render(() => <ResetPin />);
    expect(screen.getByText("Ubah PIN")).toBeInTheDocument();
  });

  test("shows PIN input fields", () => {
    render(() => <ResetPin />);
    expect(screen.getByPlaceholderText("Minimal 6 digit")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ulangi PIN baru")).toBeInTheDocument();
  });

  test("submit button is disabled when PIN is too short", () => {
    render(() => <ResetPin />);
    expect(screen.getByTestId("save-btn")).toBeDisabled();
  });

  test("submit button is disabled when PINs do not match", async () => {
    render(() => <ResetPin />);
    const pinInput = screen.getByPlaceholderText("Minimal 6 digit");
    const confirmInput = screen.getByPlaceholderText("Ulangi PIN baru");
    await user.type(pinInput, "123456");
    await user.type(confirmInput, "654321");
    expect(screen.getByTestId("save-btn")).toBeDisabled();
  });

  test("submit button is enabled when PINs match and are valid", async () => {
    render(() => <ResetPin />);
    const pinInput = screen.getByPlaceholderText("Minimal 6 digit");
    const confirmInput = screen.getByPlaceholderText("Ulangi PIN baru");
    await user.type(pinInput, "123456");
    await user.type(confirmInput, "123456");
    expect(screen.getByTestId("save-btn")).not.toBeDisabled();
  });

  test("save button remains disabled when PIN is too short", async () => {
    render(() => <ResetPin />);
    const pinInput = screen.getByPlaceholderText("Minimal 6 digit");
    await user.type(pinInput, "123");
    expect(screen.getByTestId("save-btn")).toBeDisabled();
  });

  test("shows an error when saving fails", async () => {
    mockChangePin.mockRejectedValueOnce(new Error("Gagal menyimpan PIN"));
    render(() => <ResetPin />);
    const pinInput = screen.getByPlaceholderText("Minimal 6 digit");
    const confirmInput = screen.getByPlaceholderText("Ulangi PIN baru");
    await user.type(pinInput, "123456");
    await user.type(confirmInput, "123456");
    await user.click(screen.getByTestId("save-btn"));
    expect(await screen.findByText("Gagal menyimpan PIN")).toBeInTheDocument();
  });
});
