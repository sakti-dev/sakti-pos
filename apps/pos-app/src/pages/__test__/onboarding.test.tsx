import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCreateMerchant = vi.fn();
const mockCreateOutlet = vi.fn();
const mockSetOutletContext = vi.fn();
const mockCreateStaffApi = vi.fn();
const mockGetSession = vi.fn(() =>
  Promise.resolve({
    user: { id: "user-1", name: "Test User", email: "test@test.com" },
  })
);
const mockGetCurrentCloudStaff = vi.fn((_merchantId: string) =>
  Promise.resolve({
    claimed: true,
    staff: {
      hasPin: true,
      id: "staff-1",
      isActive: true,
      merchantId: "merchant-1",
      name: "Test User",
      outletId: "outlet-1",
      role: "owner" as const,
    },
  })
);
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
const mockGetOwnerStaff = vi.fn();
const mockLogin = vi.fn((_staffId: string, _pin: string) =>
  Promise.resolve({ id: "staff-1", name: "Test Biz", role: "owner" })
);

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
  useSearchParams: () => [{ get: () => null }, () => {}],
}));

vi.mock("~/lib/auth/cloud", () => ({
  ApiError: class extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  },
  createMerchant: (name: string) => mockCreateMerchant(name),
  createOutlet: (merchantId: string, name: string, address?: string) =>
    mockCreateOutlet(merchantId, name, address),
  createStaff: (data: unknown) => mockCreateStaffApi(data),
  getCurrentCloudStaff: (merchantId: string) =>
    mockGetCurrentCloudStaff(merchantId),
  getSession: () => mockGetSession(),
}));

vi.mock("~/store/outlet", () => ({
  setOutletContext: (
    outletId: string,
    merchantId: string,
    registerId?: string
  ) => mockSetOutletContext(outletId, merchantId, registerId),
  currentMerchantId: () => "merchant-1",
}));

vi.mock("~/store/sync", () => ({
  syncNow: () => mockSyncNow(),
}));

vi.mock("~/db/staff", () => ({
  getOwnerStaff: () => mockGetOwnerStaff(),
}));

vi.mock("~/store/auth", () => ({
  login: (staffId: string, pin: string) => mockLogin(staffId, pin),
}));

import Onboarding from "../onboarding";

const user = userEvent.setup();

describe("Onboarding", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows merchant creation step first", () => {
    render(() => <Onboarding />);
    expect(screen.getByText("Buat bisnis Anda")).toBeInTheDocument();
  });

  test("advances to PIN setup after creating outlet", async () => {
    mockCreateMerchant.mockResolvedValue({
      id: "merchant-1",
      name: "Test Biz",
      createdAt: "",
      updatedAt: "",
    });
    mockCreateOutlet.mockResolvedValue({
      id: "outlet-1",
      merchantId: "merchant-1",
      register: { id: "register-1" },
    });
    mockGetOwnerStaff.mockResolvedValue(undefined);
    render(() => <Onboarding />);
    await user.type(
      screen.getByPlaceholderText("Contoh: PT Sakti Jaya"),
      "Test Biz"
    );
    await user.click(screen.getByText("Lanjutkan"));
    expect(await screen.findByText("Buat outlet pertama")).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText("Contoh: Cabang Sudirman"),
      "Cabang Utama"
    );
    await user.click(screen.getByText("Buat Outlet"));
    expect(await screen.findByText("Buat PIN")).toBeInTheDocument();
  });

  test("creates staff and navigates to /pos after PIN setup", async () => {
    mockCreateMerchant.mockResolvedValue({
      id: "merchant-1",
      name: "Test Biz",
      createdAt: "",
      updatedAt: "",
    });
    mockCreateOutlet.mockResolvedValue({
      id: "outlet-1",
      merchantId: "merchant-1",
      register: { id: "register-1" },
    });
    mockGetOwnerStaff.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      id: "staff-1",
      name: "Test Biz",
      role: "owner",
    });
    mockCreateStaffApi.mockResolvedValue({ id: "staff-1" });
    mockLogin.mockResolvedValue({
      id: "staff-1",
      name: "Test Biz",
      role: "owner",
    });
    render(() => <Onboarding />);
    await user.type(
      screen.getByPlaceholderText("Contoh: PT Sakti Jaya"),
      "Test Biz"
    );
    await user.click(screen.getByText("Lanjutkan"));
    await screen.findByText("Buat outlet pertama");
    await user.type(
      screen.getByPlaceholderText("Contoh: Cabang Sudirman"),
      "Cabang Utama"
    );
    await user.click(screen.getByText("Buat Outlet"));
    expect(await screen.findByText("Buat PIN")).toBeInTheDocument();

    for (const digit of "123456") {
      await user.click(screen.getByText(digit));
    }
    await user.click(screen.getByText("OK"));

    await screen.findByText("Konfirmasi PIN");
    for (const digit of "123456") {
      await user.click(screen.getByText(digit));
    }
    await user.click(screen.getByText("OK"));

    await vi.waitFor(() => {
      expect(mockCreateStaffApi).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: "merchant-1",
          name: "Test User",
          role: "owner",
          pin: "123456",
        })
      );
    });
    await vi.waitFor(() => {
      expect(mockGetCurrentCloudStaff).toHaveBeenCalledWith("merchant-1");
    });
    expect(mockGetCurrentCloudStaff.mock.invocationCallOrder[0]).toBeLessThan(
      mockSyncNow.mock.invocationCallOrder[0]
    );
    await vi.waitFor(() => {
      expect(mockSyncNow).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/pos", { replace: true });
    });
  });
});
