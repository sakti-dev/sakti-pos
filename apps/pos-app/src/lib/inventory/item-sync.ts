/**
 * Pure bidirectional price ↔ subtotal sync logic.
 * Extracted from terima-receive so it can be unit-tested without rendering.
 */

export interface SyncableItem {
  costPrice: number;
  productId: number;
  qty: number;
  /** Which field was last edited — determines what stays fixed when qty changes */
  sourceField: "costPrice" | "subtotal";
  /** Stored total when user typed subtotal directly */
  subtotalValue: number;
}

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
  return {
    ...item,
    costPrice,
    sourceField: "subtotal",
    subtotalValue: value,
  };
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

/** Create a blank item */
export const createBlankItem = (productId: number): SyncableItem => ({
  costPrice: 0,
  productId,
  qty: 1,
  sourceField: "costPrice",
  subtotalValue: 0,
});
