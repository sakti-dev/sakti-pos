/* ── Inventory movement ledger domain types ─────────────────────── */

/** Kind of stock movement. `opening` = saldo awal (seed balance). */
export type MovementType =
  | "opening"
  | "adjustment"
  | "restock"
  | "stocktake"
  | "sale";

/** Reasons for a manual adjustment (and stocktake variance). */
export type AdjustmentReason =
  | "rusak" // damaged
  | "hilang" // lost
  | "expired"
  | "hadiah" // giveaway / free
  | "sample" // sampling
  | "lainnya"; // other

/** Human labels for AdjustmentReason, used in UI selects & history rows. */
export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  rusak: "Rusak",
  hilang: "Hilang",
  expired: "Expired",
  hadiah: "Hadiah",
  sample: "Sample",
  lainnya: "Lainnya",
};

/** Human labels + emoji for MovementType, used in Riwayat. */
export const MOVEMENT_TYPE_META: Record<
  MovementType,
  { label: string; emoji: string }
> = {
  opening: { label: "Saldo Awal", emoji: "🏦" },
  adjustment: { label: "Penyesuaian", emoji: "🔧" },
  restock: { label: "Penerimaan", emoji: "📦" },
  stocktake: { label: "Stock Opname", emoji: "📋" },
  sale: { label: "Penjualan", emoji: "🛒" },
};

/**
 * A single immutable ledger entry. `stock = Σ delta` over all movements
 * for a product. `qtyBefore`/`qtyAfter` are denormalized for fast history
 * rendering and always satisfy `qtyAfter === qtyBefore + delta`.
 */
export interface Movement {
  /** Purchase cost per unit, for restock (enables COGS reports later). */
  readonly costPrice?: number;
  readonly createdAt: number; // epoch ms
  /** Signed change. Clamped so qtyAfter never goes negative. */
  readonly delta: number;
  readonly id: string;
  readonly note?: string;
  readonly productId: number;
  readonly qtyAfter: number;
  readonly qtyBefore: number;
  /** Required for `adjustment` and `stocktake` variance. */
  readonly reason?: AdjustmentReason;
  /** Free-form reference: PO number, order id, "OPN-017", "TRX-042". */
  readonly ref?: string;
  readonly supplier?: string;
  readonly type: MovementType;
  readonly user: string;
}

/** Input to `recordMovement` — ledger fills id/qtyBefore/qtyAfter/createdAt. */
export type MovementInput = Omit<
  Movement,
  "id" | "qtyBefore" | "qtyAfter" | "user" | "createdAt"
> & { readonly user?: string };
