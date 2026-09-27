import { categories, products } from "@sync-contract/local-synced-schema";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const tx = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
};

vi.mock("~/db", () => ({
  TABLE: { categories, products },
  db: { select: mockSelect },
}));

vi.mock("~/lib/api/sync", () => ({
  getSyncClient: () => ({
    enqueueChange: vi.fn(),
    writeTransaction: async (_db: unknown, fn: (t: unknown) => unknown) =>
      await fn(tx),
  }),
}));

vi.mock("~/lib/auth/session", () => ({
  currentMerchantId: () => "merchant-1",
}));

const {
  createCategory,
  createProduct,
  getProducts,
  softDeleteProduct,
  updateProduct,
} = await import("../catalog");

const productRow = {
  categoryId: "cat-1",
  createdAt: "2026-09-28T00:00:00.000Z",
  id: "prod-1",
  imageAssetId: null,
  isActive: true,
  merchantId: "merchant-1",
  name: "Es Kopi Susu",
  priceMinorUnits: 2_500_000,
  sortOrder: 0,
  updatedAt: "2026-09-28T00:00:00.000Z",
};

const categoryRow = {
  createdAt: "2026-09-28T00:00:00.000Z",
  id: "cat-1",
  isActive: true,
  merchantId: "merchant-1",
  name: "Minuman",
  sortOrder: 0,
  updatedAt: "2026-09-28T00:00:00.000Z",
};

describe("catalog repo", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("createCategory inserts with sync enqueue", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([categoryRow]),
      }),
    });

    const row = await createCategory({ name: "Minuman" });

    expect(row.id).toBe("cat-1");
    expect(mockInsert).toHaveBeenCalledWith(categories);
  });

  test("createProduct converts whole rupiah to minor units", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([productRow]),
      }),
    });

    const row = await createProduct({
      categoryId: "cat-1",
      name: "Es Kopi Susu",
      price: 25_000,
    });

    expect(row.priceMinorUnits).toBe(2_500_000);
    const valuesArg = mockInsert.mock.calls[0]?.[0];
    expect(valuesArg).toBe(products);
  });

  test("createProduct rejects non-positive or fractional prices", async () => {
    await expect(
      createProduct({ categoryId: "cat-1", name: "X", price: 0 })
    ).rejects.toThrow();
    await expect(
      createProduct({ categoryId: "cat-1", name: "X", price: 1.5 })
    ).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test("updateProduct patches only provided fields with isSynced false", async () => {
    const setArg = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ ...productRow, priceMinorUnits: 3_000_000 }]),
      }),
    });
    mockUpdate.mockReturnValue({ set: setArg });

    await updateProduct("prod-1", { price: 30_000 });

    const passedSet = setArg.mock.calls[0][0] as Record<string, unknown>;
    expect(passedSet.priceMinorUnits).toBe(3_000_000);
    expect(passedSet.isSynced).toBe(false);
    expect(passedSet.name).toBeUndefined();
  });

  test("softDeleteProduct sets deletedAt via update", async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([productRow]),
        }),
      }),
    });

    await softDeleteProduct("prod-1");
    expect(mockUpdate).toHaveBeenCalledWith(products);
  });

  test("getProducts returns rows", async () => {
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([productRow]),
        }),
      }),
    }));
    const rows = await getProducts();
    expect(rows).toEqual([productRow]);
  });
});
