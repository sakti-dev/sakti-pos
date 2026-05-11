import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockSetTheme = vi.fn();

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() =>
    Promise.resolve({ db_path: "/data/sakti.db", size_formatted: "2.4 MB" })
  ),
}));

vi.mock("~/store/auth", () => ({
  currentUser: vi.fn(() => ({ id: 1, name: "Admin", role: "owner" })),
  currentUserRole: vi.fn(() => "owner"),
  logout: vi.fn(),
  changeCurrentUserPin: vi.fn(),
}));

vi.mock("~/store/outlet", () => ({
  clearOutletContext: vi.fn(),
  currentOutletId: () => "outlet-1",
  currentOutletTimezone: () => "Asia/Jakarta",
  setOutletTimezone: vi.fn(),
}));

vi.mock("~/store/theme", () => ({
  theme: vi.fn(() => "system"),
  setTheme: (...args: unknown[]) => mockSetTheme(...args),
}));

vi.mock("~/db/outlets", () => ({
  getOutletById: vi.fn(() =>
    Promise.resolve({
      id: "outlet-1",
      name: "Cabang Sudirman",
      timezone: "Asia/Jakarta",
    })
  ),
  updateOutletTimezone: vi.fn(),
}));

vi.mock("~/lib/auth/cloud", () => ({
  getSession: vi.fn(() => Promise.resolve({ user: null })),
  logout: vi.fn(),
}));

vi.mock("~/lib/shop", () => ({
  currentShopId: vi.fn(() => null),
  setShopId: vi.fn(),
}));

vi.mock("~/components/layout", () => ({
  AppShell: (props: { children: JSX.Element; title: string }) => (
    <div>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  ),
}));

vi.mock("~/components/confirm-drawer", () => ({
  ConfirmDrawer: (props: {
    open: boolean;
    message: string;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) => (
    <Show when={props.open}>
      <div data-testid="confirm-drawer">
        <h3>{props.title}</h3>
        <p>{props.message}</p>
        <button
          data-testid="confirm-btn"
          onClick={props.onConfirm}
          type="button"
        >
          {props.confirmLabel}
        </button>
      </div>
    </Show>
  ),
}));

vi.mock("~/components/ui/button", () => ({
  Button: (props: {
    children: JSX.Element;
    class?: string;
    onClick?: () => void;
    variant?: string;
    disabled?: boolean;
  }) => (
    <button
      class={props.class}
      data-testid={props.variant === "outline" ? "outline-btn" : "primary-btn"}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
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

vi.mock("~/components/settings/printer-settings", () => ({
  default: () => <div data-testid="printer-settings" />,
}));

vi.mock("~/components/ui/select", () => ({
  Select: (props: {
    label: string;
    onChange: (value: unknown) => void;
    options: { label: string; value: string }[];
    value: string;
  }) => (
    <select
      aria-label={props.label}
      data-testid="select"
      onChange={(e) => props.onChange(e.currentTarget.value)}
      value={props.value}
    >
      <For each={props.options}>
        {(o) => <option value={o.value}>{o.label}</option>}
      </For>
    </select>
  ),
}));

vi.mock("~/components/ui/drawer", () => ({
  Drawer: (props: {
    children: JSX.Element;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <Show when={props.open}>
      <div data-testid="drawer">{props.children}</div>
    </Show>
  ),
  DrawerContent: (props: { children: JSX.Element; class?: string }) => (
    <div data-testid="drawer-content">{props.children}</div>
  ),
  DrawerOverlay: () => <div data-testid="drawer-overlay" />,
  DrawerPortal: (props: { children: JSX.Element }) => <>{props.children}</>,
  DrawerTitle: (props: { children: JSX.Element }) => (
    <h2 data-testid="drawer-title">{props.children}</h2>
  ),
}));

vi.mock("solid-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import AccountSettings from "../account";
import CloudSettings from "../cloud";
import OutletSettings from "../outlet";
import PrinterSettingsPage from "../printer";
import ProductsCategoriesSettings from "../products-categories";
import Settings from "../settings";
import { formatSyncSuccessMessage } from "../use-settings";

const user = userEvent.setup();

describe("Settings card launcher", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows cards for Akun, Outlet, Printer, Produk & Kategori, Cloud", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");

    expect(screen.getByText("Akun")).toBeInTheDocument();
    expect(screen.getByText("Outlet")).toBeInTheDocument();
    expect(screen.getByText("Printer")).toBeInTheDocument();
    expect(screen.getByText("Produk & Kategori")).toBeInTheDocument();
    expect(screen.getByText("Cloud")).toBeInTheDocument();
  });

  test("shows Aplikasi section with theme toggle", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");

    expect(screen.getByText("Aplikasi")).toBeInTheDocument();
    expect(screen.getByText("Terang")).toBeInTheDocument();
    expect(screen.getByText("Sistem")).toBeInTheDocument();
    expect(screen.getByText("Gelap")).toBeInTheDocument();
  });

  test("calls setTheme when theme button is clicked", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    await user.click(screen.getByText("Gelap"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  test("does not show inline Ubah PIN button on home page", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    expect(screen.queryByText("Ubah PIN")).not.toBeInTheDocument();
  });

  test("does not show inline Sinkron Sekarang button on home page", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    expect(screen.queryByText("Sinkron Sekarang")).not.toBeInTheDocument();
  });

  test("does not show account details block on home page", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  test("shows version and DB info in Aplikasi section", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    expect(screen.getByText("2.4 MB")).toBeInTheDocument();
  });

  test("navigates to account screen when Akun card is clicked", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    await user.click(screen.getByText("Akun"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/account");
  });

  test("navigates to outlet screen when Outlet card is clicked", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    await user.click(screen.getByText("Outlet"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/outlet");
  });

  test("navigates to printer screen when Printer card is clicked", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    await user.click(screen.getByText("Printer"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/printer");
  });

  test("navigates to products-categories screen when Produk & Kategori card is clicked", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    await user.click(screen.getByText("Produk & Kategori"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/products-categories");
  });

  test("navigates to cloud screen when Cloud card is clicked", async () => {
    render(() => <Settings />);
    await screen.findByText("Pengaturan");
    await user.click(screen.getByText("Cloud"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/cloud");
  });
});

describe("formatSyncSuccessMessage", () => {
  test("shows data already current for skipped sync", () => {
    expect(
      formatSyncSuccessMessage({
        mode: "skipped",
        pull: { rows_received: 0, server_time: "" },
        purged: 0,
        push: { server_time: "", server_wins_count: 0, tables_synced: [] },
      })
    ).toBe("Data sudah terbaru");
  });

  test("shows received rows for pull only sync", () => {
    expect(
      formatSyncSuccessMessage({
        mode: "pull_only",
        pull: { rows_received: 4, server_time: "2026-05-09T12:00:00.000Z" },
        purged: 0,
        push: { server_time: "", server_wins_count: 0, tables_synced: [] },
      })
    ).toBe("Sinkronisasi berhasil (4 diterima)");
  });

  test("shows sent table count for push only sync", () => {
    expect(
      formatSyncSuccessMessage({
        mode: "push_only",
        pull: { rows_received: 0, server_time: "" },
        purged: 0,
        push: {
          server_time: "2026-05-09T12:00:00.000Z",
          server_wins_count: 0,
          tables_synced: ["products", "categories"],
        },
      })
    ).toBe("Sinkronisasi berhasil (2 tabel dikirim)");
  });

  test("shows received sent and purged counts for full sync", () => {
    expect(
      formatSyncSuccessMessage({
        mode: "full",
        pull: { rows_received: 4, server_time: "2026-05-09T12:00:00.000Z" },
        purged: 1,
        push: {
          server_time: "2026-05-09T12:00:00.000Z",
          server_wins_count: 0,
          tables_synced: ["products", "categories"],
        },
      })
    ).toBe(
      "Sinkronisasi berhasil (4 diterima, 2 tabel dikirim, 1 dibersihkan)"
    );
  });
});

describe("Account settings screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows user name, role, and Ubah PIN", async () => {
    render(() => <AccountSettings />);
    await screen.findByText("Akun");
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("Ubah PIN")).toBeInTheDocument();
  });

  test("opens PIN drawer when Ubah PIN is clicked", async () => {
    render(() => <AccountSettings />);
    await screen.findByText("Akun");
    await user.click(screen.getByText("Ubah PIN"));
    expect(screen.getByTestId("drawer-title")).toHaveTextContent("Ubah PIN");
  });
});

describe("Outlet settings screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows outlet timezone selector", async () => {
    render(() => <OutletSettings />);
    await screen.findByText("Outlet");
    expect(screen.getByText("Zona Waktu Outlet")).toBeInTheDocument();
    expect(screen.getByText("Simpan Zona Waktu")).toBeInTheDocument();
  });
});

describe("Printer settings screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows printer settings component", async () => {
    render(() => <PrinterSettingsPage />);
    await screen.findByText("Printer");
    expect(screen.getByTestId("printer-settings")).toBeInTheDocument();
  });
});

describe("Products & Categories settings screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows Kategori and Produk tabs", async () => {
    render(() => <ProductsCategoriesSettings />);
    await screen.findByText("Produk & Kategori");
    expect(screen.getByText("Kategori")).toBeInTheDocument();
    expect(screen.getByText("Produk")).toBeInTheDocument();
  });
});

describe("Cloud settings screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows cloud connect button when not connected", async () => {
    render(() => <CloudSettings />);
    await screen.findByText("Cloud");
    expect(screen.getByText("Hubungkan akun cloud")).toBeInTheDocument();
  });

  test("does not show Sinkron Sekarang button", async () => {
    render(() => <CloudSettings />);
    await screen.findByText("Cloud");
    expect(screen.queryByText("Sinkron Sekarang")).not.toBeInTheDocument();
  });
});
