import { getMovements } from "./store";
import type { Movement } from "./types";

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
