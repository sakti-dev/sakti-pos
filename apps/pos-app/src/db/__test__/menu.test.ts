import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@repo/database", () => ({
  categories: {
    id: "id",
    name: "name",
    isActive: "is_active",
  },
  products: {
    id: "id",
    categoryId: "category_id",
    name: "name",
    price: "price",
    imageUrl: "image_url",
    isActive: "is_active",
    sortOrder: "sort_order",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
  isNull: vi.fn((col: unknown) => ({ col, op: "isNull" })),
}));

const mockFrom = vi.fn();
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockRecordLocalChange = vi.fn();

vi.mock("../index", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock("../sync-outbox", () => ({
  recordLocalChange: (...args: unknown[]) => mockRecordLocalChange(...args),
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
    expect(mockFrom).toHaveBeenCalledWith(
      expect.objectContaining({ id: "id", name: "name" })
    );
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
    expect(mockRecordLocalChange).toHaveBeenCalledWith({
      operation: "insert",
      rowId: "category-1",
      scopeId: "",
      scopeType: "merchant",
      tableName: "categories",
    });
  });

  test("deleteCategory calls update with tombstone fields", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const { deleteCategory } = await import("../menu");
    await deleteCategory("category-1");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "id" })
    );
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(String),
        isSynced: false,
      })
    );
    expect(mockRecordLocalChange).toHaveBeenCalledWith({
      operation: "delete",
      rowId: "category-1",
      scopeId: "",
      scopeType: "merchant",
      tableName: "categories",
    });
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
      price: 15_000,
    };
    const mockReturning = vi.fn().mockResolvedValue([newProduct]);
    const mockValues = vi.fn(() => ({ returning: mockReturning }));
    mockInsert.mockReturnValue({ values: mockValues });

    const { createProduct } = await import("../menu");
    const result = await createProduct({
      name: "Nasi Goreng",
      price: 15_000,
    } as never);

    expect(result).toEqual(newProduct);
    expect(mockValues).toHaveBeenCalledWith({
      isSynced: false,
      name: "Nasi Goreng",
      price: 15_000,
      merchantId: "",
    });
    expect(mockRecordLocalChange).toHaveBeenCalledWith({
      operation: "insert",
      rowId: "product-1",
      scopeId: "",
      scopeType: "merchant",
      tableName: "products",
    });
  });

  test("deleteProduct calls update with tombstone fields", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const { deleteProduct } = await import("../menu");
    await deleteProduct("product-1");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "id", categoryId: "category_id" })
    );
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(String),
        isSynced: false,
      })
    );
    expect(mockRecordLocalChange).toHaveBeenCalledWith({
      operation: "delete",
      rowId: "product-1",
      scopeId: "",
      scopeType: "merchant",
      tableName: "products",
    });
  });
});
