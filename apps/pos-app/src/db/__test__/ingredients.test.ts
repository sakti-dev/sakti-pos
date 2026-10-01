import {
  ingredients,
  inventoryStocks,
} from "@sync-contract/local-synced-schema";
import { beforeEach, describe, expect, test, vi } from "vitest";

let idSeq = 0;
const nextId = () => `row-${++idSeq}`;

const insertCalls: Array<{ table: unknown; values: Record<string, unknown> }> =
  [];
const updateCalls: Array<{ set: Record<string, unknown>; table: unknown }> = [];

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
    ingredients,
    inventoryStocks,
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

const { createIngredient, softDeleteIngredient, updateIngredient } =
  await import("../ingredients");

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  updateCalls.length = 0;
  balanceRow = undefined;
  idSeq = 0;
});

describe("createIngredient", () => {
  test("persists the ingredient and seeds a zero balance in one transaction", async () => {
    await createIngredient({
      category: "Bahan",
      name: "  Biji Kopi  ",
      sku: "RAW-001",
      unit: "kg",
    });

    const ingredientInsert = insertCalls.find((c) => c.table === ingredients);
    expect(ingredientInsert?.values).toMatchObject({
      merchantId: "merchant-1",
      name: "Biji Kopi",
      sku: "RAW-001",
      unit: "kg",
    });

    const balanceInsert = insertCalls.find((c) => c.table === inventoryStocks);
    expect(balanceInsert?.values).toMatchObject({
      outletId: "outlet-1",
      targetId: "row-1",
      targetType: "ingredient",
      onHandQty: 0,
    });

    /* ingredient + seeded balance */
    expect(enqueueChange).toHaveBeenCalledTimes(2);
  });

  test("rejects empty name", async () => {
    await expect(
      createIngredient({ category: null, name: "   ", sku: null, unit: "kg" })
    ).rejects.toThrow("name");
  });
});

describe("updateIngredient", () => {
  test("updates fields and enqueues", async () => {
    await updateIngredient("i1", {
      category: null,
      name: "Gula",
      sku: "RAW-002",
      unit: "kg",
    });
    const update = updateCalls.find((c) => c.table === ingredients);
    expect(update?.set).toMatchObject({ name: "Gula", unit: "kg" });
    expect(enqueueChange).toHaveBeenCalled();
  });
});

describe("softDeleteIngredient", () => {
  test("deactivates and soft-deletes", async () => {
    await softDeleteIngredient("i1");
    const update = updateCalls.find((c) => c.table === ingredients);
    expect(update?.set).toMatchObject({ isActive: false });
    expect(update?.set.deletedAt).toBeTruthy();
  });
});
