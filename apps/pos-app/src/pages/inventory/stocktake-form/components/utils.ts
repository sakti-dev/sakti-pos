import { products } from "~/lib/data/catalog";
import { ingredients } from "../../components/lib/ingredients";
import { currentStock, getMovements } from "../../components/lib/store";
import type { Movement } from "../../components/lib/types";

const OPN_RE = /^OPN-(\d+)$/;

/** Next stocktake sequence number, derived from existing refs. */
export function nextStocktakeNumber(): number {
  let max = 0;
  for (const m of getMovements()) {
    const match = m.ref?.match(OPN_RE);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return max + 1;
}

export function stocktakeRef(n: number): string {
  return `OPN-${String(n).padStart(3, "0")}`;
}

export interface StocktakeSummary {
  readonly createdAt: number;
  readonly itemCount: number; // distinct products counted
  readonly movements: Movement[];
  readonly netDelta: number; // Σ delta (negative = shrinkage)
  readonly ref: string;
}

/** Past stocktakes, newest-first, grouped by OPN-### ref. */
export function listStocktakes(): StocktakeSummary[] {
  const map = new Map<string, Movement[]>();
  for (const m of getMovements()) {
    if (m.type !== "stocktake" || !m.ref) {
      continue;
    }
    const bucket = map.get(m.ref);
    if (bucket) {
      bucket.push(m);
    } else {
      map.set(m.ref, [m]);
    }
  }
  return [...map.entries()]
    .map(([ref, ms]) => ({
      ref,
      createdAt: ms[0].createdAt,
      itemCount: new Set(ms.map((m) => m.productId)).size,
      netDelta: ms.reduce((s, m) => s + m.delta, 0),
      movements: ms,
    }))
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? b.ref.localeCompare(a.ref)
        : b.createdAt - a.createdAt
    );
}

export interface VarianceRow {
  readonly counted: number;
  readonly diff: number; // counted - system
  readonly productId: number;
  readonly system: number;
}

/** Map counted quantities to variance rows using current system stock. */
export function varianceRows(
  counted: readonly { counted: number; productId: number }[]
): VarianceRow[] {
  return counted.map((c) => {
    const system = currentStock(c.productId);
    return {
      productId: c.productId,
      system,
      counted: c.counted,
      diff: c.counted - system,
    };
  });
}

/** Value of a set of variances (diff * product/ingredient price). */
export function varianceValue(rows: readonly VarianceRow[]): number {
  let sum = 0;
  for (const r of rows) {
    const p = products.find((x) => x.id === r.productId);
    const ing = p ? undefined : ingredients.find((x) => x.id === r.productId);
    const unitPrice = p?.price ?? ing?.latestCostPrice ?? 0;
    sum += unitPrice * r.diff;
  }
  return sum;
}
