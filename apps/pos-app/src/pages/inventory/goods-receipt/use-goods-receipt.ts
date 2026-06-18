import { createMemo, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { products } from "~/lib/data/catalog";
import { addIngredient, ingredients } from "../components/lib/ingredients";
import { createBlankItem, type SyncableItem } from "./receipts";

// ── Types ──

export interface PickableItem {
  readonly id: number;
  readonly isIngredient: boolean;
  readonly name: string;
  readonly sku: string;
  readonly unit: string;
}

export interface GoodsReceiptConfirmInput {
  readonly items: { costPrice: number; productId: number; qty: number }[];
  readonly note?: string;
  readonly ref: string;
  readonly supplier?: string;
}

// ── Hook ──

export function useGoodsReceipt(ref: string) {
  const [supplier, setSupplier] = createSignal("");
  const [po, setPo] = createSignal("");
  const [items, setItems] = createStore<SyncableItem[]>([]);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerSearch, setPickerSearch] = createSignal("");
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newUnit, setNewUnit] = createSignal("Pcs/Sachet");
  const [newCategory, setNewCategory] = createSignal("Bumbu & Bahan Dapur");

  // ── Item CRUD ──

  const findIndex = (productId: number) =>
    items.findIndex((i) => i.productId === productId);

  const addProduct = (productId: number) => {
    if (findIndex(productId) >= 0) {
      return;
    }
    setItems(items.length, createBlankItem(productId));
    setPickerOpen(false);
    setPickerSearch("");
    setShowCreateForm(false);
  };

  const patchItem = (productId: number, patch: Partial<SyncableItem>) => {
    const idx = findIndex(productId);
    if (idx < 0) {
      return;
    }
    setItems(idx, patch);
  };

  const removeItem = (productId: number) => {
    const idx = findIndex(productId);
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

  const handleCostPriceChange = (productId: number, value: number) => {
    patchItem(productId, {
      costPrice: value,
      sourceField: "costPrice",
      subtotalValue: 0,
    });
  };

  const handleSubtotalChange = (productId: number, value: number) => {
    const idx = findIndex(productId);
    if (idx < 0) {
      return;
    }
    const it = items[idx];
    if (it.qty === 0) {
      return;
    }
    patchItem(productId, {
      costPrice: Math.round(value / it.qty),
      sourceField: "subtotal",
      subtotalValue: value,
    });
  };

  const handleQtyChange = (productId: number, newQty: number) => {
    const idx = findIndex(productId);
    if (idx < 0) {
      return;
    }
    const it = items[idx];
    const patch: Partial<SyncableItem> = { qty: newQty };
    if (it.sourceField === "subtotal" && newQty > 0) {
      patch.costPrice = Math.round(it.subtotalValue / newQty);
    }
    patchItem(productId, patch);
  };

  // ── Product lookups (products + ingredients) ──

  const productName = (id: number) => {
    const p = products.find((pr) => pr.id === id);
    if (p) {
      return p.name;
    }
    return ingredients.find((i) => i.id === id)?.name ?? "—";
  };
  const productSku = (id: number) => {
    const p = products.find((pr) => pr.id === id);
    if (p) {
      return p.sku;
    }
    return ingredients.find((i) => i.id === id)?.sku ?? "";
  };
  const productUnit = (id: number) => {
    const p = products.find((pr) => pr.id === id);
    if (p) {
      return p.unit;
    }
    return ingredients.find((i) => i.id === id)?.unit ?? "";
  };

  // ── Picker: only ingredients + retail products ──

  const allPickable = (): PickableItem[] => [
    ...ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      unit: i.unit,
      isIngredient: true,
    })),
    ...products
      .filter((p) => p.isRetail)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        isIngredient: false,
      })),
  ];

  const hasPickableItems = createMemo(() => allPickable().length > 0);

  const isNotFound = createMemo(() => {
    const q = pickerSearch().trim();
    if (q.length === 0) {
      return false;
    }
    const ql = q.toLowerCase();
    return allPickable().every(
      (p) =>
        !(p.name.toLowerCase().includes(ql) || p.sku.toLowerCase().includes(ql))
    );
  });

  const available = () => {
    const q = pickerSearch().toLowerCase().trim();
    return allPickable().filter(
      (p) =>
        !items.some((i) => i.productId === p.id) &&
        (q.length === 0 ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q))
    );
  };

  // ── Create bahan baku (adds to ingredients store) ──

  const canCreate = createMemo(() => newName().trim().length > 0);

  const handleCreate = () => {
    const name = newName().trim();
    if (!name) {
      return;
    }
    const ing = addIngredient({
      name,
      unit: newUnit(),
      category: newCategory(),
    });
    addProduct(ing.id);
    setNewName("");
    setNewUnit("Pcs/Sachet");
    setNewCategory("Bumbu & Bahan Dapur");
  };

  // ── Derived state ──

  const totalQty = createMemo(() => items.reduce((s, i) => s + i.qty, 0));
  const totalCost = createMemo(() =>
    items.reduce((s, i) => s + i.qty * i.costPrice, 0)
  );
  const canSave = createMemo(
    () => items.length > 0 && supplier().trim().length > 0
  );

  // ── Save ──

  const buildConfirmInput = (): GoodsReceiptConfirmInput => ({
    ref,
    supplier: supplier().trim() || undefined,
    note: po().trim() || undefined,
    items: items.map((i) => ({
      productId: i.productId,
      qty: i.qty,
      costPrice: i.costPrice,
    })),
  });

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
    addProduct,
    removeItem,
    handleCostPriceChange,
    handleSubtotalChange,
    handleQtyChange,
    handleCreate,
    buildConfirmInput,
    // Lookups
    productName,
    productSku,
    productUnit,
  };
}
