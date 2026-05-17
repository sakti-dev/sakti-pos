import { categories, products } from "@repo/database";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockRecordLocalChange = vi.fn();
  const mockDb = {
    delete: mockDelete,
    insert: mockInsert,
    select: mockSelect,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn(mockDb),
    update: mockUpdate,
  };

  return {
    mockDb,
    mockDelete,
    mockFrom,
    mockInsert,
    mockRecordLocalChange,
    mockSelect,
    mockUpdate,
  };
});

vi.mock("drizzle-orm", () => {
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })) as ReturnType<typeof vi.fn> & {
    raw?: (value: string) => { raw: string };
  };
  sql.raw = (value: string) => ({ raw: value });

  return {
    and: vi.fn((...args: unknown[]) => args),
    asc: vi.fn((...args: unknown[]) => args),
    eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
    gt: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "gt" })),
    inArray: vi.fn((col: unknown, values: unknown[]) => ({ col, values })),
    isNull: vi.fn((col: unknown) => ({ col, op: "isNull" })),
    or: vi.fn((...args: unknown[]) => args),
    sql,
  };
});

const syncOutbox = await import("../sync-outbox");
let recordLocalChangeSpy: ReturnType<typeof vi.spyOn> | undefined;
const { mockFrom, mockInsert, mockRecordLocalChange, mockSelect, mockUpdate } =
  mocks;

vi.mock("../index", () => ({
  db: mocks.mockDb,
}));

vi.mock("~/store/outlet", () => ({
  currentMerchantId: vi.fn(() => null),
  currentOutletId: vi.fn(() => null),
  currentRegisterId: vi.fn(() => null),
  currentOutletTimezone: vi.fn(() => "Asia/Jakarta"),
}));

function mockFromOrderBy(data: unknown[]) {
  return {
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue(data),
    }),
    orderBy: vi.fn().mockResolvedValue(data),
  };
}

describe("menu db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordLocalChangeSpy = vi
      .spyOn(syncOutbox, "recordLocalChange")
      .mockImplementation((...args: unknown[]) =>
        mockRecordLocalChange(...args)
      );
  });

  afterEach(() => {
    recordLocalChangeSpy?.mockRestore();
    recordLocalChangeSpy = undefined;
  });

  test("getCategories returns ordered categories", async () => {
    const fakeCategories = [
      { id: 1, name: "Food" },
      { id: 2, name: "Drink" },
    ];
    mockFrom.mockReturnValue(mockFromOrderBy(fakeCategories));

    const { getCategories } = await import("../menu");
    const result = await getCategories();

    expect(result).toEqual(fakeCategories);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith(categories);
  });

  test("getCategory returns a single category by id", async () => {
    const fakeCategory = { id: 1, name: "Food" };
    mockFrom.mockReturnValue({
      where: vi.fn().mockResolvedValue([fakeCategory]),
      orderBy: vi.fn().mockResolvedValue([fakeCategory]),
    });

    const { getCategory } = await import("../menu");
    const result = await getCategory("category-1");

    expect(result).toEqual(fakeCategory);
  });

  test("getCategory returns undefined when not found", async () => {
    mockFrom.mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockResolvedValue([]),
    });

    const { getCategory } = await import("../menu");
    const result = await getCategory("missing-category");

    expect(result).toBeUndefined();
  });

  test("createCategory inserts and returns the new category", async () => {
    const newCategory = { id: "category-1", merchantId: "", name: "Dessert" };
    const mockReturning = vi.fn().mockResolvedValue([newCategory]);
    const mockValues = vi.fn(() => ({ returning: mockReturning }));
    mockInsert.mockReturnValue({ values: mockValues });

    const { createCategory } = await import("../menu");
    const result = await createCategory({ name: "Dessert" } as never);

    expect(result).toEqual(newCategory);
    expect(mockValues).toHaveBeenCalledWith({
      isSynced: false,
      name: "Dessert",
      merchantId: "",
    });
    expect(mockRecordLocalChange).toHaveBeenCalledWith(
      {
        operation: "insert",
        rowId: "category-1",
        scopeId: "",
        scopeType: "merchant",
        tableName: "categories",
      },
      expect.anything()
    );
  });

  test("deleteCategory calls update with tombstone fields", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const { deleteCategory } = await import("../menu");
    await deleteCategory("category-1");

    expect(mockUpdate).toHaveBeenCalledWith(categories);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(String),
        isSynced: false,
      })
    );
    expect(mockRecordLocalChange).toHaveBeenCalledWith(
      {
        operation: "delete",
        rowId: "category-1",
        scopeId: "",
        scopeType: "merchant",
        tableName: "categories",
      },
      expect.anything()
    );
  });

  test("getProductCountByCategory returns count of products", async () => {
    mockFrom.mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
      orderBy: vi.fn(),
    });

    const { getProductCountByCategory } = await import("../menu");
    const result = await getProductCountByCategory("category-1");

    expect(result).toBe(1);
  });

  test("getProductCountByCategory returns 0 when no products", async () => {
    mockFrom.mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
      orderBy: vi.fn(),
    });

    const { getProductCountByCategory } = await import("../menu");
    const result = await getProductCountByCategory("missing-category");

    expect(result).toBe(0);
  });

  test("getProducts without filter returns all products", async () => {
    const fakeProducts = [{ id: 1, name: "Nasi Goreng" }];
    mockFrom.mockReturnValue(mockFromOrderBy(fakeProducts));

    const { getProducts } = await import("../menu");
    const result = await getProducts();

    expect(result).toEqual(fakeProducts);
  });

  test("getProducts with filterCategoryId returns filtered products", async () => {
    const fakeProducts = [{ id: 2, name: "Es Teh" }];
    mockFrom.mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(fakeProducts),
      }),
      orderBy: vi.fn().mockResolvedValue(fakeProducts),
    });

    const { getProducts } = await import("../menu");
    const result = await getProducts("category-1");

    expect(result).toEqual(fakeProducts);
  });

  test("createProduct inserts and returns the new product", async () => {
    const newProduct = {
      id: "product-1",
      merchantId: "",
      name: "Nasi Goreng",
      priceMinorUnits: 15_000,
    };
    const mockReturning = vi.fn().mockResolvedValue([newProduct]);
    const mockValues = vi.fn(() => ({ returning: mockReturning }));
    mockInsert.mockReturnValue({ values: mockValues });

    const { createProduct } = await import("../menu");
    const result = await createProduct({
      name: "Nasi Goreng",
      priceMinorUnits: 15_000,
    } as never);

    expect(result).toEqual(newProduct);
    expect(mockValues).toHaveBeenCalledWith({
      isSynced: false,
      name: "Nasi Goreng",
      priceMinorUnits: 15_000,
      merchantId: "",
    });
    expect(mockRecordLocalChange).toHaveBeenCalledWith(
      {
        operation: "insert",
        rowId: "product-1",
        scopeId: "",
        scopeType: "merchant",
        tableName: "products",
      },
      expect.anything()
    );
  });

  test("deleteProduct calls update with tombstone fields", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const { deleteProduct } = await import("../menu");
    await deleteProduct("product-1");

    expect(mockUpdate).toHaveBeenCalledWith(products);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(String),
        isSynced: false,
      })
    );
    expect(mockRecordLocalChange).toHaveBeenCalledWith(
      {
        operation: "delete",
        rowId: "product-1",
        scopeId: "",
        scopeType: "merchant",
        tableName: "products",
      },
      expect.anything()
    );
  });
});
