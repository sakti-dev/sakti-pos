import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ReceiptData } from "../../receipt/types";
import {
  getDefaultPrinter,
  listPairedPrinters,
  printReceipt,
  saveDefaultPrinter,
  testPrint,
} from "../client";

const localStorageMock = {
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  store: {} as Record<string, string>,
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

const receipt: ReceiptData = {
  business: { name: "SAKTI KOPI" },
  items: [{ name: "Kopi", quantity: 1, subtotal: 18_000, unitPrice: 18_000 }],
  order: {
    cashierName: "Rina",
    createdAt: "2026-05-09T14:32:00.000Z",
    orderNumber: "2026-05-09-001",
  },
  payment: { amountPaid: 20_000, changeAmount: 2000, method: "cash" },
  totals: { total: 18_000 },
};

describe("printer service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
  });

  test("lists paired printers through Tauri command", async () => {
    mockedInvoke.mockResolvedValue([{ address: "00:11", name: "Printer58" }]);

    const printers = await listPairedPrinters();

    expect(printers).toEqual([{ address: "00:11", name: "Printer58" }]);
    expect(invoke).toHaveBeenCalledWith("list_paired_thermal_printers");
  });

  test("prints receipt through native command", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await printReceipt("00:11", receipt);

    expect(invoke).toHaveBeenCalledWith("print_thermal_receipt", {
      address: "00:11",
      formattedText: expect.stringContaining("SAKTI KOPI"),
    });
  });

  test("saves and retrieves default printer address", () => {
    saveDefaultPrinter("00:11");

    expect(getDefaultPrinter()).toBe("00:11");
  });

  test("returns null when no default printer saved", () => {
    expect(getDefaultPrinter()).toBeNull();
  });

  test("testPrint invokes test command with address", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await testPrint("00:11");

    expect(invoke).toHaveBeenCalledWith("test_thermal_printer", {
      address: "00:11",
    });
  });
});
