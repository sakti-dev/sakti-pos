import { invoke } from "@tauri-apps/api/core";
import { formatReceiptForAndroid } from "~/lib/receipt/format-receipt";
import type { ReceiptData } from "~/lib/receipt/types";
import { createLogger } from "~/lib/logger";

const printerLogger = createLogger({ module: "printer" });

const DEFAULT_PRINTER_KEY = "sakti.defaultPrinterAddress";

export interface ThermalPrinterInfo {
	address: string;
	name: string;
}

export const listPairedPrinters = async (): Promise<ThermalPrinterInfo[]> => {
	try {
		return await invoke<ThermalPrinterInfo[]>("list_paired_thermal_printers");
	} catch (error) {
		printerLogger.error("list_paired_printers:failed", error);
		throw error;
	}
};

export const printReceipt = async (
	address: string,
	receipt: ReceiptData,
): Promise<void> => {
	try {
		await invoke("print_thermal_receipt", {
			address,
			formattedText: formatReceiptForAndroid(receipt),
		});
	} catch (error) {
		printerLogger.error("print_receipt:failed", error, {
			address,
			orderNumber: receipt.order.orderNumber,
		});
		throw error;
	}
};

export const testPrint = async (address: string): Promise<void> => {
	try {
		await invoke("test_thermal_printer", { address });
	} catch (error) {
		printerLogger.error("test_print:failed", error, { address });
		throw error;
	}
};

export const requestBluetoothPermission = async (): Promise<void> => {
	try {
		await invoke("request_bluetooth_permission");
	} catch (error) {
		printerLogger.error("request_bluetooth_permission:failed", error);
		throw error;
	}
};

export const getDefaultPrinter = (): string | null =>
	localStorage.getItem(DEFAULT_PRINTER_KEY);

export const saveDefaultPrinter = (address: string): void => {
	localStorage.setItem(DEFAULT_PRINTER_KEY, address);
};
