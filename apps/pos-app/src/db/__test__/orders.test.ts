import { orderItems, orders } from "@sync-contract/local-synced-schema";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();

const tx = {
  insert: mockInsert,
};

vi.mock("~/db", () => ({
  TABLE: { orderItems, orders },
  db: { select: mockSelect },
}));

const enqueueChange = vi.fn();
vi.mock("~/lib/api/sync", () => ({
  getSyncClient: () => ({
    enqueueChange,
    writeTransaction: async (_db: unknown, fn: (t: unknown) => unknown) =>
      await fn(tx),
  }),
}));

const decrementStockForSale = vi.fn();
vi.mock("../inventory", () => ({ decrementStockForSale }));

vi.mock("~/lib/auth/session", () => ({
  currentOutletId: () => "outlet-1",
  currentOutletTimezone: () => "Asia/Jakarta",
  currentRegisterId: () => "register-1",
}));

const FIRST_TODAY_RE = /^\d{4}-\d{2}-\d{2}-001$/;

const { persistOrder } = await import("../orders");

const saleOrder = {
  change: 0,
  createdAt: Date.parse("2026-09-28T04:00:00.000Z"),
  id: "TX-20260928-001",
  lines: [
    {
      category: "Minuman",
      imageAssetId: null,
      lineId: "line-1",
      modifiers: [],
      name: "Es Kopi Susu",
      price: 25_000,
      productId: "prod-1",
      qty: 2,
    },
  ],
  paid: 50_000,
  payment: { method: "qris_static" },
  subtotal: 50_000,
  tax: 0,
  taxRate: 0,
  total: 50_000,
};

const orderRow = {
  amountPaidMinorUnits: 5_000_000,
  changeAmountMinorUnits: 0,
  createdAt: "2026-09-28T04:00:00.000Z",
  id: "order-1",
  orderNumber: "TX-20260928-001",
  outletId: "outlet-1",
  paymentMethod: "qris_static",
  registerId: "register-1",
  status: "completed",
  totalMinorUnits: 5_000_000,
};

describe("orders persistence", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("persistOrder writes order + items in minor units with sync enqueues", async () => {
    mockInsert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([orderRow]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "item-1",
              orderId: "order-1",
              subtotalMinorUnits: 5_000_000,
              unitPriceMinorUnits: 2_500_000,
            },
          ]),
        }),
      });

    const row = await persistOrder(
      saleOrder as unknown as Parameters<typeof persistOrder>[0]
    );

    expect(row.paymentMethod).toBe("qris_static");
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenNthCalledWith(1, orders);
    expect(mockInsert).toHaveBeenNthCalledWith(2, orderItems);

    expect(enqueueChange).toHaveBeenCalledTimes(2);
    const ops = enqueueChange.mock.calls.map((c) => c[1].operation);
    expect(ops).toEqual(["insert", "insert"]);

    /* Stock decrement runs in the same transaction, guarded by the
       inventory helper (no-op for untracked products). */
    expect(decrementStockForSale).toHaveBeenCalledWith(tx, "prod-1", 2);
  });

  test("persistOrder rejects without an active outlet", async () => {
    const session = await import("~/lib/auth/session");
    vi.spyOn(session, "currentOutletId").mockReturnValue(null);
    await expect(
      persistOrder(saleOrder as unknown as Parameters<typeof persistOrder>[0])
    ).rejects.toThrow("no active outlet");
  });
});

describe("nextOrderNumber", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("increments the max existing suffix for the business date", async () => {
    const { businessDate } = await import("../orders");
    const today = businessDate();
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue([
            { orderNumber: `${today}-001` },
            { orderNumber: `${today}-007` },
            { orderNumber: `${today}-003` },
          ]),
      }),
    }));

    const { nextOrderNumber } = await import("../orders");
    await expect(nextOrderNumber()).resolves.toBe(`${today}-008`);
  });

  test("starts at 001 when no orders exist today", async () => {
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }));

    const { nextOrderNumber } = await import("../orders");
    await expect(nextOrderNumber()).resolves.toMatch(FIRST_TODAY_RE);
  });
});
