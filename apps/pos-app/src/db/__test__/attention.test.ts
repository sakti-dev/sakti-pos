import { inventoryStocks, orders } from "@sync-contract/local-synced-schema";
import { describe, expect, test, vi } from "vitest";

const mockSelect = vi.fn();

vi.mock("~/db", () => ({
  TABLE: {
    inventoryStocks,
    orders,
  },
  db: { select: mockSelect },
}));

vi.mock("~/lib/auth/session", () => ({
  currentOutletId: () => "outlet-1",
}));

const { getLowStockCount, getUnsyncedOrderCount } = await import(
  "../attention"
);

/* select() returns a thenable chain so the repo's await works. */
function selectReturns(rows: unknown[]): void {
  mockSelect.mockReturnValue({
    from: () => ({ where: async () => rows }),
  });
}

describe("isLowStock (via getLowStockCount filter)", () => {
  const stock = (overrides: Partial<Record<string, unknown>> = {}) => ({
    deletedAt: null,
    lowStockThreshold: 5,
    onHandQty: 3,
    ...overrides,
  });

  test("counts rows at or below their threshold", async () => {
    selectReturns([stock(), stock({ onHandQty: 5 }), stock({ onHandQty: 6 })]);
    await expect(getLowStockCount()).resolves.toBe(2);
  });

  test("default threshold 0 — empty balance counts as low", async () => {
    selectReturns([stock({ lowStockThreshold: 0, onHandQty: 0 })]);
    await expect(getLowStockCount()).resolves.toBe(1);
  });

  test("soft-deleted rows never count", async () => {
    selectReturns([
      stock(),
      stock({ deletedAt: "2026-09-30T06:00:00.000Z", onHandQty: 0 }),
    ]);
    await expect(getLowStockCount()).resolves.toBe(1);
  });

  test("zero is a fine answer", async () => {
    selectReturns([stock({ onHandQty: 100 })]);
    await expect(getLowStockCount()).resolves.toBe(0);
  });
});

describe("isUnsyncedOrder (via getUnsyncedOrderCount filter)", () => {
  const order = (overrides: Partial<Record<string, unknown>> = {}) => ({
    deletedAt: null,
    isSynced: false,
    ...overrides,
  });

  test("counts pending uploads only", async () => {
    selectReturns([
      order(),
      order({ isSynced: true }),
      order({ deletedAt: "2026-09-30T06:00:00.000Z" }),
    ]);
    await expect(getUnsyncedOrderCount()).resolves.toBe(1);
  });

  test("everything acknowledged → 0", async () => {
    selectReturns([order({ isSynced: true })]);
    await expect(getUnsyncedOrderCount()).resolves.toBe(0);
  });
});
