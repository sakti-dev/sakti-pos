/**
 * Sakti POS — sale domain model.
 *
 * Canonical types for the sale loop (cash-register → payment → receipt).
 * UI-only for now: money is integer IDR rupiah. IDR has no sub-rupiah
 * denomination, so 1 rupiah == 1 minor unit — which is exactly the
 * `MinorUnits` representation backend Drizzle schemas will use per
 * AGENTS.md. When the backend lands, only the {@link OrderRepository}
 * implementation changes; these types and the sale session stay as-is.
 */

/** Flat PPN tax rate. Today constant; will become a per-outlet setting. */
export const TAX_RATE = 0.11;

/**
 * A sellable product (a catalog row). MVP mock ids are numeric; the backend
 * will use uuid strings — only this type's `id` field changes then.
 */
export interface Product {
  readonly cat: string;
  readonly id: number;
  readonly img: number;
  readonly name: string;
  readonly price: number;
}

/**
 * A line in the in-progress cart. Snapshots the product at add-time so the
 * cart — and any committed order — reflects what was actually sold, not the
 * live catalog price. `category` is display-ready (capitalized).
 */
export interface CartLine {
  readonly category: string;
  readonly img: number;
  readonly name: string;
  readonly price: number;
  readonly productId: number;
  qty: number;
}

export type PayMethod = "cash" | "qris" | "card" | "ewallet";

/** Payment details collected on the payment screen. */
export interface PaymentDetails {
  readonly cashTendered?: number;
  readonly customerName?: string;
  readonly ewallet?: string;
  readonly method: PayMethod;
  readonly notes?: string;
}

export interface OrderTotals {
  readonly subtotal: number;
  readonly tax: number;
  readonly taxRate: number;
  readonly total: number;
}

/**
 * An immutable, committed sale record. This is the shape the order
 * repository persists and the receipt renders.
 */
export interface CompletedOrder extends OrderTotals {
  readonly change: number;
  readonly createdAt: number;
  readonly id: string;
  readonly lines: readonly CartLine[];
  readonly paid: number;
  readonly payment: PaymentDetails;
}

/** Compute subtotal/tax/total for a set of lines. Pure and reusable. */
export function computeTotals(
  lines: readonly CartLine[],
  taxRate: number = TAX_RATE
): OrderTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const tax = Math.round(subtotal * taxRate);
  return { subtotal, tax, taxRate, total: subtotal + tax };
}

let orderSeq = 0;

/** Generate a unique, human-readable order id: `TX-YYYYMMDD-XXX`. */
export function generateOrderId(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(++orderSeq).padStart(3, "0");
  return `TX-${y}${m}${d}-${seq}`;
}

/** Turn a raw product `cat` key ("minuman") into a display label ("Minuman"). */
export function categoryLabel(cat: string): string {
  if (!cat) {
    return "";
  }
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}
