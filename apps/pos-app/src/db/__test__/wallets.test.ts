import {
  wallets,
  walletTransactions,
} from "@sync-contract/local-synced-schema";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DbTx } from "../wallets";

/* Chainable tx mock: select().from().where() (awaitable), insert()
   .values().returning(). */
const insertCalls: Array<{ table: unknown; values: Record<string, unknown> }> =
  [];

/** Wallet ids the tx select reports as already existing. */
let existingWalletIds: string[] = [];

/** Wallet row the tx select returns for balance reads (wallets table). */
let walletRow: Record<string, unknown> | undefined;

const updateCalls: Array<{ set: Record<string, unknown>; table: unknown }> = [];

/**
 * wallets + projected fields → seed id list (ensure); wallets + no projection →
 * queued wallet rows in call order (balance reads); wallet_transactions → empty.
 */
const resolveTxSelect = (
  table: unknown,
  projected: boolean
): Record<string, unknown>[] => {
  if (table !== wallets) {
    return [];
  }
  if (projected) {
    return existingWalletIds.map((id) => ({ id }));
  }
  if (walletQueue.length > 0) {
    return [walletQueue.shift()!];
  }
  return walletRow ? [walletRow] : [];
};

/** Wallet rows served in lookup order for multi-wallet operations. */
let walletQueue: Record<string, unknown>[] = [];

const tx = {
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      insertCalls.push({ table, values });
      const inserted = Promise.resolve([{ ...values }]);
      return Object.assign(inserted, {
        returning: () => Promise.resolve([{ ...values }]),
      });
    },
  }),
  select: (fields?: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: () => {
        const rows = resolveTxSelect(table, Boolean(fields));
        return Object.assign(Promise.resolve(rows), { limit: () => rows });
      },
    }),
  }),
  update: (table: unknown) => ({
    set: (set: Record<string, unknown>) => ({
      where: () => {
        updateCalls.push({ set, table });
        return Promise.resolve([]);
      },
    }),
  }),
} as unknown as DbTx;

/** Rows the (non-tx) db select returns — shaped per call by the tests. */
let dbSelectRows: Record<string, unknown>[] = [];
let lastDbSelect: {
  limit: number | undefined;
  fields: Record<string, unknown>;
} | null = null;

vi.mock("~/db", () => ({
  TABLE: { wallets, walletTransactions },
  db: {
    select: (fields: Record<string, unknown>) => {
      lastDbSelect = { fields, limit: undefined };
      const resolveRows = (limit: number) => {
        if (lastDbSelect) {
          lastDbSelect.limit = limit;
        }
        return Promise.resolve(dbSelectRows.slice(0, limit));
      };
      return {
        from: () => {
          const whereChain = () => ({
            orderBy: () =>
              Object.assign(Promise.resolve(dbSelectRows), {
                limit: resolveRows,
              }),
          });
          return {
            where: whereChain,
            innerJoin: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: resolveRows,
                }),
              }),
            }),
          };
        },
      };
    },
    transaction: async (fn: (t: unknown) => unknown) => await fn(tx),
  },
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
  currentUser: () => ({ id: "staff-1" }),
}));

vi.mock("~/lib/utils", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const {
  getWalletLedger,
  getWalletsWithBalance,
  LEDGER_PAGE_SIZE,
  applyWalletMovement,
  applyWalletReconciliation,
  applyWalletTransfer,
  ledgerDirection,
} = await import("../wallets");

const CASH_ID = "w-cash";
const QRIS_ID = "w-qris";

/** A funded Laci Kas row for movement/reconciliation tests. */
const cashWalletRow = (
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  id: CASH_ID,
  outletId: "outlet-1",
  name: "Laci Kas",
  type: "cash",
  accountNumber: null,
  isDefault: true,
  currentBalanceMinorUnits: 500_000,
  deletedAt: null,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
  ...overrides,
});

const ledgerRow = (
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  id: `txn-${++ledgerSeq}`,
  walletId: CASH_ID,
  walletName: "Laci Kas",
  walletType: "cash",
  type: "cash_in",
  amountMinorUnits: 50_000,
  category: null,
  notes: null,
  referenceId: null,
  createdByStaffId: "staff-1",
  createdAt: "2026-10-05T03:00:00.000Z",
  ...overrides,
});

let ledgerSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  updateCalls.length = 0;
  existingWalletIds = [];
  walletRow = undefined;
  walletQueue = [];
  dbSelectRows = [];
  lastDbSelect = null;
  ledgerSeq = 0;
});

describe("getWalletLedger", () => {
  test("maps joined rows into ledger entries", async () => {
    dbSelectRows = [
      ledgerRow({ id: "txn-1", type: "sale", amountMinorUnits: 35_000 }),
      ledgerRow({
        id: "txn-2",
        walletId: QRIS_ID,
        walletName: "QRIS",
        walletType: "qris",
        type: "reconciliation",
        amountMinorUnits: -5000,
      }),
    ];

    const page = await getWalletLedger();

    expect(page.entries).toHaveLength(2);
    expect(page.entries[0]).toMatchObject({
      id: "txn-1",
      walletName: "Laci Kas",
      walletType: "cash",
      type: "sale",
      amountMinorUnits: 35_000,
    });
    expect(page.entries[1]).toMatchObject({
      walletName: "QRIS",
      type: "reconciliation",
      amountMinorUnits: -5000,
    });
    expect(page.nextCursor).toBeNull();
  });

  test("returns a nextCursor when the page is full (more rows exist)", async () => {
    dbSelectRows = Array.from({ length: LEDGER_PAGE_SIZE + 1 }, (_, index) =>
      ledgerRow({ id: `txn-${index}` })
    );

    const page = await getWalletLedger();

    expect(page.entries).toHaveLength(LEDGER_PAGE_SIZE);
    expect(page.nextCursor).toEqual({
      createdAt: "2026-10-05T03:00:00.000Z",
      id: "txn-49",
    });
  });

  test("queries one extra row beyond the limit to detect the next page", async () => {
    dbSelectRows = Array.from({ length: LEDGER_PAGE_SIZE }, (_, index) =>
      ledgerRow({ id: `txn-${index}` })
    );

    const page = await getWalletLedger({ limit: 10 });

    expect(lastDbSelect?.limit).toBe(11);
    expect(page.entries).toHaveLength(10);
    expect(page.nextCursor).toEqual({
      createdAt: "2026-10-05T03:00:00.000Z",
      id: "txn-9",
    });
  });

  test("passes a custom limit and wallet filter through", async () => {
    dbSelectRows = [];

    await getWalletLedger({ walletId: QRIS_ID, limit: 5 });

    expect(lastDbSelect?.limit).toBe(6);
  });
});

describe("getWalletsWithBalance", () => {
  test("returns wallets ordered defaults-first", async () => {
    dbSelectRows = [
      {
        id: "w-bank",
        outletId: "outlet-1",
        name: "Bank BCA",
        type: "bank",
        isDefault: false,
        currentBalanceMinorUnits: 1_000_000,
        deletedAt: null,
        createdAt: "2026-10-05T01:00:00.000Z",
      },
      {
        id: CASH_ID,
        outletId: "outlet-1",
        name: "Laci Kas",
        type: "cash",
        isDefault: true,
        currentBalanceMinorUnits: 450_000,
        deletedAt: null,
        createdAt: "2026-10-05T00:00:00.000Z",
      },
    ];

    const walletsList = await getWalletsWithBalance();

    expect(walletsList.map((row) => row.name)).toEqual([
      "Laci Kas",
      "Bank BCA",
    ]);
  });
});

describe("ledgerDirection", () => {
  test("fixed directions by type, reconciliation reads its stored sign", () => {
    expect(ledgerDirection("sale")).toBe("in");
    expect(ledgerDirection("cash_in")).toBe("in");
    expect(ledgerDirection("transfer_in")).toBe("in");
    expect(ledgerDirection("cash_out")).toBe("out");
    expect(ledgerDirection("transfer_out")).toBe("out");
  });
});

describe("applyWalletMovement", () => {
  test("cash_in increments the balance and writes an absolute ledger row", async () => {
    walletRow = cashWalletRow();

    await applyWalletMovement(tx as unknown as DbTx, {
      type: "cash_in",
      walletId: CASH_ID,
      amountMinorUnits: 150_000,
      category: "modal",
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({
      walletId: CASH_ID,
      type: "cash_in",
      amountMinorUnits: 150_000,
      category: "modal",
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set.currentBalanceMinorUnits).toBe(650_000);
    expect(enqueueChange).toHaveBeenCalledTimes(2);
  });

  test("cash_out decrements the balance", async () => {
    walletRow = cashWalletRow();

    await applyWalletMovement(tx as unknown as DbTx, {
      type: "cash_out",
      walletId: CASH_ID,
      amountMinorUnits: 80_000,
      category: "operasional",
      notes: "Beli gas",
    });

    expect(updateCalls[0].set.currentBalanceMinorUnits).toBe(420_000);
    expect(insertCalls[0].values).toMatchObject({
      type: "cash_out",
      amountMinorUnits: 80_000,
      notes: "Beli gas",
    });
  });

  test("rejects zero or negative amounts", async () => {
    walletRow = cashWalletRow();

    await expect(
      applyWalletMovement(tx as unknown as DbTx, {
        type: "cash_out",
        walletId: CASH_ID,
        amountMinorUnits: 0,
      })
    ).rejects.toThrow("positive integer");
    await expect(
      applyWalletMovement(tx as unknown as DbTx, {
        type: "cash_out",
        walletId: CASH_ID,
        amountMinorUnits: -5,
      })
    ).rejects.toThrow("positive integer");
    expect(insertCalls).toHaveLength(0);
  });

  test("rejects unknown or deactivated wallets", async () => {
    walletRow = cashWalletRow({ deletedAt: "2026-10-05T01:00:00.000Z" });

    await expect(
      applyWalletMovement(tx as unknown as DbTx, {
        type: "cash_out",
        walletId: CASH_ID,
        amountMinorUnits: 1000,
      })
    ).rejects.toThrow("not found or inactive");
    expect(insertCalls).toHaveLength(0);
  });

  test("rejects categories outside the type's vocabulary", async () => {
    walletRow = cashWalletRow();

    await expect(
      applyWalletMovement(tx as unknown as DbTx, {
        type: "cash_out",
        walletId: CASH_ID,
        amountMinorUnits: 1000,
        category: "modal",
      })
    ).rejects.toThrow("invalid cash_out category");
  });
});

describe("applyWalletReconciliation", () => {
  test("short count sets the balance down and records a negative variance", async () => {
    walletRow = cashWalletRow({ currentBalanceMinorUnits: 500_000 });

    await applyWalletReconciliation(tx as unknown as DbTx, {
      walletId: CASH_ID,
      countedMinorUnits: 495_000,
      referenceId: "shift-1",
    });

    expect(updateCalls[0].set.currentBalanceMinorUnits).toBe(495_000);
    expect(insertCalls[0].values).toMatchObject({
      type: "reconciliation",
      amountMinorUnits: -5000,
      referenceId: "shift-1",
    });
  });

  test("over count records a positive variance", async () => {
    walletRow = cashWalletRow({ currentBalanceMinorUnits: 500_000 });

    await applyWalletReconciliation(tx as unknown as DbTx, {
      walletId: CASH_ID,
      countedMinorUnits: 510_000,
    });

    expect(updateCalls[0].set.currentBalanceMinorUnits).toBe(510_000);
    expect(insertCalls[0].values.amountMinorUnits).toBe(10_000);
  });

  test("exact count records a zero row without touching the balance", async () => {
    walletRow = cashWalletRow({ currentBalanceMinorUnits: 500_000 });

    await applyWalletReconciliation(tx as unknown as DbTx, {
      walletId: CASH_ID,
      countedMinorUnits: 500_000,
    });

    expect(updateCalls).toHaveLength(0);
    expect(insertCalls[0].values.amountMinorUnits).toBe(0);
    expect(enqueueChange).toHaveBeenCalledTimes(1);
  });

  test("rejects negative counts", async () => {
    walletRow = cashWalletRow();

    await expect(
      applyWalletReconciliation(tx as unknown as DbTx, {
        walletId: CASH_ID,
        countedMinorUnits: -1,
      })
    ).rejects.toThrow("non-negative integer");
    expect(insertCalls).toHaveLength(0);
  });
});

describe("applyWalletTransfer", () => {
  const bankRow = () =>
    cashWalletRow({
      id: "w-bank",
      name: "Bank BCA",
      type: "bank",
      isDefault: false,
      currentBalanceMinorUnits: 1_000_000,
    });

  test("writes a linked pair and applies both balance deltas atomically", async () => {
    walletQueue = [cashWalletRow(), bankRow()];

    const result = await applyWalletTransfer(tx as unknown as DbTx, {
      fromWalletId: CASH_ID,
      toWalletId: "w-bank",
      amountMinorUnits: 400_000,
      notes: "Setoran",
    });

    expect(insertCalls).toHaveLength(2);
    const [out, into] = insertCalls.map((call) => call.values);
    expect(out).toMatchObject({
      walletId: CASH_ID,
      type: "transfer_out",
      amountMinorUnits: 400_000,
    });
    expect(into).toMatchObject({
      walletId: "w-bank",
      type: "transfer_in",
      amountMinorUnits: 400_000,
    });
    expect(out.referenceId).toBe(into.referenceId);
    expect(out.referenceId).toBe(result.referenceId);

    expect(updateCalls).toHaveLength(2);
    const balances = updateCalls.map(
      (call) => call.set.currentBalanceMinorUnits
    );
    expect(balances).toEqual([100_000, 1_400_000]);
    expect(enqueueChange).toHaveBeenCalledTimes(4);
    expect(result.fromBalanceMinorUnits).toBe(100_000);
    expect(result.toBalanceMinorUnits).toBe(1_400_000);
  });

  test("rejects same-wallet transfers", async () => {
    walletQueue = [cashWalletRow()];

    await expect(
      applyWalletTransfer(tx as unknown as DbTx, {
        fromWalletId: CASH_ID,
        toWalletId: CASH_ID,
        amountMinorUnits: 1000,
      })
    ).rejects.toThrow("must differ");
    expect(insertCalls).toHaveLength(0);
  });

  test("rejects overdrawing the source wallet", async () => {
    walletQueue = [cashWalletRow(), bankRow()];

    await expect(
      applyWalletTransfer(tx as unknown as DbTx, {
        fromWalletId: CASH_ID,
        toWalletId: "w-bank",
        amountMinorUnits: 600_000,
      })
    ).rejects.toThrow("insufficient balance");
    expect(insertCalls).toHaveLength(0);
  });

  test("rejects non-positive amounts", async () => {
    walletQueue = [cashWalletRow(), bankRow()];

    await expect(
      applyWalletTransfer(tx as unknown as DbTx, {
        fromWalletId: CASH_ID,
        toWalletId: "w-bank",
        amountMinorUnits: 0,
      })
    ).rejects.toThrow("positive integer");
    expect(insertCalls).toHaveLength(0);
  });
});
