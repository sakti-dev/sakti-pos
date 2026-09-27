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
 * A sellable product (a catalog row, whole-Rupiah price). Backed by the
 * synced `products` table.
 */
export interface Product {
  readonly categoryId: string | null;
  readonly id: string;
  readonly imageAssetId: string | null;
  readonly name: string;
  readonly price: number;
}

/**
 * A line in the in-progress cart. Snapshots the product at add-time so the
 * cart — and any committed order — reflects what was actually sold, not the
 * live catalog price. `category` is the display-ready category name.
 */
export interface CartLine {
  readonly category: string;
  readonly imageAssetId: string | null;
  readonly name: string;
  readonly price: number;
  readonly productId: string;
  qty: number;
}

export type PayMethod = "cash" | "qris_static" | "qris_dynamic";

/** Payment details collected on the payment screen. */
export interface PaymentDetails {
  readonly cashTendered?: number;
  readonly customerName?: string;
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

/** Turn a raw product `cat` key ("minuman") into a display label ("Minuman"). */
export function categoryLabel(cat: string): string {
  if (!cat) {
    return "";
  }
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}
