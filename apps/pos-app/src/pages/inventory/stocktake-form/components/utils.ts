import type { StocktakeItem } from "./use-stocktake";

export interface VarianceRow {
  readonly counted: number;
  readonly diff: number; // counted - system
  readonly item: StocktakeItem | undefined;
  readonly system: number;
}

/** Map counted quantities to variance rows using system stock. */
export function varianceRows(
  counted: readonly { counted: number; item: StocktakeItem | undefined }[]
): VarianceRow[] {
  return counted.map((c) => ({
    item: c.item,
    system: c.item?.onHandQty ?? 0,
    counted: c.counted,
    diff: c.counted - (c.item?.onHandQty ?? 0),
  }));
}

/**
 * Value of a set of variances (diff × sale price, products only).
 * Ingredients have no sale price; their variance values as 0.
 */
export function varianceValue(rows: readonly VarianceRow[]): number {
  let sum = 0;
  for (const r of rows) {
    const priceMinorUnits = r.item?.priceMinorUnits ?? null;
    if (priceMinorUnits !== null) {
      sum += (priceMinorUnits / 100) * r.diff;
    }
  }
  return sum;
}
