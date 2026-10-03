import { createMemo, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { toast } from "solid-sonner";
import {
  createIngredientFromReceipt,
  type IngredientInput,
} from "~/db/ingredients";
import {
  getIngredientStockList,
  getProductStockList,
  type StockTargetType,
} from "~/db/inventory";
import { createLogger } from "~/lib/utils";

const receiptLogger = createLogger({
  domain: "INVENTORY",
  module: "goods-receipt",
});

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
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newUnit, setNewUnit] = createSignal("Pcs/Sachet");
  const [newCategory, setNewCategory] = createSignal("");

  const ingredientQuery = useDrizzleQuery(
    ["drizzle", "inventory", "ingredient-stock-list"],
    () => getIngredientStockList()
  );
  const productQuery = useDrizzleQuery(
    ["drizzle", "inventory", "product-stock-list"],
    () => getProductStockList()
  );

  // ── Item CRUD ──

  const findIndex = (id: string) => items.findIndex((i) => i.targetId === id);

  const addItem = (pick: PickableItem) => {
    if (findIndex(pick.id) >= 0) {
      return;
    }
    setItems(items.length, createBlankItem(pick.id, pick.targetType));
    setPickerOpen(false);
    setPickerSearch("");
    setShowCreateForm(false);
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

  const allPickable = createMemo<PickableItem[]>(() => [
    ...(ingredientQuery.data() ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      onHandQty: i.onHandQty,
      tracked: i.tracked,
      unit: i.unit,
      isIngredient: true,
      targetType: "ingredient" as const,
    })),
    ...(productQuery.data() ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      onHandQty: p.onHandQty,
      tracked: p.tracked,
      unit: p.unit,
      isIngredient: false,
      targetType: "product" as const,
    })),
  ]);

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

  // ── Create bahan baku inline ──

  const canCreate = createMemo(() => newName().trim().length > 0);

  const handleCreate = () => {
    const name = newName().trim();
    receiptLogger.info("receipt_create_tapped", {
      category: newCategory(),
      name,
      unit: newUnit(),
    });
    if (!name) {
      receiptLogger.warn("receipt_create_blocked", {
        reason: "empty name — button should have been disabled",
      });
      return;
    }
    const input: IngredientInput = {
      category: newCategory(),
      name,
      sku: null,
      unit: newUnit(),
    };
    createIngredientFromReceipt(input)
      .then((created) => {
        receiptLogger.info("receipt_item_added", { id: created.id });
        addItem({
          id: created.id,
          isIngredient: true,
          name: created.name,
          onHandQty: 0,
          tracked: true,
          targetType: "ingredient",
          unit: created.unit,
        });
        ingredientQuery.refetch();
        setNewName("");
        setNewUnit("Pcs/Sachet");
        setNewCategory("");
      })
      .catch((error: unknown) => {
        receiptLogger.error("receipt_create_failed", error);
        toast.error(
          error instanceof Error ? error.message : "Gagal menambah bahan"
        );
      });
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
    showCreateForm,
    newName,
    newUnit,
    newCategory,
    isNotFound,
    hasPickableItems,
    available,
    canCreate,
    // Signals (write)
    setSupplier,
    setPo,
    setPickerOpen,
    setPickerSearch,
    setShowCreateForm,
    setNewName,
    setNewUnit,
    setNewCategory,
    // Actions
    addItem,
    removeItem,
    handleCostPriceChange,
    handleSubtotalChange,
    handleQtyChange,
    handleCreate,
    buildLines,
    // Lookups
    productName,
    productUnit,
    productStock,
  };
}
