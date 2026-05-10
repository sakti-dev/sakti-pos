import { describe, expect, test } from "vitest";
import type { ReceiptData } from "../types";

describe("ReceiptData type", () => {
	test("accepts completed checkout receipt data", () => {
		const data: ReceiptData = {
			business: {
				address: "Jl. Merdeka No. 123",
				name: "SAKTI KOPI",
				phone: "021-1234567",
			},
			items: [
				{
					name: "Kopi Susu Gula Aren",
					quantity: 2,
					subtotal: 36_000,
					unitPrice: 18_000,
				},
			],
			order: {
				cashierName: "Rina",
				createdAt: "2026-05-09T14:32:00.000Z",
				orderNumber: "2026-05-09-014",
			},
			payment: {
				amountPaid: 50_000,
				changeAmount: 14_000,
				method: "cash",
			},
			totals: {
				total: 36_000,
			},
		};

		expect(data.payment.method).toBe("cash");
		expect(data.items[0].subtotal).toBe(36_000);
	});
});
