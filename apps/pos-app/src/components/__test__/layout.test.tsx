import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

const mockCurrentUserRole = vi.fn(() => "owner");
const mockCurrentOutletId = vi.fn(() => "outlet-1");

vi.mock("@solidjs/router", () => ({
  useLocation: () => ({ pathname: "/settings" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("solid-icons/tb", () => ({
  TbOutlineChartBar: () => <span data-testid="icon-chart" />,
  TbOutlineDeviceDesktop: () => <span data-testid="icon-desktop" />,
  TbOutlineClipboard: () => <span data-testid="icon-clipboard" />,
  TbOutlineSettings: () => <span data-testid="icon-settings" />,
  TbOutlineMenu2: () => <span data-testid="icon-menu" />,
  TbOutlinePencil: () => <span data-testid="icon-pencil" />,
  TbOutlineUserPlus: () => <span data-testid="icon-user-plus" />,
}));

vi.mock("@solid-primitives/presence", () => ({
  createPresence: (signal: () => boolean) => ({
    isMounted: () => signal(),
    isVisible: () => signal(),
    isEntering: () => false,
    isExiting: () => false,
  }),
}));

vi.mock("~/store/auth", () => ({
  currentUserRole: () => mockCurrentUserRole(),
  isAuthenticated: () => true,
}));

vi.mock("~/store/outlet", () => ({
  currentOutletId: () => mockCurrentOutletId(),
  isDevicePaired: () => true,
}));

vi.mock("~/store/sync", () => ({
  startSyncScheduler: vi.fn(),
  stopSyncScheduler: vi.fn(),
}));

vi.mock("~/components/sync-status", () => ({
  SyncStatusIndicator: () => <div />,
}));

vi.mock("~/components/ui/offline-banner", () => ({
  OfflineBanner: () => <div />,
}));

vi.mock("solid-sonner", () => ({
  Toaster: () => <div />,
}));

import { AppShell } from "../layout";

const user = userEvent.setup();

async function renderWithSidebar() {
  render(() => <AppShell title="Test">Content</AppShell>);
  await user.click(screen.getByLabelText("Menu"));
}

describe("AppShell sidebar", () => {
  test("owner sees Dashboard, Kasir, Pesanan, Pengaturan", async () => {
    mockCurrentUserRole.mockReturnValue("owner");
    await renderWithSidebar();

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Kasir")).toBeInTheDocument();
    expect(screen.getByText("Pesanan")).toBeInTheDocument();
    expect(screen.getByText("Pengaturan")).toBeInTheDocument();
  });

  test("owner does not see Menu or Users in sidebar", async () => {
    mockCurrentUserRole.mockReturnValue("owner");
    await renderWithSidebar();

    expect(screen.queryByText("Menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Pengguna")).not.toBeInTheDocument();
  });

  test("non-owner does not see Dashboard in sidebar", async () => {
    mockCurrentUserRole.mockReturnValue("staff");
    await renderWithSidebar();

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Pengguna")).not.toBeInTheDocument();
    expect(screen.getByText("Kasir")).toBeInTheDocument();
    expect(screen.getByText("Pesanan")).toBeInTheDocument();
    expect(screen.getByText("Pengaturan")).toBeInTheDocument();
  });
});
