/** Low-stock fallback when an item has no explicit threshold. */
export const DEFAULT_MIN_STOCK = 5;

export type StockStatusKind = "available" | "low" | "out";

export interface StockStatusInfo {
  readonly badge: "success" | "warning" | "danger";
  readonly label: string;
  readonly status: StockStatusKind;
}

/**
 * Threshold-based stock status. `minStock` is the item's explicit
 * low-stock threshold; callers fall back to the shared default.
 */
export function stockStatus(
  stock: number,
  minStock: number = DEFAULT_MIN_STOCK
): StockStatusInfo {
  if (stock <= 0) {
    return { status: "out", label: "Habis", badge: "danger" };
  }
  if (stock <= minStock) {
    return { status: "low", label: "Stok Rendah", badge: "warning" };
  }
  return { status: "available", label: "Tersedia", badge: "success" };
}
