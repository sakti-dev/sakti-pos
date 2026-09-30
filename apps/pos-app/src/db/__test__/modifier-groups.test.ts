import {
  modifierGroups,
  modifierOptions,
  productModifierGroups,
} from "@sync-contract/local-synced-schema";
import { describe, expect, test, vi } from "vitest";

/* Chainable tx mock: insert().values().returning(), update().set().
   where().returning(), select().from().where().orderBy(). */
let idSeq = 0;
const nextId = () => `row-${++idSeq}`;

const insertCalls: Array<{ table: unknown; values: Record<string, unknown> }> =
  [];
const updateCalls: Array<{
  set: Record<string, unknown>;
  table: unknown;
}> = [];

const selectResult: unknown[] = [];

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
      /* Awaitable directly (syncProductLinks) or chained through
         orderBy (repo reads). */
      where: () =>
        Object.assign(Promise.resolve(selectResult), {
          orderBy: async () => selectResult,
        }),
    }),
  }),
  update: (table: unknown) => ({
    set: (set: Record<string, unknown>) => ({
      where: () => ({
        returning: () => {
          updateCalls.push({ set, table });
          return Promise.resolve([{ id: nextId() }]);
        },
      }),
    }),
  }),
};

vi.mock("~/db", () => ({
  TABLE: {
    modifierGroups,
    modifierOptions,
    productModifierGroups,
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
}));

vi.mock("~/lib/utils", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { createModifierGroup, softDeleteModifierGroup } = await import(
  "../modifier-groups"
);

const INPUT = {
  isRequired: true,
  name: "  Size  ",
  options: [
    { label: "Small", priceDeltaMinorUnits: 0 },
    { label: "Large", priceDeltaMinorUnits: 500_000 },
  ],
  productIds: ["p1", "p2"],
  selectionType: "single" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  updateCalls.length = 0;
  selectResult.length = 0;
  idSeq = 0;
});

describe("createModifierGroup", () => {
  test("inserts group, options with sequential sort, links; enqueues each row", async () => {
    await createModifierGroup(INPUT);

    const groupInsert = insertCalls.find(
      (c) => c.table === modifierGroups
    )?.values;
    expect(groupInsert?.name).toBe("Size");
    expect(groupInsert?.selectionType).toBe("single");
    expect(groupInsert?.isRequired).toBe(true);
    expect(groupInsert?.merchantId).toBe("merchant-1");

    const optionInserts = insertCalls.filter(
      (c) => c.table === modifierOptions
    );
    expect(optionInserts).toHaveLength(2);
    expect(optionInserts[0]?.values).toMatchObject({
      label: "Small",
      priceDeltaMinorUnits: 0,
      sortOrder: 0,
    });
    expect(optionInserts[1]?.values).toMatchObject({
      label: "Large",
      priceDeltaMinorUnits: 500_000,
      sortOrder: 1,
    });

    const linkInserts = insertCalls.filter(
      (c) => c.table === productModifierGroups
    );
    expect(linkInserts).toHaveLength(2);
    expect(linkInserts.map((l) => l.values.productId)).toEqual(["p1", "p2"]);

    // group + 2 options + 2 links = 5 enqueued changes
    expect(enqueueChange).toHaveBeenCalledTimes(5);
  });

  test("rejects empty name", async () => {
    await expect(
      createModifierGroup({ ...INPUT, name: "   " })
    ).rejects.toThrow("name");
  });

  test("rejects zero options", async () => {
    await expect(
      createModifierGroup({ ...INPUT, options: [] })
    ).rejects.toThrow("option");
  });
});

describe("softDeleteModifierGroup", () => {
  test("soft-deletes the group and enqueues it", async () => {
    await softDeleteModifierGroup("group-1");

    const groupUpdate = updateCalls.find((c) => c.table === modifierGroups);
    expect(groupUpdate?.set.deletedAt).toBeTruthy();
    expect(enqueueChange).toHaveBeenCalled();
  });
});
