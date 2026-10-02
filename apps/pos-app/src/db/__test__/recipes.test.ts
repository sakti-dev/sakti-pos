import {
  ingredients,
  productIngredients,
} from "@sync-contract/local-synced-schema";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DbTx } from "../recipes";

/* Chainable tx mock: select().from().where(), insert().values()
   .returning(), update().set().where(). */
let idSeq = 0;
const nextId = () => `row-${++idSeq}`;

const insertCalls: Array<{ table: unknown; values: Record<string, unknown> }> =
  [];
const updateCalls: Array<{ set: Record<string, unknown>; table: unknown }> = [];

/** Rows returned by the diff's initial select. */
let existingRows: Record<string, unknown>[] = [];

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
      where: () => Promise.resolve(existingRows),
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
} as unknown as DbTx;

vi.mock("~/db", () => ({
  TABLE: {
    productIngredients,
    ingredients,
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
}));

vi.mock("~/lib/utils", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { setProductIngredients } = await import("../recipes");

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  updateCalls.length = 0;
  existingRows = [];
  idSeq = 0;
});

describe("setProductIngredients", () => {
  test("inserts new links with qty and enqueues each", async () => {
    await setProductIngredients("p1", [
      { ingredientId: "i1", qtyPerUnit: 0.25 },
      { ingredientId: "i2", qtyPerUnit: 1 },
    ]);

    const inserts = insertCalls.filter((c) => c.table === productIngredients);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.values).toMatchObject({
      merchantId: "merchant-1",
      productId: "p1",
      ingredientId: "i1",
      qtyPerUnit: 0.25,
    });
    expect(enqueueChange).toHaveBeenCalledTimes(2);
  });

  test("updates qty on changed links without touching others", async () => {
    existingRows = [
      { id: "l1", ingredientId: "i1", qtyPerUnit: 0.25, deletedAt: null },
      { id: "l2", ingredientId: "i2", qtyPerUnit: 1, deletedAt: null },
    ];
    await setProductIngredients("p1", [
      { ingredientId: "i1", qtyPerUnit: 0.3 },
      { ingredientId: "i2", qtyPerUnit: 1 },
    ]);

    expect(insertCalls).toHaveLength(0);
    const qtyUpdates = updateCalls.filter(
      (c) => c.table === productIngredients
    );
    expect(qtyUpdates).toHaveLength(1);
    expect(qtyUpdates[0]?.set.qtyPerUnit).toBe(0.3);
    expect(qtyUpdates[0]?.set.deletedAt).toBeUndefined();
  });

  test("soft-deletes removed links", async () => {
    existingRows = [
      { id: "l1", ingredientId: "i1", qtyPerUnit: 0.25, deletedAt: null },
    ];
    await setProductIngredients("p1", []);

    const del = updateCalls.filter((c) => c.table === productIngredients);
    expect(del).toHaveLength(1);
    expect(del[0]?.set.deletedAt).toBeTruthy();
    expect(del[0]?.set.isSynced).toBe(false);
  });

  test("resurrects a re-added link with its new qty", async () => {
    existingRows = [
      { id: "l1", ingredientId: "i1", qtyPerUnit: 9, deletedAt: "2026-01-01" },
    ];
    await setProductIngredients("p1", [
      { ingredientId: "i1", qtyPerUnit: 0.5 },
    ]);

    expect(insertCalls).toHaveLength(0);
    const res = updateCalls.filter((c) => c.table === productIngredients);
    expect(res[0]?.set).toMatchObject({
      deletedAt: null,
      qtyPerUnit: 0.5,
      merchantId: "merchant-1",
    });
  });

  test("rejects non-positive qty", async () => {
    await expect(
      setProductIngredients("p1", [{ ingredientId: "i1", qtyPerUnit: 0 }])
    ).rejects.toThrow("positive");
    await expect(
      setProductIngredients("p1", [
        { ingredientId: "i1", qtyPerUnit: Number.NaN },
      ])
    ).rejects.toThrow("positive");
  });

  test("rejects without an active merchant", async () => {
    const session = await import("~/lib/auth/session");
    const original = session.currentMerchantId;
    (session as unknown as Record<string, unknown>).currentMerchantId = () =>
      null;
    await expect(
      setProductIngredients("p1", [{ ingredientId: "i1", qtyPerUnit: 1 }])
    ).rejects.toThrow("merchant");
    (session as unknown as Record<string, unknown>).currentMerchantId =
      original;
  });
});
