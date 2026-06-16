import { describe, expect, test } from "vitest";
import type { ProductWithCategory } from "~/db/orders";
import { getVisibleProducts } from "../pos-utils";

const groupedData: {
  categoryName: string;
  products: ProductWithCategory[];
}[] = [
  {
    categoryName: "Minuman",
    products: [
      {
        categoryId: "category-1",
        categoryName: "Minuman",
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "product-1",
        isActive: true,
        merchantId: "merchant-1",
        name: "Kopi Susu",
        priceMinorUnits: 15_000,
        sortOrder: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        isSynced: false,
      },
      {
        categoryId: "category-1",
        categoryName: "Minuman",
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "product-2",
        isActive: true,
        merchantId: "merchant-1",
        name: "Teh Manis",
        priceMinorUnits: 8000,
        sortOrder: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        isSynced: false,
      },
    ],
  },
  {
    categoryName: "Makanan",
    products: [
      {
        categoryId: "category-2",
        categoryName: "Makanan",
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "product-3",
        isActive: true,
        merchantId: "merchant-1",
        name: "Nasi Goreng",
        priceMinorUnits: 20_000,
        sortOrder: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        isSynced: false,
      },
    ],
  },
];

describe("getVisibleProducts", () => {
  test("filters by category and search text", () => {
    const result = getVisibleProducts(groupedData, "Minuman", "kopi");

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Kopi Susu");
  });
});
