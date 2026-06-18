import { getMovements } from "../components/lib/store";
import type { Movement } from "../components/lib/types";

// ── Item sync types & pure helpers ──

export interface SyncableItem {
  costPrice: number;
  productId: number;
  qty: number;
  /** Which field was last edited — determines what stays fixed when qty changes */
  sourceField: "costPrice" | "subtotal";
  /** Stored total when user typed subtotal directly */
  subtotalValue: number;
}

export const createBlankItem = (productId: number): SyncableItem => ({
  costPrice: 0,
  productId,
  qty: 1,
  sourceField: "costPrice",
  subtotalValue: 0,
});

/** Display value for subtotal field */
export const displaySubtotal = (it: SyncableItem): number =>
  it.sourceField === "subtotal" ? it.subtotalValue : it.qty * it.costPrice;

/** When user edits harga beli → costPrice becomes source of truth */
export const onCostPriceChange = (
  item: SyncableItem,
  value: number
): SyncableItem => ({
  ...item,
  costPrice: value,
  sourceField: "costPrice",
  subtotalValue: 0,
});

/** When user edits subtotal → subtotal becomes source of truth, costPrice derived */
export const onSubtotalChange = (
  item: SyncableItem,
  value: number
): SyncableItem => {
  if (item.qty === 0) {
    return item;
  }
  const costPrice = Math.round(value / item.qty);
  return { ...item, costPrice, sourceField: "subtotal", subtotalValue: value };
};

/** When qty changes — recalc costPrice if subtotal was the source */
export const onQtyChange = (
  item: SyncableItem,
  newQty: number
): SyncableItem => {
  if (item.sourceField === "subtotal" && newQty > 0) {
    const costPrice = Math.round(item.subtotalValue / newQty);
    return { ...item, qty: newQty, costPrice };
  }
  return { ...item, qty: newQty };
};

// ── Receipt helpers ──

const TRX_RE = /^TRX-(\d+)$/;

export function receiptRef(n: number): string {
  return `TRX-${String(n).padStart(4, "0")}`;
}

export function nextReceiptNumber(): number {
  let max = 0;
  for (const m of getMovements()) {
    const match = m.ref?.match(TRX_RE);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return max + 1;
}

export interface ReceiptSummary {
  readonly createdAt: number;
  readonly itemCount: number;
  readonly movements: Movement[];
  readonly ref: string;
  readonly supplier?: string;
  readonly totalCost: number;
  readonly totalQty: number;
}

export function listReceipts(): ReceiptSummary[] {
  const map = new Map<string, Movement[]>();
  for (const m of getMovements()) {
    if (m.type !== "restock" || !m.ref) {
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
      supplier: ms[0].supplier,
      itemCount: new Set(ms.map((m) => m.productId)).size,
      totalQty: ms.reduce((s, m) => s + m.delta, 0),
      totalCost: ms.reduce((s, m) => s + m.delta * (m.costPrice ?? 0), 0),
      movements: ms,
    }))
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? b.ref.localeCompare(a.ref)
        : b.createdAt - a.createdAt
    );
}
