import { createMemo, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { getIngredientStockList, type StockTargetType } from "~/db/inventory";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { createBlankItem, type SyncableItem } from "./receipts";

// ── Types ──

export interface PickableItem {
  readonly id: string;
  readonly isIngredient: boolean;
  readonly name: string;
  readonly onHandQty: number;
  readonly targetType: StockTargetType;
  readonly tracked: boolean;
  readonly unit: string;
}

export interface GoodsReceiptLineInput {
  readonly qty: number;
  readonly targetId: string;
  readonly targetType: StockTargetType;
  readonly unitCostMinorUnits: number | null;
}

// ── Hook ──

export function useGoodsReceipt() {
  const [supplier, setSupplier] = createSignal("");
  const [po, setPo] = createSignal("");
  const [items, setItems] = createStore<SyncableItem[]>([]);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerSearch, setPickerSearch] = createSignal("");

  const ingredientQuery = useDrizzleQuery(
    ["drizzle", "inventory", "ingredient-stock-list"],
    () => getIngredientStockList()
  );

  // ── Item CRUD ──

  const findIndex = (id: string) => items.findIndex((i) => i.targetId === id);

  const addItem = (pick: PickableItem) => {
    if (findIndex(pick.id) >= 0) {
      return;
    }
    setItems(items.length, createBlankItem(pick.id, pick.targetType));
    setPickerOpen(false);
  };

  const patchItem = (id: string, patch: Partial<SyncableItem>) => {
    const idx = findIndex(id);
    if (idx < 0) {
      return;
    }
    setItems(idx, patch);
  };

  const removeItem = (id: string) => {
    const idx = findIndex(id);
    if (idx < 0) {
      return;
    }
    setItems(
      produce((arr) => {
        arr.splice(idx, 1);
      })
    );
  };

  // ── Bidirectional price ↔ subtotal sync ──

  const handleCostPriceChange = (id: string, value: number) => {
    patchItem(id, {
      costPrice: value,
      sourceField: "costPrice",
      subtotalValue: 0,
    });
  };

  const handleSubtotalChange = (id: string, value: number) => {
    const idx = findIndex(id);
    if (idx < 0) {
      return;
    }
    const it = items[idx];
    if (it.qty === 0) {
      return;
    }
    patchItem(id, {
      costPrice: Math.round(value / it.qty),
      sourceField: "subtotal",
      subtotalValue: value,
    });
  };

  const handleQtyChange = (id: string, newQty: number) => {
    const idx = findIndex(id);
    if (idx < 0) {
      return;
    }
    const it = items[idx];
    const patch: Partial<SyncableItem> = { qty: newQty };
    if (it.sourceField === "subtotal" && newQty > 0) {
      patch.costPrice = Math.round(it.subtotalValue / newQty);
    }
    patchItem(id, patch);
  };

  // ── Lookups (pickable universe + display) ──

  /* Penerimaan is a gudang flow entered from the Bahan tab — only bahan
     baku are receivable. Tracked products get stock via Stok Saat Ini /
     opname instead. */
  const allPickable = createMemo<PickableItem[]>(() =>
    (ingredientQuery.data() ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      onHandQty: i.onHandQty,
      tracked: i.tracked,
      unit: i.unit,
      isIngredient: true,
      targetType: "ingredient" as const,
    }))
  );

  const displayOf = (id: string) => allPickable().find((p) => p.id === id);

  const productName = (id: string) => displayOf(id)?.name ?? "—";
  const productUnit = (id: string) => displayOf(id)?.unit ?? "";
  const productStock = (id: string) =>
    displayOf(id)?.tracked ? (displayOf(id)?.onHandQty ?? 0) : null;

  const hasPickableItems = createMemo(() => allPickable().length > 0);

  const isNotFound = createMemo(() => {
    const q = pickerSearch().trim();
    if (q.length === 0) {
      return false;
    }
    const ql = q.toLowerCase();
    return allPickable().every((p) => !p.name.toLowerCase().includes(ql));
  });

  const available = () => {
    const q = pickerSearch().toLowerCase().trim();
    return allPickable().filter(
      (p) =>
        !items.some((i) => i.targetId === p.id) &&
        (q.length === 0 || p.name.toLowerCase().includes(q))
    );
  };

  // ── Derived state ──

  const totalQty = createMemo(() => items.reduce((s, i) => s + i.qty, 0));
  const totalCost = createMemo(() =>
    items.reduce((s, i) => s + i.qty * i.costPrice, 0)
  );
  const canSave = createMemo(
    () => items.length > 0 && supplier().trim().length > 0
  );

  // ── Save payload (caller persists via recordGoodsReceipt) ──

  const buildLines = (): GoodsReceiptLineInput[] =>
    items.map((i) => ({
      qty: i.qty,
      targetId: i.targetId,
      targetType: i.targetType,
      unitCostMinorUnits:
        i.costPrice > 0 ? Math.round(i.costPrice * 100) : null,
    }));

  return {
    // Signals (read)
    items,
    supplier,
    po,
    canSave,
    totalQty,
    totalCost,
    pickerOpen,
    pickerSearch,
    isNotFound,
    hasPickableItems,
    available,
    // Signals (write)
    setSupplier,
    setPo,
    setPickerOpen,
    setPickerSearch,
    // Actions
    addItem,
    removeItem,
    handleCostPriceChange,
    handleSubtotalChange,
    handleQtyChange,
    buildLines,
    // Lookups
    productName,
    productUnit,
    productStock,
  };
}
