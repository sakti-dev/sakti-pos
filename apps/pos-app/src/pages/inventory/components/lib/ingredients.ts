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

export const [ingredients, setIngredients] = createStore<Ingredient[]>([]);

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
  nextId = 90_001;
  setIngredients([]);
}
