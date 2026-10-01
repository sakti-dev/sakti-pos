import {
  inventoryStocks,
  stockAdjustments,
} from "@sync-contract/local-synced-schema";
import { beforeEach, describe, expect, test, vi } from "vitest";

/* Chainable tx mock: select().from().where() (awaitable), insert()
   .values().returning(), update().set().where(). */
let idSeq = 0;
const nextId = () => `row-${++idSeq}`;

const insertCalls: Array<{ table: unknown; values: Record<string, unknown> }> =
  [];
const updateCalls: Array<{ set: Record<string, unknown>; table: unknown }> = [];

/** What findBalance returns for the current target row. */
let balanceRow: Record<string, unknown> | undefined;

const tx = {
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => ({
      returning: () => {
        insertCalls.push({ table, values });
        return Promise.resolve([{ id: nextId() }]);
      },
    }),
  }),
  select: () => ({
    from: () => ({
      where: () => Promise.resolve(balanceRow ? [balanceRow] : []),
    }),
  }),
  update: (table: unknown) => ({
    set: (set: Record<string, unknown>) => ({
      where: () => {
        updateCalls.push({ set, table });
        return Promise.resolve([{ id: nextId() }]);
      },
    }),
  }),
};

vi.mock("~/db", () => ({
  TABLE: {
    inventoryStocks,
    stockAdjustments,
  },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => [],
        }),
      }),
    }),
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
  currentMerchantId: () => "merchant-1",
  currentOutletId: () => "outlet-1",
  currentUser: () => ({ id: "staff-1" }),
}));

vi.mock("~/lib/utils", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const {
  applyStockDelta,
  createStockAdjustment,
  decrementStockForSale,
  ensureTracked,
  setLowStockThreshold,
  setStockCount,
  stopTracking,
} = await import("../inventory");

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  updateCalls.length = 0;
  balanceRow = undefined;
  idSeq = 0;
});

describe("applyStockDelta", () => {
  test("first event creates the balance row from zero (tracking starts)", async () => {
    await applyStockDelta(tx, "product", "p1", 10);

    const insert = insertCalls.find((c) => c.table === inventoryStocks);
    expect(insert?.values).toMatchObject({
      outletId: "outlet-1",
      targetId: "p1",
      targetType: "product",
      onHandQty: 10,
    });
    expect(enqueueChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ operation: "insert", table: inventoryStocks })
    );
  });

  test("live row updates incrementally", async () => {
    balanceRow = { id: "bal-1", onHandQty: 10, deletedAt: null };
    await applyStockDelta(tx, "product", "p1", -3);

    const update = updateCalls.find((c) => c.table === inventoryStocks);
    expect(update?.set.onHandQty).toBe(7);
    expect(update?.set.isSynced).toBe(false);
    expect(enqueueChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        operation: "update",
        rowId: "bal-1",
        table: inventoryStocks,
      })
    );
  });

  test("soft-deleted row resurrects from zero instead of duplicating", async () => {
    balanceRow = { id: "bal-1", onHandQty: 99, deletedAt: "2026-01-01" };
    await applyStockDelta(tx, "ingredient", "i1", 4);

    expect(insertCalls).toHaveLength(0);
    const update = updateCalls.find((c) => c.table === inventoryStocks);
    expect(update?.set).toMatchObject({ onHandQty: 4, deletedAt: null });
  });
});

describe("setStockCount (opname)", () => {
  test("sets absolute count on a live row", async () => {
    balanceRow = { id: "bal-1", onHandQty: 10, deletedAt: null };
    await setStockCount(tx, "product", "p1", 8);

    const update = updateCalls.find((c) => c.table === inventoryStocks);
    expect(update?.set.onHandQty).toBe(8);
  });

  test("opname starts tracking when no row exists", async () => {
    await setStockCount(tx, "product", "p1", 6);
    const insert = insertCalls.find((c) => c.table === inventoryStocks);
    expect(insert?.values.onHandQty).toBe(6);
  });
});

describe("ensureTracked (Mulai Lacak Stok)", () => {
  test("no-op when already tracked", async () => {
    balanceRow = { id: "bal-1", onHandQty: 5, deletedAt: null };
    await ensureTracked(tx, "product", "p1");
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  test("creates a zero row when untracked", async () => {
    await ensureTracked(tx, "product", "p1");
    const insert = insertCalls.find((c) => c.table === inventoryStocks);
    expect(insert?.values.onHandQty).toBe(0);
  });
});

describe("decrementStockForSale (checkout)", () => {
  test("decrements a tracked product", async () => {
    balanceRow = { id: "bal-1", onHandQty: 8, deletedAt: null };
    await decrementStockForSale(tx, "p1", 2);
    const update = updateCalls.find((c) => c.table === inventoryStocks);
    expect(update?.set.onHandQty).toBe(6);
  });

  test("silent no-op when untracked — never blocks a sale", async () => {
    await decrementStockForSale(tx, "p1", 2);
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    expect(enqueueChange).not.toHaveBeenCalled();
  });

  test("no-op on a soft-deleted (untracked) row", async () => {
    balanceRow = { id: "bal-1", onHandQty: 8, deletedAt: "2026-01-01" };
    await decrementStockForSale(tx, "p1", 2);
    expect(updateCalls).toHaveLength(0);
  });
});

describe("stopTracking", () => {
  test("soft-deletes the balance row (deletes must sync)", async () => {
    balanceRow = { id: "bal-1", onHandQty: 8, deletedAt: null };
    await stopTracking("product", "p1");

    const update = updateCalls.find((c) => c.table === inventoryStocks);
    expect(update?.set.deletedAt).toBeTruthy();
    expect(update?.set.isSynced).toBe(false);
    expect(enqueueChange).toHaveBeenCalled();
  });
});

describe("setLowStockThreshold", () => {
  test("throws for untracked items", async () => {
    await expect(setLowStockThreshold("product", "p1", 5)).rejects.toThrow(
      "not tracked"
    );
  });
});

describe("createStockAdjustment", () => {
  test("inserts the event and applies the delta in one transaction", async () => {
    balanceRow = { id: "bal-1", onHandQty: 8, deletedAt: null };
    await createStockAdjustment({
      qtyDelta: -2,
      reason: "rusak",
      targetId: "p1",
      targetType: "product",
    });

    const eventInsert = insertCalls.find((c) => c.table === stockAdjustments);
    expect(eventInsert?.values).toMatchObject({
      outletId: "outlet-1",
      staffId: "staff-1",
      qtyDelta: -2,
      reason: "rusak",
    });
    const balanceUpdate = updateCalls.find((c) => c.table === inventoryStocks);
    expect(balanceUpdate?.set.onHandQty).toBe(6);
    /* adjustment event + balance row */
    expect(enqueueChange).toHaveBeenCalledTimes(2);
  });

  test("rejects zero delta", async () => {
    await expect(
      createStockAdjustment({
        qtyDelta: 0,
        reason: "rusak",
        targetId: "p1",
        targetType: "product",
      })
    ).rejects.toThrow("non-zero");
  });
});
