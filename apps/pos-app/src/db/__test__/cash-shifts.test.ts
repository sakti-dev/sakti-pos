import { cashShifts } from "@sync-contract/local-synced-schema";
import dayjs from "dayjs";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

const tx = { insert: mockInsert, select: mockSelect, update: mockUpdate };

vi.mock("~/db", () => ({
  TABLE: {
    cashShifts,
    orders: {
      createdAt: "createdAt",
      deletedAt: "deletedAt",
      outletId: "outletId",
      paymentMethod: "paymentMethod",
      status: "status",
      totalMinorUnits: "totalMinorUnits",
    },
  },
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

vi.mock("~/lib/auth/session", () => ({
  currentOutletId: () => "outlet-1",
  currentUser: () => ({ id: "staff-1", name: "Andi", role: "cashier" }),
}));

const {
  closeShift,
  computeDifferenceMinorUnits,
  computeExpectedCash,
  getOpenShift,
  isCashSaleInShift,
  isQrisSaleInShift,
  openShift,
} = await import("../cash-shifts");

/* Relative to real time so the suite is date-independent (see
   orders.test.ts businessDate fix for the same class of bug). */
const OPENED = dayjs().subtract(9, "hour").toISOString();
const CLOSED = dayjs().toISOString();

const order = (overrides: Partial<Record<string, unknown>> = {}) => ({
  createdAt: dayjs().subtract(4, "hour").toISOString(),
  deletedAt: null,
  paymentMethod: "cash",
  status: "completed",
  totalMinorUnits: 100_000,
  ...overrides,
});

describe("isCashSaleInShift", () => {
  test("accepts a completed cash order inside the window", () => {
    expect(isCashSaleInShift(order(), OPENED, CLOSED)).toBe(true);
  });

  test.each([
    "qris_static",
    "qris_dynamic",
    "qris",
    "card",
  ])("excludes non-cash payment (%s)", (method) => {
    expect(
      isCashSaleInShift(order({ paymentMethod: method }), OPENED, CLOSED)
    ).toBe(false);
  });

  test("excludes cancelled and soft-deleted orders", () => {
    expect(
      isCashSaleInShift(order({ status: "cancelled" }), OPENED, CLOSED)
    ).toBe(false);
    expect(
      isCashSaleInShift(
        order({ deletedAt: "2026-09-29T06:00:00.000Z" }),
        OPENED,
        CLOSED
      )
    ).toBe(false);
  });

  test("window is [openedAt, closedAt) — inclusive open, exclusive close", () => {
    expect(
      isCashSaleInShift(order({ createdAt: OPENED }), OPENED, CLOSED)
    ).toBe(true);
    expect(
      isCashSaleInShift(
        order({ createdAt: dayjs(OPENED).subtract(1, "ms").toISOString() }),
        OPENED,
        CLOSED
      )
    ).toBe(false);
    expect(
      isCashSaleInShift(order({ createdAt: CLOSED }), OPENED, CLOSED)
    ).toBe(false);
    expect(
      isCashSaleInShift(
        order({ createdAt: dayjs(CLOSED).subtract(1, "ms").toISOString() }),
        OPENED,
        CLOSED
      )
    ).toBe(true);
  });
});

describe("isQrisSaleInShift", () => {
  test("accepts all qris variants, rejects cash", () => {
    expect(
      isQrisSaleInShift(order({ paymentMethod: "qris_static" }), OPENED, CLOSED)
    ).toBe(true);
    expect(
      isQrisSaleInShift(order({ paymentMethod: "qris" }), OPENED, CLOSED)
    ).toBe(true);
    expect(isQrisSaleInShift(order(), OPENED, CLOSED)).toBe(false);
  });
});

describe("computeExpectedCash", () => {
  test("float + cash sales only (QRIS and cancelled excluded)", () => {
    const expected = computeExpectedCash(
      500_000,
      [
        order({ totalMinorUnits: 200_000 }),
        order({ paymentMethod: "qris_static", totalMinorUnits: 850_000 }),
        order({ status: "cancelled", totalMinorUnits: 50_000 }),
        order({ createdAt: CLOSED, totalMinorUnits: 75_000 }), // at close boundary: excluded
      ],
      OPENED,
      CLOSED
    );
    expect(expected).toBe(700_000);
  });
});

describe("computeDifferenceMinorUnits", () => {
  test("signed: short negative, over positive", () => {
    expect(computeDifferenceMinorUnits(1_250_000, 1_255_000)).toBe(-5000);
    expect(computeDifferenceMinorUnits(1_260_000, 1_255_000)).toBe(5000);
  });
});

describe("openShift", () => {
  afterEach(() => vi.clearAllMocks());

  test("inserts an open shift with opener + float and enqueues sync", async () => {
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "shift-1",
            initialFloatMinorUnits: 500_000,
            openedByStaffId: "staff-1",
            status: "open",
          },
        ]),
      }),
    }));
    const row = await openShift(500_000);
    expect(row.status).toBe("open");
    expect(row.openedByStaffId).toBe("staff-1");
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: "insert", rowId: "shift-1" })
    );
  });

  test("rejects a negative float", async () => {
    await expect(openShift(-1)).rejects.toThrow("float");
  });
});

describe("getOpenShift", () => {
  afterEach(() => vi.clearAllMocks());

  test("returns the open row or null when none", async () => {
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "shift-1", status: "open" }]),
        }),
      }),
    }));
    expect((await getOpenShift())?.id).toBe("shift-1");

    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }));
    expect(await getOpenShift()).toBeNull();
  });
});

describe("closeShift", () => {
  afterEach(() => vi.clearAllMocks());

  test("persists expected, actual, signed difference, closer, closed status", async () => {
    // first select: the shift row; second: the window orders
    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "shift-1",
                initialFloatMinorUnits: 500_000,
                openedAt: OPENED,
                outletId: "outlet-1",
                status: "open",
              },
            ]),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            order({ totalMinorUnits: 2_100_000 }),
            order({
              paymentMethod: "qris_dynamic",
              totalMinorUnits: 850_000,
            }),
          ]),
        }),
      }));
    let capturedPatch: Record<string, number | string | null> = {};
    mockUpdate.mockImplementation(() => ({
      set: vi.fn((p: Record<string, unknown>) => {
        capturedPatch = p as Record<string, number | string | null>;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: "shift-1", status: "closed" }]),
          }),
        };
      }),
    }));

    const row = await closeShift({
      actualCashMinorUnits: 2_595_000,
      shiftId: "shift-1",
    });
    expect(row.status).toBe("closed");

    const patch = capturedPatch;
    expect(patch.expectedCashMinorUnits).toBe(2_600_000);
    expect(patch.differenceMinorUnits).toBe(-5000);
    expect(patch.actualCashMinorUnits).toBe(2_595_000);
    expect(patch.closedByStaffId).toBe("staff-1");
    expect(patch.status).toBe("closed");
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: "update", rowId: "shift-1" })
    );
  });

  test("rejects closing an unknown shift", async () => {
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }));
    await expect(
      closeShift({ actualCashMinorUnits: 0, shiftId: "nope" })
    ).rejects.toThrow("not found");
  });
});
