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

/** One chosen modifier option on a cart line (catalog snapshot at add
 *  time). `priceDelta` is whole Rupiah, already folded into the line's
 *  effective `price`. */
export interface LineModifier {
  readonly groupId: string;
  readonly groupName: string;
  readonly label: string;
  readonly optionId: string;
  readonly priceDelta: number;
}

/**
 * A line in the in-progress cart. Snapshots the product at add-time so the
 * cart — and any committed order — reflects what was actually sold, not the
 * live catalog price. `category` is the display-ready category name.
 * `lineId` identifies the line (the same product with different modifier
 * picks is separate lines); `price` is the effective unit price including
 * modifier deltas.
 */
export interface CartLine {
  readonly category: string;
  readonly imageAssetId: string | null;
  readonly lineId: string;
  readonly modifiers: readonly LineModifier[];
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
  readonly serviceCharge: number;
  readonly serviceChargeRate: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly taxRate: number;
  readonly total: number;
}

/** Charge configuration consumed by the sale loop (outlet-scoped). */
export interface ChargeRates {
  /** Integer percent 0-100 (e.g. 5 for service 5%). */
  readonly servicePercent: number;
  /** Integer percent 0-100 (e.g. 11 for PPN 11%). */
  readonly taxPercent: number;
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

/** Compute subtotal/service/tax/total for a set of lines. Charges are
 * integer percentages applied to the subtotal (service first, then tax —
 * both on the subtotal, not compounding), rounded once per charge. */
export function computeTotals(
  lines: readonly CartLine[],
  rates: ChargeRates = { taxPercent: 0, servicePercent: 0 }
): OrderTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const serviceCharge = Math.round((subtotal * rates.servicePercent) / 100);
  const tax = Math.round((subtotal * rates.taxPercent) / 100);
  return {
    subtotal,
    tax,
    taxRate: rates.taxPercent / 100,
    serviceCharge,
    serviceChargeRate: rates.servicePercent / 100,
    total: subtotal + serviceCharge + tax,
  };
}

/** Turn a raw product `cat` key ("minuman") into a display label ("Minuman"). */
export function categoryLabel(cat: string): string {
  if (!cat) {
    return "";
  }
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}
