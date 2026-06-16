import { products } from "~/lib/data/catalog";
import { currentStock, getMovements } from "./store";
import type { Movement } from "./types";

const OPN_RE = /^OPN-(\d+)$/;

/** Next opname sequence number, derived from existing refs. */
export function nextOpnameNumber(): number {
  let max = 0;
  for (const m of getMovements()) {
    const match = m.ref?.match(OPN_RE);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return max + 1;
}

export function opnameRef(n: number): string {
  return `OPN-${String(n).padStart(3, "0")}`;
}

export interface OpnameSummary {
  readonly createdAt: number;
  readonly itemCount: number; // distinct products counted
  readonly movements: Movement[];
  readonly netDelta: number; // Σ delta (negative = shrinkage)
  readonly ref: string;
}

/** Past opnames, newest-first, grouped by OPN-### ref. */
export function listOpnames(): OpnameSummary[] {
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

/** Value of a set of variances (diff * product price). */
export function varianceValue(rows: readonly VarianceRow[]): number {
  let sum = 0;
  for (const r of rows) {
    const p = products.find((x) => x.id === r.productId);
    sum += (p?.price ?? 0) * r.diff;
  }
  return sum;
}
