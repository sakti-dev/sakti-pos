import {
  cashShifts,
  wallets,
  walletTransactions,
} from "@sync-contract/local-synced-schema";
import dayjs from "dayjs";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

const tx = { insert: mockInsert, select: mockSelect, update: mockUpdate };

vi.mock("~/db", () => ({
  TABLE: { cashShifts, walletTransactions, wallets },
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

const applyWalletReconciliation = vi.fn(async () => ({ id: "recon-1" }));
const applyWalletTransfer = vi.fn(async () => ({ referenceId: "xfer-1" }));
vi.mock("../wallets", () => ({
  applyWalletReconciliation,
  applyWalletTransfer,
  getWalletStrip: async () => [],
}));

vi.mock("~/lib/auth/session", () => ({
  currentOutletId: () => "outlet-1",
  currentUser: () => ({ id: "staff-1", name: "Andi", role: "cashier" }),
}));

vi.mock("~/lib/utils", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const {
  closeShift,
  computeDifferenceMinorUnits,
  getDrawerSnapshot,
  getOpenShift,
  getShiftWindowTotals,
  openShift,
  sumWindowSalesByWallet,
} = await import("../cash-shifts");

/* Row queues per table — tests fill them before each case. */
let shiftRows: Record<string, unknown>[] = [];
let walletRefRows: Record<string, unknown>[] = [];
let walletFullRows: Record<string, unknown>[] = [];
let saleRows: Record<string, unknown>[] = [];

mockSelect.mockImplementation((fields?: unknown) => ({
  from: (table: unknown) => ({
    where: () => {
      let rows: Record<string, unknown>[];
      if (table === cashShifts) {
        rows = shiftRows;
      } else if (table === wallets) {
        rows = fields ? walletRefRows : walletFullRows;
      } else if (table === walletTransactions) {
        rows = saleRows;
      } else {
        rows = [];
      }
      return Object.assign(Promise.resolve(rows), {
        limit: () => rows,
        orderBy: () => Promise.resolve(rows),
      });
    },
  }),
}));

const cashWalletRef = {
  currentBalanceMinorUnits: 2_600_000,
  id: "w-cash",
  isDefault: true,
  type: "cash",
};

const reset = () => {
  shiftRows = [];
  walletRefRows = [];
  walletFullRows = [];
  saleRows = [];
};

const openShiftRow = () => ({
  id: "shift-1",
  initialFloatMinorUnits: 500_000,
  openedAt: dayjs().subtract(9, "hour").toISOString(),
  openedByStaffId: "staff-1",
  outletId: "outlet-1",
  status: "open",
});

describe("sumWindowSalesByWallet", () => {
  test("splits sale ledger rows by wallet; non-sale rows never counted", () => {
    const { cashMinorUnits, qrisMinorUnits } = sumWindowSalesByWallet(
      [
        { amountMinorUnits: 2_100_000, walletId: "w-cash" },
        { amountMinorUnits: 35_000, walletId: "w-cash" },
        { amountMinorUnits: 850_000, walletId: "w-qris" },
        { amountMinorUnits: 80_000, walletId: "w-bank" },
      ],
      "w-cash",
      "w-qris"
    );
    expect(cashMinorUnits).toBe(2_135_000);
    expect(qrisMinorUnits).toBe(850_000);
  });

  test("missing wallets contribute zero", () => {
    const { cashMinorUnits, qrisMinorUnits } = sumWindowSalesByWallet(
      [{ amountMinorUnits: 50_000, walletId: "w-cash" }],
      undefined,
      undefined
    );
    expect(cashMinorUnits).toBe(0);
    expect(qrisMinorUnits).toBe(0);
  });
});

describe("computeDifferenceMinorUnits", () => {
  test("signed: short negative, over positive", () => {
    expect(computeDifferenceMinorUnits(1_250_000, 1_255_000)).toBe(-5000);
    expect(computeDifferenceMinorUnits(1_260_000, 1_255_000)).toBe(5000);
  });
});

describe("getDrawerSnapshot", () => {
  afterEach(() => {
    vi.clearAllMocks();
    reset();
  });

  test("expected-in-drawer is the Laci Kas wallet balance", async () => {
    shiftRows = [openShiftRow()];
    walletRefRows = [cashWalletRef];

    const snapshot = await getDrawerSnapshot();

    expect(snapshot.shift?.id).toBe("shift-1");
    expect(snapshot.expectedInDrawerMinorUnits).toBe(2_600_000);
  });

  test("no open shift → zero and null", async () => {
    const snapshot = await getDrawerSnapshot();
    expect(snapshot.shift).toBeNull();
    expect(snapshot.expectedInDrawerMinorUnits).toBe(0);
  });
});

describe("getShiftWindowTotals", () => {
  afterEach(() => {
    vi.clearAllMocks();
    reset();
  });

  test("cash/QRIS from sale ledger; expected from wallet balance", async () => {
    walletRefRows = [
      cashWalletRef,
      {
        currentBalanceMinorUnits: 850_000,
        id: "w-qris",
        isDefault: true,
        type: "qris",
      },
    ];
    saleRows = [
      { amountMinorUnits: 2_100_000, walletId: "w-cash" },
      { amountMinorUnits: 850_000, walletId: "w-qris" },
    ];

    const totals = await getShiftWindowTotals({
      initialFloatMinorUnits: 500_000,
      openedAt: dayjs().subtract(9, "hour").toISOString(),
      outletId: "outlet-1",
    });

    expect(totals.cashMinorUnits).toBe(2_100_000);
    expect(totals.qrisMinorUnits).toBe(850_000);
    expect(totals.expectedInDrawerMinorUnits).toBe(2_600_000);
  });
});

describe("openShift", () => {
  afterEach(() => {
    vi.clearAllMocks();
    reset();
  });

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

  test("reconciles the wallet up to the declared float (fresh drawer)", async () => {
    walletFullRows = [
      {
        currentBalanceMinorUnits: 0,
        deletedAt: null,
        id: "w-cash",
        outletId: "outlet-1",
        type: "cash",
      },
    ];

    await openShift(200_000);

    expect(applyWalletReconciliation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        countedMinorUnits: 200_000,
        notes: "Modal awal shift",
        walletId: "w-cash",
      })
    );
  });

  test("skips reconciliation when the float matches the recorded balance", async () => {
    walletFullRows = [
      {
        currentBalanceMinorUnits: 215_000,
        deletedAt: null,
        id: "w-cash",
        outletId: "outlet-1",
        type: "cash",
      },
    ];

    await openShift(215_000);

    expect(applyWalletReconciliation).not.toHaveBeenCalled();
  });

  test("rejects a negative float", async () => {
    await expect(openShift(-1)).rejects.toThrow("float");
  });
});

describe("getOpenShift", () => {
  afterEach(() => {
    vi.clearAllMocks();
    reset();
  });

  test("returns the open row or null when none", async () => {
    shiftRows = [{ id: "shift-1", status: "open" }];
    expect((await getOpenShift())?.id).toBe("shift-1");

    shiftRows = [];
    expect(await getOpenShift()).toBeNull();
  });
});

describe("closeShift", () => {
  afterEach(() => {
    vi.clearAllMocks();
    reset();
  });

  test("expected = wallet balance; reconciliation applies the variance", async () => {
    shiftRows = [openShiftRow()];
    walletFullRows = [
      {
        currentBalanceMinorUnits: 2_600_000,
        deletedAt: null,
        id: "w-cash",
        outletId: "outlet-1",
        type: "cash",
      },
    ];
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

    expect(capturedPatch.expectedCashMinorUnits).toBe(2_600_000);
    expect(capturedPatch.differenceMinorUnits).toBe(-5000);
    expect(capturedPatch.actualCashMinorUnits).toBe(2_595_000);
    expect(capturedPatch.closedByStaffId).toBe("staff-1");
    expect(capturedPatch.status).toBe("closed");
    expect(enqueueChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: "update", rowId: "shift-1" })
    );
    expect(applyWalletReconciliation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        countedMinorUnits: 2_595_000,
        referenceId: "shift-1",
        walletId: "w-cash",
      })
    );
    expect(applyWalletTransfer).not.toHaveBeenCalled();
  });

  test("setoran writes the transfer pair out of the drawer", async () => {
    shiftRows = [openShiftRow()];
    walletFullRows = [
      {
        currentBalanceMinorUnits: 495_000,
        deletedAt: null,
        id: "w-cash",
        outletId: "outlet-1",
        type: "cash",
      },
    ];
    mockUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "shift-1", status: "closed" }]),
        }),
      }),
    }));

    await closeShift({
      actualCashMinorUnits: 495_000,
      setoran: { amountMinorUnits: 445_000, toWalletId: "w-bank" },
      shiftId: "shift-1",
    });

    expect(applyWalletTransfer).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amountMinorUnits: 445_000,
        fromWalletId: "w-cash",
        toWalletId: "w-bank",
      })
    );
  });

  test("setoran cannot exceed the counted cash", async () => {
    await expect(
      closeShift({
        actualCashMinorUnits: 100_000,
        setoran: { amountMinorUnits: 200_000, toWalletId: "w-bank" },
        shiftId: "shift-1",
      })
    ).rejects.toThrow("cannot exceed");
    expect(applyWalletTransfer).not.toHaveBeenCalled();
  });

  test("rejects closing an unknown shift", async () => {
    shiftRows = [];
    await expect(
      closeShift({ actualCashMinorUnits: 0, shiftId: "nope" })
    ).rejects.toThrow("not found");
  });
});
