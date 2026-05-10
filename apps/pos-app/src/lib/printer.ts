import { invoke } from "@tauri-apps/api/core";
import { logPrinterError } from "~/lib/printer-log";
import { formatReceiptForAndroid } from "~/lib/receipt/format-receipt";
import type { ReceiptData } from "~/lib/receipt/types";

const DEFAULT_PRINTER_KEY = "sakti.defaultPrinterAddress";

export interface ThermalPrinterInfo {
	address: string;
	name: string;
}

export const listPairedPrinters = async (): Promise<ThermalPrinterInfo[]> => {
	try {
		return await invoke<ThermalPrinterInfo[]>("list_paired_thermal_printers");
	} catch (error) {
		logPrinterError("service:list_paired_printers:failed", error);
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
		logPrinterError("service:print_receipt:failed", error, {
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
		logPrinterError("service:test_print:failed", error, { address });
		throw error;
	}
};

export const requestBluetoothPermission = async (): Promise<void> => {
	try {
		await invoke("request_bluetooth_permission");
	} catch (error) {
		logPrinterError("service:request_bluetooth_permission:failed", error);
		throw error;
	}
};

export const getDefaultPrinter = (): string | null =>
	localStorage.getItem(DEFAULT_PRINTER_KEY);

export const saveDefaultPrinter = (address: string): void => {
	localStorage.setItem(DEFAULT_PRINTER_KEY, address);
};
