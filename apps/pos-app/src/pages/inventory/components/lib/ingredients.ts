import { createStore, produce } from "solid-js/store";

// ── Types ──

export interface Ingredient {
  readonly category?: string;
  readonly id: number;
  /** Latest per-unit purchase cost from the most recent restock. */
  readonly latestCostPrice: number;
  readonly name: string;
  readonly sku: string;
  readonly unit: string;
}

// ── Singleton store ──

let nextId = 90_001;

function seedIngredients(): Ingredient[] {
  return [
    {
      id: 90_001,
      name: "Biji Kopi Arabica",
      sku: "RAW-001",
      unit: "kg",
      category: "Minuman",
      latestCostPrice: 120_000,
    },
    {
      id: 90_002,
      name: "Gula Pasir",
      sku: "RAW-002",
      unit: "kg",
      category: "Minuman",
      latestCostPrice: 16_000,
    },
    {
      id: 90_003,
      name: "Susu UHT Full Cream",
      sku: "RAW-003",
      unit: "liter",
      category: "Minuman",
      latestCostPrice: 18_000,
    },
    {
      id: 90_004,
      name: "Air Mineral Galon",
      sku: "RAW-004",
      unit: "galon",
      category: "Minuman",
      latestCostPrice: 12_000,
    },
    {
      id: 90_005,
      name: "Teh Celup",
      sku: "RAW-005",
      unit: "box",
      category: "Minuman",
      latestCostPrice: 8500,
    },
    {
      id: 90_006,
      name: "Matcha Bubuk",
      sku: "RAW-006",
      unit: "kg",
      category: "Minuman",
      latestCostPrice: 95_000,
    },
    {
      id: 90_007,
      name: "Sirup Coklat",
      sku: "RAW-007",
      unit: "botol",
      category: "Minuman",
      latestCostPrice: 25_000,
    },
    {
      id: 90_008,
      name: "Kopi Robusta",
      sku: "RAW-008",
      unit: "kg",
      category: "Minuman",
      latestCostPrice: 75_000,
    },
    {
      id: 90_009,
      name: "Susu Kental Manis",
      sku: "RAW-009",
      unit: "kaleng",
      category: "Minuman",
      latestCostPrice: 11_000,
    },
    {
      id: 90_010,
      name: "Susu Creamer",
      sku: "RAW-010",
      unit: "kg",
      category: "Minuman",
      latestCostPrice: 32_000,
    },
    {
      id: 90_011,
      name: "Tepung Terigu",
      sku: "RAW-011",
      unit: "kg",
      category: "Makanan",
      latestCostPrice: 10_000,
    },
    {
      id: 90_012,
      name: "Mentega",
      sku: "RAW-012",
      unit: "kg",
      category: "Makanan",
      latestCostPrice: 22_000,
    },
    {
      id: 90_013,
      name: "Telur Ayam",
      sku: "RAW-013",
      unit: "kg",
      category: "Makanan",
      latestCostPrice: 28_000,
    },
    {
      id: 90_014,
      name: "Minyak Goreng",
      sku: "RAW-014",
      unit: "liter",
      category: "Makanan",
      latestCostPrice: 18_000,
    },
    {
      id: 90_015,
      name: "Beras",
      sku: "RAW-015",
      unit: "kg",
      category: "Makanan",
      latestCostPrice: 14_000,
    },
    {
      id: 90_016,
      name: "Kecap Manis",
      sku: "RAW-016",
      unit: "botol",
      category: "Bumbu",
      latestCostPrice: 12_000,
    },
    {
      id: 90_017,
      name: "Garam",
      sku: "RAW-017",
      unit: "kg",
      category: "Bumbu",
      latestCostPrice: 5000,
    },
    {
      id: 90_018,
      name: "Bawang Merah",
      sku: "RAW-018",
      unit: "kg",
      category: "Bumbu",
      latestCostPrice: 35_000,
    },
    {
      id: 90_019,
      name: "Bawang Putih",
      sku: "RAW-019",
      unit: "kg",
      category: "Bumbu",
      latestCostPrice: 40_000,
    },
    {
      id: 90_020,
      name: "Cabai Merah Keriting",
      sku: "RAW-020",
      unit: "kg",
      category: "Bumbu",
      latestCostPrice: 45_000,
    },
    {
      id: 90_021,
      name: "Gelas Plastik 12oz",
      sku: "RAW-021",
      unit: "pcs",
      category: "Kemasan",
      latestCostPrice: 800,
    },
    {
      id: 90_022,
      name: "Gelas Plastik 16oz",
      sku: "RAW-022",
      unit: "pcs",
      category: "Kemasan",
      latestCostPrice: 1000,
    },
    {
      id: 90_023,
      name: "Sedotan Plastik",
      sku: "RAW-023",
      unit: "pack",
      category: "Kemasan",
      latestCostPrice: 6000,
    },
    {
      id: 90_024,
      name: "Tissue Napkin",
      sku: "RAW-024",
      unit: "pack",
      category: "Kemasan",
      latestCostPrice: 8000,
    },
    {
      id: 90_025,
      name: "Cup Sealer",
      sku: "RAW-025",
      unit: "roll",
      category: "Kemasan",
      latestCostPrice: 15_000,
    },
  ];
}

export const [ingredients, setIngredients] = createStore<Ingredient[]>(
  seedIngredients()
);

// ── Actions ──

export function addIngredient(input: {
  name: string;
  sku?: string;
  unit: string;
  category?: string;
}): Ingredient {
  const id = nextId++;
  const ingredient: Ingredient = {
    id,
    name: input.name,
    sku: input.sku ?? `RAW-${String(id).slice(-3)}`,
    unit: input.unit,
    category: input.category,
    latestCostPrice: 0,
  };
  setIngredients(ingredients.length, ingredient);
  return ingredient;
}

export function updateLatestCostPrice(id: number, costPrice: number) {
  const idx = ingredients.findIndex((i) => i.id === id);
  if (idx >= 0) {
    (setIngredients as (idx: number, key: string, val: number) => void)(
      idx,
      "latestCostPrice",
      costPrice
    );
  }
}

export function removeIngredient(id: number) {
  const idx = ingredients.findIndex((i) => i.id === id);
  if (idx < 0) {
    return;
  }
  setIngredients(
    produce((arr) => {
      arr.splice(idx, 1);
    })
  );
}

export function findIngredient(id: number): Ingredient | undefined {
  return ingredients.find((i) => i.id === id);
}

export function resetIngredientsStore() {
  nextId = 90_026;
  setIngredients(seedIngredients());
}
