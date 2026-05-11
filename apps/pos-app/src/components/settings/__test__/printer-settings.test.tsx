import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockListPairedPrinters = vi.fn();
const mockTestPrint = vi.fn();
const mockSaveDefaultPrinter = vi.fn();
const mockGetDefaultPrinter = vi.fn<() => string | null>(() => null);
const mockRequestBluetoothPermission = vi.fn();
const mockGetOutletReceiptDefaults = vi.fn();
const mockSaveOutletReceiptHeader = vi.fn();
const mockCurrentOutletId = vi.fn<() => string | null>(() => null);
const mockLogger = vi.hoisted(() => {
  const info = vi.fn();
  const error = vi.fn();
  const warn = vi.fn();
  const child = vi.fn();
  const debug = vi.fn();
  return {
    error: (...args: unknown[]) => error(...args),
    info: (...args: unknown[]) => info(...args),
    warn: (...args: unknown[]) => warn(...args),
    child,
    debug,
    errorCalls: error,
    infoCalls: info,
    warnCalls: warn,
  };
});

vi.mock("~/lib/printer/client", () => ({
  listPairedPrinters: () => mockListPairedPrinters(),
  testPrint: (...args: unknown[]) => mockTestPrint(...args),
  saveDefaultPrinter: (...args: unknown[]) => mockSaveDefaultPrinter(...args),
  getDefaultPrinter: () => mockGetDefaultPrinter(),
  requestBluetoothPermission: () => mockRequestBluetoothPermission(),
}));

vi.mock("~/db/outlets", () => ({
  getOutletReceiptDefaults: (...args: unknown[]) =>
    mockGetOutletReceiptDefaults(...args),
  saveOutletReceiptHeader: (...args: unknown[]) =>
    mockSaveOutletReceiptHeader(...args),
}));

vi.mock("~/lib/logger", () => ({
  createLogger: vi.fn(() => mockLogger),
  logger: mockLogger,
}));

vi.mock("~/components/ui/button", () => ({
  Button: (props: {
    children: JSX.Element;
    class?: string;
    disabled?: boolean;
    onClick?: () => void;
    variant?: string;
    size?: string;
  }) => (
    <button
      data-testid="button"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  ),
}));

vi.mock("solid-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("~/store/outlet", () => ({
  currentOutletId: () => mockCurrentOutletId(),
}));

import PrinterSettings from "../printer-settings";

const user = userEvent.setup();

describe("PrinterSettings", () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockCurrentOutletId.mockReturnValue(null);
  });

  test("shows paired printers returned by listPairedPrinters", async () => {
    mockListPairedPrinters.mockResolvedValue([
      { address: "00:11:22:33:44:55", name: "Printer58" },
      { address: "AA:BB:CC:DD:EE:FF", name: "ThermalPrinter" },
    ]);

    render(() => <PrinterSettings />);
    await screen.findByText("Printer58");
    expect(screen.getByText("ThermalPrinter")).toBeInTheDocument();
  });

  test("shows error message when listing fails with non-permission error", async () => {
    mockListPairedPrinters.mockRejectedValue(
      new Error("Bluetooth not available")
    );

    render(() => <PrinterSettings />);
    await screen.findByText("Bluetooth not available");
  });

  test("stops loading when printer listing invoke hangs", async () => {
    vi.useFakeTimers();
    try {
      mockListPairedPrinters.mockReturnValue(new Promise(() => {}));

      render(() => <PrinterSettings />);
      expect(screen.getByText("Memuat...")).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(3000);

      await screen.findByText(
        "Gagal memuat printer. Tekan Segarkan untuk mencoba lagi."
      );
      expect(screen.queryByText("Memuat...")).not.toBeInTheDocument();
      expect(mockLogger.warnCalls).toHaveBeenCalledWith(
        "load_printers:timeout"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("shows permission button when permission error occurs", async () => {
    mockListPairedPrinters.mockRejectedValue(
      "Bluetooth permission is required to list paired printers"
    );

    render(() => <PrinterSettings />);
    await screen.findByText("Berikan Izin Bluetooth");
  });

  test("requests permission and reloads printers on grant", async () => {
    mockListPairedPrinters
      .mockRejectedValueOnce("Bluetooth permission is required")
      .mockResolvedValueOnce([
        { address: "00:11:22:33:44:55", name: "Printer58" },
      ]);
    mockRequestBluetoothPermission.mockResolvedValue(undefined);

    render(() => <PrinterSettings />);
    await screen.findByText("Berikan Izin Bluetooth");

    await user.click(screen.getByText("Berikan Izin Bluetooth"));

    expect(mockRequestBluetoothPermission).toHaveBeenCalled();
    await screen.findByText("Printer58");
    expect(mockLogger.warnCalls).not.toHaveBeenCalledWith(
      "settings:request_permission:reload_fallback"
    );
  });

  test("reloads printers when permission invoke callback is delayed", async () => {
    vi.useFakeTimers();
    try {
      mockListPairedPrinters
        .mockRejectedValueOnce("Bluetooth permission is required")
        .mockResolvedValueOnce([
          { address: "00:11:22:33:44:55", name: "Printer58" },
        ]);
      mockRequestBluetoothPermission.mockReturnValue(new Promise(() => {}));

      render(() => <PrinterSettings />);
      await screen.findByText("Berikan Izin Bluetooth");

      fireEvent.click(screen.getByText("Berikan Izin Bluetooth"));
      await vi.advanceTimersByTimeAsync(1500);

      await screen.findByText("Printer58");
      expect(mockListPairedPrinters).toHaveBeenCalledTimes(2);
      expect(mockLogger.warnCalls).toHaveBeenCalledWith(
        "request_permission:reload_fallback"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("reloads paired printers when refresh button is clicked", async () => {
    const { toast } = await import("solid-sonner");
    mockListPairedPrinters
      .mockResolvedValueOnce([
        { address: "00:11:22:33:44:55", name: "Printer58" },
      ])
      .mockResolvedValueOnce([
        { address: "AA:BB:CC:DD:EE:FF", name: "ThermalPrinter" },
      ]);

    render(() => <PrinterSettings />);
    await screen.findByText("Printer58");

    await user.click(screen.getByText("Segarkan"));

    await screen.findByText("ThermalPrinter");
    expect(mockListPairedPrinters).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith("1 printer ditemukan");
    expect(mockLogger.infoCalls).not.toHaveBeenCalled();
  });

  test("shows refresh progress while reload is pending", async () => {
    let resolveRefresh: ((value: unknown[]) => void) | undefined;
    mockListPairedPrinters
      .mockResolvedValueOnce([
        { address: "00:11:22:33:44:55", name: "Printer58" },
      ])
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        })
      );

    render(() => <PrinterSettings />);
    await screen.findByText("Printer58");

    await user.click(screen.getByText("Segarkan"));

    expect(screen.getByText("Menyegarkan...")).toBeInTheDocument();
    resolveRefresh?.([
      { address: "AA:BB:CC:DD:EE:FF", name: "ThermalPrinter" },
    ]);
    await screen.findByText("ThermalPrinter");
    expect(screen.getByText("Segarkan")).toBeInTheDocument();
  });

  test("shows friendly offline message when test print cannot connect", async () => {
    const { toast } = await import("solid-sonner");
    mockListPairedPrinters.mockResolvedValue([
      { address: "00:11:22:33:44:55", name: "Printer58" },
    ]);
    mockGetDefaultPrinter.mockReturnValue("00:11:22:33:44:55");
    mockRequestBluetoothPermission.mockResolvedValue(undefined);
    mockTestPrint.mockRejectedValue(
      new Error(
        "Printer tidak tersambung. Pastikan printer menyala dan berada dalam jangkauan."
      )
    );

    render(() => <PrinterSettings />);
    await screen.findByText("Printer58");

    const testButtons = screen.getAllByTestId("button");
    const testBtn = testButtons.find((b) => b.textContent?.includes("Cetak"));
    expect(testBtn).toBeDefined();
    if (!testBtn) {
      throw new Error("Test button not found");
    }
    await user.click(testBtn);

    expect(toast.error).toHaveBeenCalledWith(
      "Printer tidak tersambung. Pastikan printer menyala dan berada dalam jangkauan."
    );
  });

  test("saves selected printer through saveDefaultPrinter", async () => {
    mockListPairedPrinters.mockResolvedValue([
      { address: "00:11:22:33:44:55", name: "Printer58" },
    ]);

    render(() => <PrinterSettings />);
    await screen.findByText("Printer58");

    await user.click(screen.getByText("Printer58"));

    expect(mockSaveDefaultPrinter).toHaveBeenCalledWith("00:11:22:33:44:55");
  });

  test("calls testPrint when test button is clicked", async () => {
    mockListPairedPrinters.mockResolvedValue([
      { address: "00:11:22:33:44:55", name: "Printer58" },
    ]);
    mockGetDefaultPrinter.mockReturnValue("00:11:22:33:44:55");
    mockTestPrint.mockResolvedValue(undefined);

    render(() => <PrinterSettings />);
    await screen.findByText("Printer58");

    const testButtons = screen.getAllByTestId("button");
    const testBtn = testButtons.find((b) => b.textContent?.includes("Cetak"));
    expect(testBtn).toBeDefined();
    if (!testBtn) {
      throw new Error("Test button not found");
    }
    await user.click(testBtn);

    expect(mockRequestBluetoothPermission).toHaveBeenCalled();
    expect(mockTestPrint).toHaveBeenCalledWith("00:11:22:33:44:55");
    expect(mockLogger.infoCalls).not.toHaveBeenCalled();
  });

  test("shows saved default printer as selected", async () => {
    mockGetDefaultPrinter.mockReturnValue("AA:BB:CC:DD:EE:FF");
    mockListPairedPrinters.mockResolvedValue([
      { address: "00:11:22:33:44:55", name: "Printer58" },
      { address: "AA:BB:CC:DD:EE:FF", name: "ThermalPrinter" },
    ]);

    render(() => <PrinterSettings />);
    await screen.findByText("ThermalPrinter");

    expect(screen.getByText("Printer tersimpan")).toBeInTheDocument();
  });

  test("shows empty state when no printers found", async () => {
    mockListPairedPrinters.mockResolvedValue([]);

    render(() => <PrinterSettings />);
    await screen.findByText("Tidak ada printer ditemukan");
  });

  test("shows and saves outlet receipt header fields", async () => {
    const { toast } = await import("solid-sonner");
    mockCurrentOutletId.mockReturnValue("outlet-1");
    mockGetOutletReceiptDefaults.mockResolvedValue({
      merchantName: "Warung Satu",
      effectiveAddress: "Jl. Merdeka 1",
      effectiveName: "Warung Satu",
      outletAddress: "Jl. Merdeka 1",
      outletName: "Cabang Sudirman",
    });
    mockSaveOutletReceiptHeader.mockResolvedValue({
      address: "Jl. Merdeka 1",
      id: "outlet-1",
      merchantId: "merchant-1",
      name: "Cabang Sudirman",
      receiptAddress: "Jl. Merdeka 1",
      receiptName: "Warung Satu",
      timezone: "Asia/Jakarta",
    });
    mockListPairedPrinters.mockResolvedValue([]);

    render(() => <PrinterSettings />);

    const receiptNameInput = await screen.findByLabelText(
      "Nama merchant di struk"
    );
    const receiptAddressInput = await screen.findByLabelText("Alamat di struk");

    expect(receiptNameInput).toHaveValue("Warung Satu");
    expect(receiptAddressInput).toHaveValue("Jl. Merdeka 1");

    await user.click(screen.getByText("Simpan Header Struk"));

    expect(mockSaveOutletReceiptHeader).toHaveBeenCalledWith(
      "outlet-1",
      "Warung Satu",
      "Jl. Merdeka 1"
    );
    expect(toast.success).toHaveBeenCalledWith("Header struk disimpan");
  });

  test("disables save button when receipt header fields are empty", async () => {
    mockCurrentOutletId.mockReturnValue("outlet-1");
    mockGetOutletReceiptDefaults.mockResolvedValue(null);
    mockListPairedPrinters.mockResolvedValue([]);

    render(() => <PrinterSettings />);

    const saveButton = await screen.findByText("Simpan Header Struk");
    expect(saveButton.closest("button")).toBeDisabled();
  });
});
