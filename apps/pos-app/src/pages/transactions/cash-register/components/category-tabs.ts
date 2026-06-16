export type CategoryKey = "minuman" | "makanan" | "snack" | "dessert" | "paket";

interface CatTab {
  readonly key: CategoryKey;
  readonly label: string;
}

export const categoryTabs: readonly CatTab[] = [
  { key: "minuman", label: "Minuman" },
  { key: "makanan", label: "Makanan" },
  { key: "snack", label: "Snack" },
  { key: "dessert", label: "Dessert" },
  { key: "paket", label: "Paket" },
] as const;
