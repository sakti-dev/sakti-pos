import type { ProductWithCategory } from "~/db/orders";

type GroupedProducts = {
  categoryName: string;
  products: ProductWithCategory[];
}[];

export function getCategoryNames(
  groupedData: GroupedProducts | undefined
): string[] {
  return groupedData?.map((group) => group.categoryName) ?? [];
}

export function getVisibleProducts(
  groupedData: GroupedProducts | undefined,
  selectedCategory: string | null,
  search: string
): ProductWithCategory[] {
  if (!groupedData) {
    return [];
  }

  const q = search.trim().toLowerCase();
  const baseProducts = selectedCategory
    ? (groupedData.find((group) => group.categoryName === selectedCategory)
        ?.products ?? [])
    : groupedData.flatMap((group) => group.products);

  if (!q) {
    return baseProducts;
  }

  return baseProducts.filter((product) =>
    product.name.toLowerCase().includes(q)
  );
}
