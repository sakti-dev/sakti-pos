import { describe, expect, test } from "vitest";
import { formatReceiptForAndroid } from "../format-receipt";
import type { ReceiptData } from "../types";

const receipt: ReceiptData = {
  business: {
    address: "Jl. Merdeka No. 123",
    name: "SAKTI KOPI",
    phone: "021-1234567",
    timezone: "Asia/Jakarta",
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

describe("formatReceiptForAndroid", () => {
  test("uses DantSu formatted text alignment tags", () => {
    const text = formatReceiptForAndroid(receipt);

    expect(text).toContain("[C]<b><font size='big'>SAKTI KOPI</font></b>");
    expect(text).toContain("[L]No:");
    expect(text).toContain("[L]Kasir:");
    expect(text).toContain("[L]Tgl:");
    expect(text).toContain("[L]Kopi Susu Gula Aren");
    expect(text).toContain("[R]36.000");
  });

  test("wraps long item names without exceeding 32 visible chars", () => {
    const text = formatReceiptForAndroid({
      ...receipt,
      items: [
        {
          name: "Roti Bakar Coklat Keju Spesial Lebar Sekali",
          quantity: 1,
          subtotal: 15_000,
          unitPrice: 15_000,
        },
      ],
    });

    const nameLines = text
      .split("\n")
      .filter((l: string) => l.startsWith("[L]") && !l.includes("x "))
      .map((l: string) => l.slice(3));

    for (const line of nameLines) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
    expect(nameLines.length).toBeGreaterThanOrEqual(2);
  });

  test("formats QRIS payment without change line", () => {
    const text = formatReceiptForAndroid({
      ...receipt,
      payment: {
        amountPaid: 36_000,
        changeAmount: null,
        method: "qris",
      },
    });

    expect(text).toContain("[L]Metode: QRIS");
    expect(text).not.toContain("[L]Kembali");
  });

  test("includes subtotal, tax, and admin fee when present", () => {
    const text = formatReceiptForAndroid({
      ...receipt,
      totals: {
        subtotal: 34_000,
        tax: { label: "PPN 10%", amount: 3400 },
        adminFee: { label: "Admin QRIS", amount: 500 },
        total: 37_900,
      },
    });

    expect(text).toContain("[L]Subtotal[R]34.000");
    expect(text).toContain("[L]PPN 10%[R]3.400");
    expect(text).toContain("[L]Admin QRIS[R]500");
    expect(text).toContain("[L]<b>TOTAL</b>[R]<b>37.900</b>");
  });
});
