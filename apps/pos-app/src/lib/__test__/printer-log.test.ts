import { describe, expect, test } from "vitest";
import { formatPrinterErrorLog, formatPrinterLog } from "../printer-log";

describe("printer log formatting", () => {
	test("formats info logs with the printer prefix", () => {
		expect(formatPrinterLog("settings:test_print:start")).toBe(
			"[PRINTER] settings:test_print:start",
		);
	});

	test("formats logs with structured payloads", () => {
		expect(
			formatPrinterLog("settings:test_print:success", {
				address: "00:11:22:33:44:55",
				orderNumber: "2026-05-09-001",
			}),
		).toBe(
			'[PRINTER] settings:test_print:success {"address":"00:11:22:33:44:55","orderNumber":"2026-05-09-001"}',
		);
	});

	test("formats error logs with normalized error details", () => {
		expect(
			formatPrinterErrorLog(
				"settings:test_print:failed",
				new Error("Bluetooth is off"),
				{
					address: "00:11:22:33:44:55",
				},
			),
		).toBe(
			'[PRINTER] settings:test_print:failed {"address":"00:11:22:33:44:55","error":"Error: Bluetooth is off"}',
		);
	});
});
