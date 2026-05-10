import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockListPairedPrinters = vi.fn();
const mockTestPrint = vi.fn();
const mockSaveDefaultPrinter = vi.fn();
const mockGetDefaultPrinter = vi.fn<() => string | null>(() => null);
const mockRequestBluetoothPermission = vi.fn();
const mockLogPrinterInfo = vi.fn();
const mockLogPrinterError = vi.fn();
const mockLogPrinterWarn = vi.fn();

vi.mock("~/lib/printer", () => ({
	listPairedPrinters: () => mockListPairedPrinters(),
	testPrint: (...args: unknown[]) => mockTestPrint(...args),
	saveDefaultPrinter: (...args: unknown[]) => mockSaveDefaultPrinter(...args),
	getDefaultPrinter: () => mockGetDefaultPrinter(),
	requestBluetoothPermission: () => mockRequestBluetoothPermission(),
}));

vi.mock("~/lib/printer-log", () => ({
	logPrinterError: (...args: unknown[]) => mockLogPrinterError(...args),
	logPrinterInfo: (...args: unknown[]) => mockLogPrinterInfo(...args),
	logPrinterWarn: (...args: unknown[]) => mockLogPrinterWarn(...args),
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

import PrinterSettings from "../printer-settings";

const user = userEvent.setup();

describe("PrinterSettings", () => {
	afterEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
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
			new Error("Bluetooth not available"),
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
				"Gagal memuat printer. Tekan Segarkan untuk mencoba lagi.",
			);
			expect(screen.queryByText("Memuat...")).not.toBeInTheDocument();
			expect(mockLogPrinterWarn).toHaveBeenCalledWith(
				"settings:load_printers:timeout",
			);
		} finally {
			vi.useRealTimers();
		}
	});

	test("shows permission button when permission error occurs", async () => {
		mockListPairedPrinters.mockRejectedValue(
			"Bluetooth permission is required to list paired printers",
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
		expect(mockLogPrinterWarn).not.toHaveBeenCalledWith(
			"settings:request_permission:reload_fallback",
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
			expect(mockLogPrinterWarn).toHaveBeenCalledWith(
				"settings:request_permission:reload_fallback",
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
		expect(mockLogPrinterInfo).not.toHaveBeenCalled();
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
				}),
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
				"Printer tidak tersambung. Pastikan printer menyala dan berada dalam jangkauan.",
			),
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
			"Printer tidak tersambung. Pastikan printer menyala dan berada dalam jangkauan.",
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
		expect(mockLogPrinterInfo).not.toHaveBeenCalled();
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
});
