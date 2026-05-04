import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockLogin = vi.fn();
const mockGetActiveUsers = vi.fn(() =>
  Promise.resolve([
    { id: 1, name: "Owner", role: "owner" },
    { id: 2, name: "Kasir", role: "cashier" },
  ])
);
const mockGetLastUserId = vi.fn<() => number | null>(() => 1);
const mockNavigate = vi.fn();

vi.mock("~/lib/auth", () => ({
  getActiveUsers: () => mockGetActiveUsers(),
  getLastUserId: () => mockGetLastUserId(),
  login: () => mockLogin(),
}));

vi.mock("~/lib/responsive", () => ({
  useIsLandscape: () => () => false,
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

import Login from "../login";

const user = userEvent.setup();

describe("Login", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders user list after loading", async () => {
    mockGetLastUserId.mockReturnValue(null);
    render(() => <Login />);
    expect(await screen.findByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Kasir")).toBeInTheDocument();
  });

  test("shows PinPad after selecting a user", async () => {
    mockGetLastUserId.mockReturnValue(null);
    render(() => <Login />);
    await screen.findByText("Owner");
    await user.click(screen.getByText("Owner"));
    expect(screen.getByText("Masukkan PIN")).toBeInTheDocument();
  });

  test("shows error when login fails", async () => {
    mockGetLastUserId.mockReturnValue(1);
    mockLogin.mockRejectedValueOnce(new Error("Invalid PIN"));
    render(() => <Login />);
    await screen.findByText("Masukkan PIN");
    for (const digit of "123456") {
      await user.click(screen.getByText(digit));
    }
    await user.click(screen.getByText("OK"));
    expect(await screen.findByText("PIN salah")).toBeInTheDocument();
  });

  test("does not show error initially", async () => {
    mockGetLastUserId.mockReturnValue(1);
    render(() => <Login />);
    await screen.findByText("Masukkan PIN");
    expect(screen.queryByText("PIN salah")).not.toBeInTheDocument();
  });
});
