import { FiPackage, FiPlus, FiSearch, FiTrash2, FiX } from "solid-icons/fi";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Button } from "~/components/ui/button";
import {
  NumberField,
  NumberFieldInput,
  NumberFieldLabel,
} from "~/components/ui/number-field";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { Sheet } from "~/components/ui/sheet";
import { products } from "~/lib/data/catalog";
import {
  createBlankItem,
  displaySubtotal,
  type SyncableItem,
} from "~/lib/inventory/item-sync";
import { currentStock } from "~/lib/inventory/store";
import { nextReceiptNumber, receiptRef } from "~/lib/inventory/terima";
import { cn, formatRupiah } from "~/lib/utils";

// ── Types ──

type LineItem = SyncableItem;

const UNIT_OPTIONS = ["Pcs/Sachet", "Kg", "Gram", "Liter"] as const;

interface CustomProduct {
  readonly category: string;
  readonly id: number;
  readonly name: string;
  readonly sku: string;
  readonly unit: string;
}

export interface TerimaConfirmInput {
  readonly items: { costPrice: number; productId: number; qty: number }[];
  readonly note?: string;
  readonly ref: string;
  readonly supplier?: string;
}

export interface TerimaReceiveProps {
  readonly onCancel: () => void;
  readonly onConfirm: (input: TerimaConfirmInput) => void;
}

// ── Component ──

export function TerimaReceive(props: TerimaReceiveProps) {
  const ref = receiptRef(nextReceiptNumber());
  const [supplier, setSupplier] = createSignal("");
  const [po, setPo] = createSignal("");
  const [items, setItems] = createStore<LineItem[]>([]);
  const findIndex = (productId: number) =>
    items.findIndex((i) => i.productId === productId);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerSearch, setPickerSearch] = createSignal("");
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [customProducts, setCustomProducts] = createSignal<CustomProduct[]>([]);
  const [newName, setNewName] = createSignal("");
  const [newUnit, setNewUnit] = createSignal("Pcs/Sachet");
  const [newCategory, setNewCategory] = createSignal("Bumbu & Bahan Dapur");
  let nextCustomId = 90_001;

  // ── Item CRUD ──

  const addProduct = (productId: number) => {
    if (findIndex(productId) >= 0) {
      return;
    }
    setItems(items.length, createBlankItem(productId));
    setPickerOpen(false);
    setPickerSearch("");
    setShowCreateForm(false);
  };

  const patchItem = (productId: number, patch: Partial<LineItem>) => {
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

  // ── Derived state ──

  const totalQty = createMemo(() => items.reduce((s, i) => s + i.qty, 0));

  const totalCost = createMemo(() =>
    items.reduce((s, i) => s + i.qty * i.costPrice, 0)
  );

  const canSave = createMemo(
    () => items.length > 0 && supplier().trim().length > 0
  );

  // ── Bidirectional price ↔ subtotal sync ──
  // Pass only CHANGED fields so SolidJS merges into existing proxy (not replace)
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
    const patch: Partial<LineItem> = { qty: newQty };
    if (it.sourceField === "subtotal" && newQty > 0) {
      patch.costPrice = Math.round(it.subtotalValue / newQty);
    }
    patchItem(productId, patch);
  };

  // ── Product lookups ──

  const findProduct = (id: number) =>
    products.find((p) => p.id === id) ??
    customProducts().find((p) => p.id === id);

  const productName = (id: number) => findProduct(id)?.name ?? "—";
  const productSku = (id: number) => findProduct(id)?.sku ?? "";
  const productUnit = (id: number) => findProduct(id)?.unit ?? "";

  // ── Picker filtering ──

  const allProducts = () => [...products, ...customProducts()];

  const isNotFound = createMemo(() => {
    const q = pickerSearch().trim();
    if (q.length === 0) {
      return false;
    }
    const ql = q.toLowerCase();
    return allProducts().every(
      (p) =>
        !(p.name.toLowerCase().includes(ql) || p.sku.toLowerCase().includes(ql))
    );
  });

  const available = () => {
    const q = pickerSearch().toLowerCase().trim();
    return allProducts().filter(
      (p) =>
        !items.some((i) => i.productId === p.id) &&
        (q.length === 0 ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q))
    );
  };

  // ── Create bahan baku ──

  const canCreate = createMemo(() => newName().trim().length > 0);

  const handleCreate = () => {
    const name = newName().trim();
    if (!name) {
      return;
    }
    const id = nextCustomId++;
    const sku = `RAW-${String(id).slice(-3)}`;
    setCustomProducts((prev) => [
      ...prev,
      { id, name, sku, unit: newUnit(), category: newCategory() },
    ]);
    addProduct(id);
    setNewName("");
    setNewUnit("Pcs/Sachet");
    setNewCategory("Bumbu & Bahan Dapur");
  };

  // ── Save handler ──

  const handleSave = () =>
    props.onConfirm({
      ref,
      supplier: supplier().trim() || undefined,
      note: po().trim() || undefined,
      items: items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        costPrice: i.costPrice,
      })),
    });

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* ── Scrollable content ── */}
      <div class="scrollbar-none flex-1 overflow-y-auto px-4 pb-40 lg:px-6">
        {/* Profil Nota */}
        <section class="space-y-3 pt-2">
          <h2 class="flex items-center gap-1.5 font-semibold text-body-sm text-muted-foreground">
            <FiPackage class="h-3.5 w-3.5" />
            Profil Nota Pembelian
          </h2>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1">
              <span class="font-medium text-caption text-muted-foreground">
                Nama Supplier <span class="text-danger">*</span>
              </span>
              <input
                class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                onInput={(e) => setSupplier(e.currentTarget.value)}
                placeholder="Toko Grosir Jaya"
                type="text"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="font-medium text-caption text-muted-foreground">
                No. Nota / PO{" "}
                <span class="text-faint-foreground">(Opsional)</span>
              </span>
              <input
                class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                onInput={(e) => setPo(e.currentTarget.value)}
                placeholder="PO-2026-06-017"
                type="text"
              />
            </label>
          </div>
        </section>

        {/* Item list */}
        <section class="mt-6">
          <h2 class="mb-3 flex items-center gap-1.5 font-semibold text-body-sm text-muted-foreground">
            <FiPackage class="h-3.5 w-3.5" />
            Item yang Dibeli
          </h2>

          <div class="space-y-2">
            <For
              each={items}
              fallback={
                <div class="flex flex-col items-center gap-1 rounded-xl border border-border border-dashed py-12 text-center">
                  <p class="text-body-sm text-muted-foreground">
                    Belum ada item
                  </p>
                  <p class="text-caption text-faint-foreground">
                    Tambahkan bahan baku atau item di bawah
                  </p>
                </div>
              }
            >
              {(it) => (
                <div class="rounded-xl border border-border bg-card p-4">
                  {/* Row 1: Name + delete */}
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold text-body-sm text-foreground">
                        {productName(it.productId)}
                      </p>
                      <p class="mt-0.5 text-caption text-faint-foreground">
                        {productSku(it.productId)} · Stok Sekarang:{" "}
                        {currentStock(it.productId)} {productUnit(it.productId)}
                      </p>
                    </div>
                    <button
                      class="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-caption text-danger transition-colors hover:bg-danger/10"
                      onClick={() => removeItem(it.productId)}
                      type="button"
                    >
                      <FiTrash2 class="h-3.5 w-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>

                  {/* Row 2: Qty + Price + Subtotal */}
                  <div class="mt-3 grid grid-cols-[130px_1fr_1fr] items-end gap-3">
                    {/* Quantity stepper */}
                    <div class="flex flex-col gap-1">
                      <span class="font-medium text-caption text-muted-foreground">
                        Qty Beli
                      </span>
                      <QuantityStepper
                        ariaLabel={`Qty ${productName(it.productId)}`}
                        editable
                        onDecrement={() =>
                          handleQtyChange(it.productId, Math.max(1, it.qty - 1))
                        }
                        onIncrement={() =>
                          handleQtyChange(it.productId, it.qty + 1)
                        }
                        onInput={(v) =>
                          handleQtyChange(it.productId, Math.max(1, v))
                        }
                        value={it.qty}
                      />
                    </div>

                    {/* Price input */}
                    <NumberField>
                      <NumberFieldLabel class="font-medium text-caption text-muted-foreground">
                        Harga Beli
                      </NumberFieldLabel>
                      <div class="relative">
                        <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-caption-sm text-muted-foreground">
                          Rp
                        </span>
                        <NumberFieldInput
                          ariaLabel={`Harga beli ${productName(it.productId)}`}
                          class="h-9 w-full rounded-md border border-input bg-background pr-3 pl-8 text-right font-sans text-body-sm text-foreground tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                          onChange={(v) =>
                            handleCostPriceChange(it.productId, v)
                          }
                          placeholder="0"
                          value={it.costPrice}
                        />
                      </div>
                    </NumberField>

                    {/* Subtotal */}
                    <NumberField class="items-end">
                      <NumberFieldLabel class="font-medium text-caption text-muted-foreground">
                        Subtotal
                      </NumberFieldLabel>
                      <div class="relative w-full">
                        <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-caption-sm text-muted-foreground">
                          Rp
                        </span>
                        <NumberFieldInput
                          ariaLabel={`Subtotal ${productName(it.productId)}`}
                          class={cn(
                            "h-9 w-full rounded-md border border-input bg-background pr-3 pl-8 text-right font-sans text-body-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus:border-primary",
                            displaySubtotal(it) > 0
                              ? "font-semibold text-foreground"
                              : "text-faint-foreground"
                          )}
                          onChange={(v) =>
                            handleSubtotalChange(it.productId, v)
                          }
                          placeholder="0"
                          value={displaySubtotal(it)}
                        />
                      </div>
                    </NumberField>
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Add item button */}
          <button
            class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-border border-dashed py-3 font-medium text-body-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            <FiPlus class="h-4 w-4" />
            Tambah Bahan Baku / Item...
          </button>
        </section>
      </div>

      {/* ── Fixed bottom bar ── */}
      <div class="fixed inset-x-0 bottom-0 z-10 border-border border-t bg-card/95 backdrop-blur-sm">
        <div class="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 lg:px-6">
          <div class="space-y-0.5">
            <p class="flex items-center gap-1 text-caption text-muted-foreground">
              <FiPackage class="h-3.5 w-3.5" />
              Total Kuantitas:{" "}
              <span class="font-semibold text-foreground">
                {totalQty()} item
              </span>
            </p>
            <p class="flex items-center gap-1 text-caption text-muted-foreground">
              <span>💰</span>Total Nilai Nota:{" "}
              <span class="font-semibold text-foreground tabular-nums">
                {formatRupiah(totalCost())}
              </span>
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <Button
              look="outline"
              onClick={props.onCancel}
              tone="neutral"
              type="button"
            >
              Batal
            </Button>
            <Button
              disabled={!canSave()}
              look="solid"
              onClick={handleSave}
              tone="primary"
              type="button"
            >
              Simpan Penerimaan
            </Button>
          </div>
        </div>
      </div>

      {/* ── Product picker sheet ── */}
      <Sheet
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) {
            setShowCreateForm(false);
            setPickerSearch("");
          }
        }}
        open={pickerOpen()}
        side="bottom"
      >
        {() => (
          <div class="flex flex-col">
            <Show
              fallback={
                <>
                  <div class="flex items-center gap-3 border-border border-b px-4 py-3">
                    <button
                      class="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setPickerOpen(false)}
                      type="button"
                    >
                      <FiX class="h-5 w-5" />
                    </button>
                    <h3 class="min-w-0 flex-1 font-semibold text-body-sm text-foreground">
                      Pilih Bahan atau Produk
                    </h3>
                  </div>
                  <div class="border-border border-b px-4 py-2">
                    <div class="relative">
                      <FiSearch class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        class="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9 text-body-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                        onInput={(e) => setPickerSearch(e.currentTarget.value)}
                        placeholder="Cari nama atau SKU..."
                        type="text"
                      />
                    </div>
                  </div>
                  <div class="max-h-[50vh] overflow-y-auto">
                    <Show
                      fallback={
                        <For
                          each={available()}
                          fallback={
                            <p class="px-4 py-8 text-center text-body-sm text-muted-foreground">
                              Semua produk sudah ditambahkan
                            </p>
                          }
                        >
                          {(p) => {
                            const isCustom = () =>
                              customProducts().some((c) => c.id === p.id);
                            return (
                              <button
                                class="flex w-full items-center justify-between border-border border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted"
                                onClick={() => addProduct(p.id)}
                                type="button"
                              >
                                <p class="min-w-0 flex-1 font-semibold text-body-sm text-foreground">
                                  {isCustom() ? "🥕" : "🛒"} {p.name}{" "}
                                  <span class="text-faint-foreground">
                                    ({p.sku})
                                  </span>
                                </p>
                                <FiPlus class="ml-3 h-5 w-5 shrink-0 text-primary" />
                              </button>
                            );
                          }}
                        </For>
                      }
                      when={isNotFound()}
                    >
                      <div class="flex flex-col items-center gap-3 px-4 py-8 text-center">
                        <p class="text-body-sm text-muted-foreground">
                          ⚠️ &ldquo;{pickerSearch().trim()}&rdquo; belum ada di
                          database Inventory Anda.
                        </p>
                        <button
                          class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 font-medium text-body-sm text-primary-foreground transition-colors hover:bg-primary-hover"
                          onClick={() => {
                            setNewName(pickerSearch().trim());
                            setShowCreateForm(true);
                          }}
                          type="button"
                        >
                          <FiPlus class="h-4 w-4" /> Daftarkan sebagai Bahan
                          Baku Baru
                        </button>
                      </div>
                    </Show>
                  </div>
                </>
              }
              when={showCreateForm()}
            >
              <div class="flex items-center gap-3 border-border border-b px-4 py-3">
                <button
                  class="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCreateForm(false)}
                  type="button"
                >
                  <FiX class="h-5 w-5" />
                </button>
                <h3 class="min-w-0 flex-1 font-semibold text-body-sm text-foreground">
                  Bahan Baku Baru
                </h3>
              </div>
              <div class="space-y-4 px-4 py-4">
                <label class="flex flex-col gap-1">
                  <span class="font-medium text-caption text-muted-foreground">
                    Nama Bahan Baru <span class="text-danger">*</span>
                  </span>
                  <input
                    class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                    onInput={(e) => setNewName(e.currentTarget.value)}
                    placeholder="Contoh: Nescafe Sachet / Cabai Rawit"
                    type="text"
                    value={newName()}
                  />
                </label>
                <div class="flex flex-col gap-1">
                  <span class="font-medium text-caption text-muted-foreground">
                    Satuan Stok <span class="text-danger">*</span>
                  </span>
                  <div class="flex flex-wrap gap-2">
                    <For each={[...UNIT_OPTIONS]}>
                      {(u) => (
                        <button
                          class={cn(
                            "rounded-full px-3 py-1.5 font-medium text-caption transition-colors",
                            newUnit() === u
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-muted-foreground hover:border-primary/50"
                          )}
                          onClick={() => setNewUnit(u)}
                          type="button"
                        >
                          {u}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <label class="flex flex-col gap-1">
                  <span class="font-medium text-caption text-muted-foreground">
                    Kategori{" "}
                    <span class="text-faint-foreground">(Opsional)</span>
                  </span>
                  <select
                    class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors focus:border-primary"
                    onInput={(e) => setNewCategory(e.currentTarget.value)}
                  >
                    <option value="Bumbu & Bahan Dapur">
                      Bumbu & Bahan Dapur
                    </option>
                    <option value="Sachet & Minuman">Sachet & Minuman</option>
                    <option value="Bumbu Kering">Bumbu Kering</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </label>
              </div>
              <div class="flex items-center justify-end gap-2 border-border border-t px-4 py-3">
                <Button
                  look="ghost"
                  onClick={() => setShowCreateForm(false)}
                  tone="neutral"
                  type="button"
                >
                  Batal
                </Button>
                <Button
                  disabled={!canCreate()}
                  look="solid"
                  onClick={handleCreate}
                  tone="primary"
                  type="button"
                >
                  <FiPlus class="h-4 w-4" /> Tambah
                </Button>
              </div>
            </Show>
          </div>
        )}
      </Sheet>
    </div>
  );
}
