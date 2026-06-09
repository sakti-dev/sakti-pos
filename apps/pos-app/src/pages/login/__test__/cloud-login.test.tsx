import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCloudLogin = vi.fn();
const mockGetMerchants = vi.fn();
const mockGetOutlets = vi.fn();
const mockGetCurrentCloudStaff = vi.fn();
const mockSetOutletContext = vi.fn();
const mockSetScope = vi.fn();
const mockSyncNow = vi.fn(() =>
  Promise.resolve({
    pull: { rows_received: 1, server_time: "2026-01-01T00:00:00Z" },
    push: {
      server_time: "2026-01-01T00:00:00Z",
      server_wins_count: 0,
      tables_synced: [],
    },
    purged: 0,
  })
);
const mockGetActiveStaff = vi.fn();
const mockLoginWithCloudStaff = vi.fn();

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

vi.mock("~/lib/auth/cloud", () => ({
  ApiError: class extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  },
  login: (...a: unknown[]) => mockCloudLogin(...a),
  register: vi.fn(),
  getGoogleOAuthUrl: () => "http://localhost:3001/api/auth/google",
  getMerchants: () => mockGetMerchants(),
  getOutlets: (...a: unknown[]) => mockGetOutlets(...a),
  getCurrentCloudStaff: (...a: unknown[]) => mockGetCurrentCloudStaff(...a),
  Merchant: undefined,
  Outlet: undefined,
}));

vi.mock("~/store/outlet", () => ({
  setOutletContext: (...a: unknown[]) => mockSetOutletContext(...a),
  currentOutletId: () => null,
}));

vi.mock("~/store/sync", () => ({
  syncNow: (...a: unknown[]) => mockSyncNow(...a),
}));

vi.mock("~/store/auth", () => ({
  getActiveStaff: () => mockGetActiveStaff(),
  loginWithCloudStaff: (...a: unknown[]) => mockLoginWithCloudStaff(...a),
  setScope: (...a: unknown[]) => mockSetScope(...a),
}));

import CloudLogin from "../cloud-login";

const user = userEvent.setup();

describe("CloudLogin - onboarding guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("navigates to onboarding when user has zero merchants", async () => {
    mockGetMerchants.mockResolvedValueOnce([]);
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "new@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/onboarding", {
        replace: true,
      });
    });
  });

  test("does NOT navigate to onboarding when user has merchants", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "Existing Biz", role: "owner" },
    ]);
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "existing@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await vi.waitFor(() => {
      expect(screen.getByText("Existing Biz")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith("/onboarding", {
      replace: true,
    });
  });

  test("navigates to cloud register page from the register link", async () => {
    render(() => <CloudLogin />);
    await user.click(screen.getByText("Belum punya akun? Daftar"));
    expect(mockNavigate).toHaveBeenCalledWith("/cloud-register");
  });

  test("passes merchantId to onboarding when merchant has no outlets", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "Existing Biz", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([]);
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "existing@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("Existing Biz");
    await user.click(screen.getByText("Existing Biz"));
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/onboarding?merchantId=m1", {
        replace: true,
      });
    });
  });

  test("returning user with merchant AND outlets goes to outlet picker", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      {
        id: "o1",
        merchantId: "m1",
        name: "Main Outlet",
        address: null,
        isActive: true,
        timezone: "Asia/Jakarta",
      },
    ]);
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "user@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    expect(await screen.findByText("Main Outlet")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith("/onboarding", {
      replace: true,
    });
  });

  test("owner selects outlet and enters dashboard without PIN after cloud login", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      {
        id: "o1",
        merchantId: "m1",
        name: "Main Outlet",
        address: "Jl. Test 1",
        isActive: true,
        timezone: "Asia/Jakarta",
      },
    ]);
    mockGetCurrentCloudStaff.mockResolvedValueOnce({
      claimed: false,
      staff: {
        hasPin: true,
        id: "s1",
        isActive: true,
        merchantId: "m1",
        name: "Owner",
        outletId: "o1",
        role: "owner",
      },
    });
    mockLoginWithCloudStaff.mockResolvedValueOnce({
      id: "s1",
      name: "Owner",
      role: "owner",
    });
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "user@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    await screen.findByText("Main Outlet");
    await user.click(screen.getByText("Main Outlet"));
    await vi.waitFor(() => {
      expect(mockSetOutletContext).toHaveBeenCalledWith(
        "o1",
        "m1",
        undefined,
        "Asia/Jakarta"
      );
    });
    await vi.waitFor(() => {
      expect(mockLoginWithCloudStaff).toHaveBeenCalledWith("s1");
    });
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", {
        replace: true,
      });
    });
  });

  test("cashier cloud-linked staff enters POS after outlet selection", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      {
        id: "o1",
        merchantId: "m1",
        name: "Main Outlet",
        address: "Jl. Test 1",
        isActive: true,
        timezone: "Asia/Jakarta",
      },
    ]);
    mockGetCurrentCloudStaff.mockResolvedValueOnce({
      claimed: false,
      staff: {
        hasPin: true,
        id: "s2",
        isActive: true,
        merchantId: "m1",
        name: "Cashier",
        outletId: "o1",
        role: "cashier",
      },
    });
    mockLoginWithCloudStaff.mockResolvedValueOnce({
      id: "s2",
      name: "Cashier",
      role: "cashier",
    });
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "user@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    await screen.findByText("Main Outlet");
    await user.click(screen.getByText("Main Outlet"));
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/pos", {
        replace: true,
      });
    });
  });

  test("shows cloud staff error when current staff lookup fails", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      {
        id: "o1",
        merchantId: "m1",
        name: "Main Outlet",
        address: "Jl. Test 1",
        isActive: true,
        timezone: "Asia/Jakarta",
      },
    ]);
    mockGetCurrentCloudStaff.mockRejectedValueOnce(new Error("Not Found"));
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "user@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    await screen.findByText("Main Outlet");
    await user.click(screen.getByText("Main Outlet"));
    expect(
      await screen.findByText("Gagal memeriksa staff cloud: Error: Not Found")
    ).toBeInTheDocument();
  });

  test("shows native sync error when sync fails after staff lookup", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      {
        id: "o1",
        merchantId: "m1",
        name: "Main Outlet",
        address: "Jl. Test 1",
        isActive: true,
        timezone: "Asia/Jakarta",
      },
    ]);
    mockGetCurrentCloudStaff.mockResolvedValueOnce({
      claimed: false,
      staff: {
        hasPin: true,
        id: "s1",
        isActive: true,
        merchantId: "m1",
        name: "Owner",
        outletId: "o1",
        role: "owner",
      },
    });
    mockSyncNow.mockRejectedValueOnce(new Error("pull 500"));
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "user@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    await screen.findByText("Main Outlet");
    await user.click(screen.getByText("Main Outlet"));
    expect(
      await screen.findByText("Gagal menyinkronkan data: Error: pull 500")
    ).toBeInTheDocument();
  });

  test("returning user with no staff goes to setup PIN after outlet select", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      {
        id: "o1",
        merchantId: "m1",
        name: "Main Outlet",
        address: "Jl. Test 1",
        isActive: true,
        timezone: "Asia/Jakarta",
      },
    ]);
    mockGetCurrentCloudStaff.mockResolvedValueOnce({
      claimed: false,
      reason: "no-staff",
      staff: null,
    });
    mockGetActiveStaff.mockResolvedValue([]);
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "user@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    await screen.findByText("Main Outlet");
    await user.click(screen.getByText("Main Outlet"));
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/onboarding?merchantId=m1&outletId=o1",
        {
          replace: true,
        }
      );
    });
  });

  test("ambiguous owner mapping falls back to PIN login", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      {
        id: "o1",
        merchantId: "m1",
        name: "Main Outlet",
        address: "Jl. Test 1",
        isActive: true,
      },
    ]);
    mockGetCurrentCloudStaff.mockResolvedValueOnce({
      claimed: false,
      reason: "ambiguous-owner",
      staff: null,
    });
    mockGetActiveStaff.mockResolvedValue([
      { id: "s1", name: "Owner", role: "owner" },
    ]);
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "user@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    await screen.findByText("Main Outlet");
    await user.click(screen.getByText("Main Outlet"));
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login", {
        replace: true,
      });
    });
  });
});

describe("CloudLogin - sync initialization order (regression)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const selectOutlet = async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      {
        id: "o1",
        merchantId: "m1",
        name: "Main Outlet",
        address: "Jl. Test 1",
        isActive: true,
        timezone: "Asia/Jakarta",
      },
    ]);
    mockGetCurrentCloudStaff.mockResolvedValueOnce({
      claimed: false,
      staff: {
        hasPin: true,
        id: "s1",
        isActive: true,
        merchantId: "m1",
        name: "Owner",
        outletId: "o1",
        role: "owner",
      },
    });
    mockLoginWithCloudStaff.mockResolvedValueOnce({
      id: "s1",
      name: "Owner",
      role: "owner",
    });
    render(() => <CloudLogin />);
    await user.type(
      screen.getByPlaceholderText("email@contoh.com"),
      "user@test.com"
    );
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    await screen.findByText("Main Outlet");
    await user.click(screen.getByText("Main Outlet"));
  };

  test("setScope is called before syncNow during outlet selection", async () => {
    await selectOutlet();
    await vi.waitFor(() => {
      expect(mockSetScope).toHaveBeenCalledWith("m1");
      expect(mockSyncNow).toHaveBeenCalled();
    });
    const scopeOrder = mockSetScope.mock.invocationCallOrder[0];
    const syncOrder = mockSyncNow.mock.invocationCallOrder[0];
    expect(scopeOrder).toBeLessThan(syncOrder);
  });

  test("sync failure shows error and does not navigate", async () => {
    mockSyncNow.mockRejectedValueOnce(new Error("Sync client not initialized"));
    await selectOutlet();
    expect(
      await screen.findByText(
        "Gagal menyinkronkan data: Error: Sync client not initialized"
      )
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith("/", { replace: true });
    expect(mockNavigate).not.toHaveBeenCalledWith("/pos", { replace: true });
  });
});
