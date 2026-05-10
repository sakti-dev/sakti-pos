import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	getDefaultPrinter,
	listPairedPrinters,
	printReceipt,
	saveDefaultPrinter,
	testPrint,
} from "../client";
import type { ReceiptData } from "../../receipt/types";

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

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

vi.mock("~/lib/logger", () => ({
	createLogger: vi.fn(() => mockLogger),
	logger: mockLogger,
}));

const receipt: ReceiptData = {
	business: { name: "SAKTI KOPI" },
	items: [{ name: "Kopi", quantity: 1, subtotal: 18_000, unitPrice: 18_000 }],
	order: {
		cashierName: "Rina",
		createdAt: "2026-05-09T14:32:00.000Z",
		orderNumber: "2026-05-09-001",
	},
	payment: { amountPaid: 20_000, changeAmount: 2_000, method: "cash" },
	totals: { total: 18_000 },
};

describe("printer service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
	});

	test("lists paired printers through Tauri command", async () => {
		vi.mocked(invoke).mockResolvedValue([
			{ address: "00:11", name: "Printer58" },
		]);

		const printers = await listPairedPrinters();

		expect(printers).toEqual([{ address: "00:11", name: "Printer58" }]);
		expect(invoke).toHaveBeenCalledWith("list_paired_thermal_printers");
		expect(mockLogger.infoCalls).not.toHaveBeenCalled();
	});

	test("prints receipt through native command", async () => {
		vi.mocked(invoke).mockResolvedValue(undefined);

		await printReceipt("00:11", receipt);

		expect(invoke).toHaveBeenCalledWith("print_thermal_receipt", {
			address: "00:11",
			formattedText: expect.stringContaining("SAKTI KOPI"),
		});
		expect(mockLogger.infoCalls).not.toHaveBeenCalled();
	});

	test("saves and retrieves default printer address", () => {
		saveDefaultPrinter("00:11");

		expect(getDefaultPrinter()).toBe("00:11");
	});

	test("returns null when no default printer saved", () => {
		expect(getDefaultPrinter()).toBeNull();
	});

	test("testPrint invokes test command with address", async () => {
		vi.mocked(invoke).mockResolvedValue(undefined);

		await testPrint("00:11");

		expect(invoke).toHaveBeenCalledWith("test_thermal_printer", {
			address: "00:11",
		});
		expect(mockLogger.infoCalls).not.toHaveBeenCalled();
	});
});
