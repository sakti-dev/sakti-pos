import { products } from "~/lib/data/catalog";
import { currentStock, getMovements } from "./store";
import type { Movement } from "./types";

export type StockStatusKind = "available" | "low" | "out";

/** Threshold-based low-stock check for stat cards. */
export function isLowStock(
  qty: number,
  type: "ingredient" | "retail"
): boolean {
  return type === "retail" ? qty <= 5 : qty <= 3;
}

export interface StockStatusInfo {
  readonly badge: "success" | "warning" | "danger";
  readonly label: string;
  readonly status: StockStatusKind;
}

const DEFAULT_MIN = 10;

export function stockStatus(
  stock: number,
  minStock = DEFAULT_MIN
): StockStatusInfo {
  if (stock <= 0) {
    return { status: "out", label: "Habis", badge: "danger" };
  }
  if (stock <= minStock) {
    return { status: "low", label: "Stok Rendah", badge: "warning" };
  }
  return { status: "available", label: "Tersedia", badge: "success" };
}

export function countByStatus(minStock = DEFAULT_MIN) {
  let out = 0;
  let low = 0;
  let available = 0;
  for (const p of products) {
    const s = stockStatus(currentStock(p.id), minStock).status;
    if (s === "out") {
      out++;
    } else if (s === "low") {
      low++;
    } else {
      available++;
    }
  }
  return { out, low, available };
}

/** Total retail value of on-hand stock (sum stock * price). */
export function computeStockValue(): number {
  let sum = 0;
  for (const p of products) {
    sum += currentStock(p.id) * p.price;
  }
  return sum;
}

export interface DayGroup {
  readonly items: Movement[]; // newest-last within the day
  readonly label: string; // e.g. "17 Jun 2026"
  readonly ts: number; // start-of-day epoch ms (local), for ordering
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_LABEL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Group all movements by local calendar day, newest day first. */
export function groupMovementsByDay(): DayGroup[] {
  const map = new Map<number, Movement[]>();
  for (const m of getMovements()) {
    const key = startOfDay(m.createdAt);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(m);
    } else {
      map.set(key, [m]);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ts, items]) => ({
      ts,
      label: DAY_LABEL.format(new Date(ts)),
      items,
    }));
}
