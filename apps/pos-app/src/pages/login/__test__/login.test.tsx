import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockLogin = vi.fn();
const mockGetActiveStaff = vi.fn(() =>
  Promise.resolve([
    { id: "staff-1", name: "Manager", role: "manager" },
    { id: "staff-2", name: "Kasir", role: "cashier" },
  ])
);
const mockGetLastUserId = vi.fn<() => string | null>(() => null);
const mockIsCloudAuthenticated = vi.fn(() => Promise.resolve(false));
const mockNavigate = vi.fn();

vi.mock("~/store/auth", () => ({
  getActiveStaff: () => mockGetActiveStaff(),
  getLastUserId: () => mockGetLastUserId(),
  login: () => mockLogin(),
}));

vi.mock("~/lib/auth/cloud", () => ({
  isCloudAuthenticated: () => mockIsCloudAuthenticated(),
}));

const mockCurrentMerchantId = vi.fn<() => string | null>(() => null);
const mockCurrentOutletId = vi.fn<() => string | null>(() => null);

vi.mock("~/store/outlet", () => ({
  currentMerchantId: () => mockCurrentMerchantId(),
  currentOutletId: () => mockCurrentOutletId(),
}));

vi.mock("~/store/responsive", () => ({
  useIsLandscape: () => () => false,
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

import LocalAuth from "../local-auth";

const user = userEvent.setup();

describe("Login", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchantId.mockReturnValue(null);
    mockCurrentOutletId.mockReturnValue(null);
    mockIsCloudAuthenticated.mockResolvedValue(false);
  });

  test("renders staff list after loading", async () => {
    mockGetLastUserId.mockReturnValue(null);
    render(() => <LocalAuth />);
    expect(await screen.findByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Kasir")).toBeInTheDocument();
  });

  test("shows PinPad after selecting a staff member", async () => {
    mockGetLastUserId.mockReturnValue(null);
    render(() => <LocalAuth />);
    await screen.findByText("Manager");
    await user.click(screen.getByText("Manager"));
    expect(screen.getByText("Masukkan PIN")).toBeInTheDocument();
  });

  test("shows error when login fails", async () => {
    mockGetLastUserId.mockReturnValue("staff-1");
    mockLogin.mockRejectedValueOnce(new Error("Invalid PIN"));
    render(() => <LocalAuth />);
    await screen.findByText("Masukkan PIN");
    for (const digit of "123456") {
      await user.click(screen.getByText(digit));
    }
    await user.click(screen.getByText("OK"));
    expect(await screen.findByText("PIN salah")).toBeInTheDocument();
  });

  test("redirects to /cloud-login when no active staff exist", async () => {
    mockGetActiveStaff.mockResolvedValueOnce([]);
    mockGetLastUserId.mockReturnValue(null);
    render(() => <LocalAuth />);
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/cloud-login", {
        replace: true,
      });
    });
  });

  test("redirects to cloud login when paired outlet has no active staff and no cloud session", async () => {
    mockCurrentMerchantId.mockReturnValue("m1");
    mockCurrentOutletId.mockReturnValue("o1");
    mockGetActiveStaff.mockResolvedValueOnce([]);
    mockGetLastUserId.mockReturnValue(null);
    mockIsCloudAuthenticated.mockResolvedValueOnce(false);
    render(() => <LocalAuth />);
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/cloud-login", {
        replace: true,
      });
    });
  });

  test("redirects to setup PIN when paired outlet has no active staff and cloud session exists", async () => {
    mockCurrentMerchantId.mockReturnValue("m1");
    mockCurrentOutletId.mockReturnValue("o1");
    mockGetActiveStaff.mockResolvedValueOnce([]);
    mockGetLastUserId.mockReturnValue(null);
    mockIsCloudAuthenticated.mockResolvedValueOnce(true);
    render(() => <LocalAuth />);
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/onboarding?merchantId=m1&outletId=o1",
        {
          replace: true,
        }
      );
    });
  });

  test("does not show error initially", async () => {
    mockGetLastUserId.mockReturnValue("staff-1");
    render(() => <LocalAuth />);
    await screen.findByText("Masukkan PIN");
    expect(screen.queryByText("PIN salah")).not.toBeInTheDocument();
  });

  test("auto-selects single staff member and shows PIN pad", async () => {
    mockGetActiveStaff.mockResolvedValueOnce([
      { id: "staff-1", name: "Owner", role: "owner" },
    ]);
    mockGetLastUserId.mockReturnValue(null);
    render(() => <LocalAuth />);
    expect(await screen.findByText("Masukkan PIN")).toBeInTheDocument();
  });

  test("does not show cloud login link", async () => {
    mockGetLastUserId.mockReturnValue(null);
    render(() => <LocalAuth />);
    await screen.findByText("Manager");
    expect(
      screen.queryByText("Masuk dengan akun cloud")
    ).not.toBeInTheDocument();
  });
});
