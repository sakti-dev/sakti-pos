import { describe, expect, it } from "vitest";
import type { StocktakeItem } from "../use-stocktake";
import { varianceRows, varianceValue } from "../utils";

const ITEM = (over: Partial<StocktakeItem> = {}): StocktakeItem => ({
  id: "p1",
  name: "Kopi Sachet",
  onHandQty: 80,
  priceMinorUnits: 250_000,
  targetType: "product",
  unit: "Pcs",
  ...over,
});

describe("stocktake helpers", () => {
  it("varianceRows maps counted qty to {system, counted, diff}", () => {
    const rows = varianceRows([
      { counted: 75, item: ITEM() },
      { counted: 60, item: ITEM({ id: "p2", onHandQty: 60 }) },
    ]);
    expect(rows[0]).toMatchObject({ system: 80, counted: 75, diff: -5 });
    expect(rows[1]).toMatchObject({ system: 60, counted: 60, diff: 0 });
  });

  it("missing item (untracked mid-session) reads system 0", () => {
    const rows = varianceRows([{ counted: 5, item: undefined }]);
    expect(rows[0]).toMatchObject({ system: 0, counted: 5, diff: 5 });
  });

  it("varianceValue prices product diffs at sale price", () => {
    const rows = varianceRows([
      { counted: 75, item: ITEM() }, // diff -5 × Rp2.500
      { counted: 82, item: ITEM({ id: "p2", onHandQty: 80 }) }, // diff +2 × Rp2.500
    ]);
    expect(varianceValue(rows)).toBe(-5 * 2500 + 2 * 2500);
  });

  it("ingredients (no sale price) value as 0", () => {
    const rows = varianceRows([
      {
        counted: 1,
        item: ITEM({
          id: "i1",
          priceMinorUnits: null,
          targetType: "ingredient",
        }),
      },
    ]);
    expect(varianceValue(rows)).toBe(0);
  });
});
