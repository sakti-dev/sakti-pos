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

const getRecipesForProducts = vi.fn(
  async () =>
    [] as { ingredientId: string; productId: string; qtyPerUnit: number }[]
);
vi.mock("../recipes", () => ({ getRecipesForProducts }));

const resolveSaleWallet = vi.fn(async (): Promise<unknown> => undefined);
const applySaleDeposit = vi.fn(async () => undefined);
vi.mock("../wallets", () => ({
  resolveSaleWallet,
  applySaleDeposit,
  requireStaffId: () => "staff-1",
}));

vi.mock("~/lib/utils", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

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
    expect(decrementStockForSale).toHaveBeenCalledWith(
      tx,
      "product",
      "prod-1",
      2
    );
  });

  test("recipe-linked ingredients deduct qtyPerUnit × qty in the same transaction", async () => {
    getRecipesForProducts.mockResolvedValueOnce([
      { ingredientId: "ing-1", productId: "prod-1", qtyPerUnit: 0.25 },
    ]);
    mockInsert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([orderRow]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "item-1", orderId: "order-1" }]),
        }),
      });

    await persistOrder(
      saleOrder as unknown as Parameters<typeof persistOrder>[0]
    );

    expect(getRecipesForProducts).toHaveBeenCalledWith(["prod-1"]);
    expect(decrementStockForSale).toHaveBeenCalledWith(
      tx,
      "ingredient",
      "ing-1",
      0.5
    );
  });

  test("recipe lookup is batched across distinct product ids", async () => {
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "x" }]),
      }),
    }));
    await persistOrder(
      saleOrder as unknown as Parameters<typeof persistOrder>[0]
    );
    expect(getRecipesForProducts).toHaveBeenCalledTimes(1);
  });

  test("persistOrder rejects without an active outlet", async () => {
    const session = await import("~/lib/auth/session");
    vi.spyOn(session, "currentOutletId").mockReturnValue(null);
    await expect(
      persistOrder(saleOrder as unknown as Parameters<typeof persistOrder>[0])
    ).rejects.toThrow("no active outlet");
  });

  test("resolves a wallet, stamps it on the order, and deposits the total at the tail", async () => {
    const session = await import("~/lib/auth/session");
    vi.spyOn(session, "currentOutletId").mockReturnValue("outlet-1");
    const wallet = {
      id: "w-cash",
      outletId: "outlet-1",
      type: "cash",
      currentBalanceMinorUnits: 450_000,
    };
    resolveSaleWallet.mockResolvedValueOnce(wallet);
    const valuesFn = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "order-9" }]),
    });
    mockInsert.mockImplementation(() => ({ values: valuesFn }));
    /* Spec scenario: Rp 50.000 sale paid with Rp 100.000 → wallet gains
       exactly the total (change was funded by the over-tender). */
    const cashSale = {
      ...saleOrder,
      payment: { method: "cash" },
      paid: 100_000,
      change: 50_000,
    };

    await persistOrder(
      cashSale as unknown as Parameters<typeof persistOrder>[0]
    );

    expect(resolveSaleWallet).toHaveBeenCalledWith("cash");
    const orderValues = valuesFn.mock.calls[0][0];
    expect(orderValues.walletId).toBe("w-cash");
    expect(applySaleDeposit).toHaveBeenCalledTimes(1);
    expect(applySaleDeposit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        wallet,
        orderId: "order-9",
        netAmountMinorUnits: 5_000_000,
        staffId: "staff-1",
      })
    );
  });

  test("deposit failure aborts the order write (same-transaction guarantee)", async () => {
    const session = await import("~/lib/auth/session");
    vi.spyOn(session, "currentOutletId").mockReturnValue("outlet-1");
    resolveSaleWallet.mockResolvedValueOnce({
      id: "w-cash",
      outletId: "outlet-1",
      type: "cash",
      currentBalanceMinorUnits: 0,
    });
    applySaleDeposit.mockRejectedValueOnce(new Error("wallet write boom"));

    await expect(
      persistOrder(saleOrder as unknown as Parameters<typeof persistOrder>[0])
    ).rejects.toThrow("wallet write boom");
  });

  test("no wallet resolved → order still persists, no deposit", async () => {
    const session = await import("~/lib/auth/session");
    vi.spyOn(session, "currentOutletId").mockReturnValue("outlet-1");
    resolveSaleWallet.mockResolvedValueOnce(undefined);
    const valuesFn = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "order-10" }]),
    });
    mockInsert.mockImplementation(() => ({ values: valuesFn }));

    const row = await persistOrder(
      saleOrder as unknown as Parameters<typeof persistOrder>[0]
    );

    expect(row.id).toBe("order-10");
    expect(applySaleDeposit).not.toHaveBeenCalled();
    expect(valuesFn.mock.calls[0][0].walletId).toBeUndefined();
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
