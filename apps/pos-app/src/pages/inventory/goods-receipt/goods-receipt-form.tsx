import { FiPackage, FiPlus, FiSearch, FiTrash2 } from "solid-icons/fi";
import { For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { DrawerRoot } from "~/components/ui/drawer";
import {
  NumberField,
  NumberFieldInput,
  NumberFieldLabel,
} from "~/components/ui/number-field";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { cn, formatRupiah } from "~/lib/utils";
import { currentStock } from "../components/lib/store";
import { displaySubtotal, nextReceiptNumber, receiptRef } from "./receipts";
import {
  type GoodsReceiptConfirmInput,
  useGoodsReceipt,
} from "./use-goods-receipt";

const UNIT_OPTIONS = ["Pcs/Sachet", "Kg", "Gram", "Liter"] as const;

interface GoodsReceiptFormProps {
  readonly onCancel: () => void;
  readonly onConfirm: (input: GoodsReceiptConfirmInput) => void;
}

export function GoodsReceiptForm(props: GoodsReceiptFormProps) {
  const ref = receiptRef(nextReceiptNumber());
  const form = useGoodsReceipt(ref);

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
                onInput={(e) => form.setSupplier(e.currentTarget.value)}
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
                onInput={(e) => form.setPo(e.currentTarget.value)}
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
              each={form.items}
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
                        {form.productName(it.productId)}
                      </p>
                      <p class="mt-0.5 text-caption text-faint-foreground">
                        {form.productSku(it.productId)} · Stok Sekarang:{" "}
                        {currentStock(it.productId)}{" "}
                        {form.productUnit(it.productId)}
                      </p>
                    </div>
                    <button
                      class="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-caption text-danger transition-colors hover:bg-danger/10"
                      onClick={() => form.removeItem(it.productId)}
                      type="button"
                    >
                      <FiTrash2 class="h-3.5 w-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>

                  {/* Row 2: Qty + Price + Subtotal */}
                  <div class="mt-3 grid grid-cols-[130px_1fr_1fr] items-end gap-3">
                    <div class="flex flex-col gap-1">
                      <span class="font-medium text-caption text-muted-foreground">
                        Qty Beli
                      </span>
                      <QuantityStepper
                        ariaLabel={`Qty ${form.productName(it.productId)}`}
                        class="w-full"
                        editable
                        onDecrement={() =>
                          form.handleQtyChange(
                            it.productId,
                            Math.max(1, it.qty - 1)
                          )
                        }
                        onIncrement={() =>
                          form.handleQtyChange(it.productId, it.qty + 1)
                        }
                        onInput={(v) =>
                          form.handleQtyChange(it.productId, Math.max(1, v))
                        }
                        value={it.qty}
                      />
                    </div>

                    <NumberField>
                      <NumberFieldLabel class="font-medium text-caption text-muted-foreground">
                        Harga Beli
                      </NumberFieldLabel>
                      <div class="relative">
                        <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-caption-sm text-muted-foreground">
                          Rp
                        </span>
                        <NumberFieldInput
                          ariaLabel={`Harga beli ${form.productName(it.productId)}`}
                          class="h-9 w-full rounded-md border border-input bg-background pr-3 pl-8 text-right font-sans text-body-sm text-foreground tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                          onChange={(v) =>
                            form.handleCostPriceChange(it.productId, v)
                          }
                          placeholder="0"
                          value={it.costPrice}
                        />
                      </div>
                    </NumberField>

                    <NumberField>
                      <NumberFieldLabel class="font-medium text-caption text-muted-foreground">
                        Subtotal
                      </NumberFieldLabel>
                      <div class="relative w-full">
                        <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-caption-sm text-muted-foreground">
                          Rp
                        </span>
                        <NumberFieldInput
                          ariaLabel={`Subtotal ${form.productName(it.productId)}`}
                          class={cn(
                            "h-9 w-full rounded-md border border-input bg-background pr-3 pl-8 text-right font-sans text-body-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus:border-primary",
                            displaySubtotal(it) > 0
                              ? "font-semibold text-foreground"
                              : "text-faint-foreground"
                          )}
                          onChange={(v) =>
                            form.handleSubtotalChange(it.productId, v)
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

          <button
            class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-border border-dashed py-3 font-medium text-body-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
            onClick={() => form.setPickerOpen(true)}
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
                {form.totalQty()} item
              </span>
            </p>
            <p class="flex items-center gap-1 text-caption text-muted-foreground">
              <span>💰</span>Total Nilai Nota:{" "}
              <span class="font-semibold text-foreground tabular-nums">
                {formatRupiah(form.totalCost())}
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
              disabled={!form.canSave()}
              look="solid"
              onClick={() => props.onConfirm(form.buildConfirmInput())}
              tone="primary"
              type="button"
            >
              Simpan Penerimaan
            </Button>
          </div>
        </div>
      </div>

      {/* ── Product picker drawer ── */}
      <DrawerRoot
        onOpenChange={(open) => {
          form.setPickerOpen(open);
          if (!open) {
            form.setShowCreateForm(false);
            form.setPickerSearch("");
          }
        }}
        open={form.pickerOpen()}
        side="bottom"
      >
        {() => (
          <div class="flex flex-col">
            <Show
              fallback={
                <>
                  <div class="border-border border-b px-4 py-3">
                    <h3 class="min-w-0 font-semibold text-body-sm text-foreground">
                      Pilih Bahan atau Produk
                    </h3>
                  </div>
                  <div class="border-border border-b px-4 py-2">
                    <div class="relative">
                      <FiSearch class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        class="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9 text-body-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                        onInput={(e) =>
                          form.setPickerSearch(e.currentTarget.value)
                        }
                        placeholder="Cari nama atau SKU..."
                        type="text"
                      />
                    </div>
                  </div>
                  <div class="max-h-[50vh] overflow-y-auto">
                    <Show
                      fallback={
                        <div class="flex flex-col items-center gap-3 px-4 py-8 text-center">
                          <p class="text-body-sm text-muted-foreground">
                            Belum ada bahan baku atau produk retail.
                          </p>
                          <Button
                            look="solid"
                            onClick={() => form.setShowCreateForm(true)}
                            tone="primary"
                            type="button"
                          >
                            <FiPlus class="h-4 w-4" /> Tambah Bahan Baku Baru
                          </Button>
                        </div>
                      }
                      when={form.hasPickableItems()}
                    >
                      <Show
                        fallback={
                          <For
                            each={form.available()}
                            fallback={
                              <p class="px-4 py-8 text-center text-body-sm text-muted-foreground">
                                Semua bahan sudah ditambahkan
                              </p>
                            }
                          >
                            {(p) => (
                              <button
                                class="flex w-full items-center justify-between border-border border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted"
                                onClick={() => form.addProduct(p.id)}
                                type="button"
                              >
                                <p class="min-w-0 flex-1 font-semibold text-body-sm text-foreground">
                                  {p.isIngredient ? "🥕" : "🛒"} {p.name}{" "}
                                  <span class="text-faint-foreground">
                                    ({p.sku})
                                  </span>
                                </p>
                                <FiPlus class="ml-3 h-5 w-5 shrink-0 text-primary" />
                              </button>
                            )}
                          </For>
                        }
                        when={form.isNotFound()}
                      >
                        <div class="flex flex-col items-center gap-3 px-4 py-8 text-center">
                          <p class="text-body-sm text-muted-foreground">
                            ⚠️ &ldquo;{form.pickerSearch().trim()}&rdquo; belum
                            ada di database Inventory Anda.
                          </p>
                          <Button
                            look="solid"
                            onClick={() => {
                              form.setNewName(form.pickerSearch().trim());
                              form.setShowCreateForm(true);
                            }}
                            tone="primary"
                            type="button"
                          >
                            <FiPlus class="h-4 w-4" /> Daftarkan sebagai Bahan
                            Baku Baru
                          </Button>
                        </div>
                      </Show>
                    </Show>
                  </div>
                </>
              }
              when={form.showCreateForm()}
            >
              <div class="border-border border-b px-4 py-3">
                <h3 class="font-semibold text-body-sm text-foreground">
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
                    onInput={(e) => form.setNewName(e.currentTarget.value)}
                    placeholder="Contoh: Nescafe Sachet / Cabai Rawit"
                    type="text"
                    value={form.newName()}
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
                            form.newUnit() === u
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-muted-foreground hover:border-primary/50"
                          )}
                          onClick={() => form.setNewUnit(u)}
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
                    onInput={(e) => form.setNewCategory(e.currentTarget.value)}
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
                  onClick={() => form.setShowCreateForm(false)}
                  tone="neutral"
                  type="button"
                >
                  Batal
                </Button>
                <Button
                  disabled={!form.canCreate()}
                  look="solid"
                  onClick={form.handleCreate}
                  tone="primary"
                  type="button"
                >
                  <FiPlus class="h-4 w-4" /> Tambah
                </Button>
              </div>
            </Show>
          </div>
        )}
      </DrawerRoot>
    </div>
  );
}
