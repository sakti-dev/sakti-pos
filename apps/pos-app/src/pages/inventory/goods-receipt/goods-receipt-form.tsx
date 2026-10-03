import { FiPackage, FiPlus, FiSearch, FiTrash2 } from "solid-icons/fi";
import { createSignal, For, Show } from "solid-js";
import { PickerField } from "~/components/picker-field";
import { Button } from "~/components/ui/button";
import { DrawerRoot } from "~/components/ui/drawer";
import {
  NumberField,
  NumberFieldInput,
  NumberFieldLabel,
} from "~/components/ui/number-field";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { getIngredientCategories } from "~/db/ingredients";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { cn, createLogger, formatRupiah } from "~/lib/utils";
import { displaySubtotal } from "./receipts";
import {
  type GoodsReceiptLineInput,
  useGoodsReceipt,
} from "./use-goods-receipt";

const formLogger = createLogger({
  domain: "INVENTORY",
  module: "goods-receipt-form",
});

const UNIT_OPTIONS = ["Pcs/Sachet", "Kg", "Gram", "Liter"] as const;

interface GoodsReceiptFormProps {
  readonly onCancel: () => void;
  readonly onConfirm: (
    lines: readonly GoodsReceiptLineInput[],
    meta: { note: string | null; supplierName: string }
  ) => void;
}

export function GoodsReceiptForm(props: GoodsReceiptFormProps) {
  const form = useGoodsReceipt();

  const categoriesQuery = useDrizzleQuery(
    ["drizzle", "ingredients", "categories"],
    () => getIngredientCategories()
  );
  /** Categories created inline this session — kept until a saved bahan
      row carries them into the distinct list. */
  const [extraCategories, setExtraCategories] = createSignal<readonly string[]>(
    []
  );
  const categoryOptions = () => {
    const base = categoriesQuery.data() ?? [];
    return [...new Set([...base, ...extraCategories()])].map((c) => ({
      label: c,
      value: c,
    }));
  };

  /** Picker list empty-state copy by context (null = render nothing). */
  const listEmptyMessage = (): string | null => {
    if (!form.hasPickableItems()) {
      return "Belum ada bahan baku — ketik nama untuk mendaftarkan yang baru";
    }
    if (form.pickerSearch().trim().length > 0) {
      /* Typed query with no matches: the create row above is the
         natural next step — no extra message needed. */
      return null;
    }
    return "Semua bahan sudah ditambahkan ke nota ini";
  };

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
                        {form.productName(it.targetId)}
                      </p>
                      <p class="mt-0.5 text-caption text-faint-foreground">
                        {form.productUnit(it.targetId)} ·{" "}
                        {form.productStock(it.targetId) === null
                          ? "mulai lacak dengan penerimaan ini"
                          : `Stok Sekarang: ${form.productStock(it.targetId)}`}
                      </p>
                    </div>
                    <button
                      class="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-caption text-danger transition-colors hover:bg-danger/10"
                      onClick={() => form.removeItem(it.targetId)}
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
                        ariaLabel={`Qty ${form.productName(it.targetId)}`}
                        class="w-full"
                        editable
                        onDecrement={() =>
                          form.handleQtyChange(
                            it.targetId,
                            Math.max(1, it.qty - 1)
                          )
                        }
                        onIncrement={() =>
                          form.handleQtyChange(it.targetId, it.qty + 1)
                        }
                        onInput={(v) =>
                          form.handleQtyChange(it.targetId, Math.max(1, v))
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
                          ariaLabel={`Harga beli ${form.productName(it.targetId)}`}
                          class="h-9 w-full rounded-md border border-input bg-background pr-3 pl-8 text-right font-sans text-body-sm text-foreground tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                          onChange={(v) =>
                            form.handleCostPriceChange(it.targetId, v)
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
                          ariaLabel={`Subtotal ${form.productName(it.targetId)}`}
                          class={cn(
                            "h-9 w-full rounded-md border border-input bg-background pr-3 pl-8 text-right font-sans text-body-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus:border-primary",
                            displaySubtotal(it) > 0
                              ? "font-semibold text-foreground"
                              : "text-faint-foreground"
                          )}
                          onChange={(v) =>
                            form.handleSubtotalChange(it.targetId, v)
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
        <div class="mx-auto flex max-w-2xl flex-col gap-2.5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p class="flex items-center gap-1 text-caption text-muted-foreground">
              <FiPackage class="h-3.5 w-3.5" />
              Total Kuantitas:{" "}
              <span class="font-semibold text-foreground">
                {form.totalQty()} item
              </span>
            </p>
            <p class="flex items-center gap-1 text-caption text-muted-foreground">
              <span>💰</span>Total Nota:{" "}
              <span class="font-semibold text-foreground tabular-nums">
                {formatRupiah(form.totalCost())}
              </span>
            </p>
          </div>
          <div class="flex gap-2 lg:shrink-0">
            <Button
              class="flex-1 lg:flex-none"
              look="outline"
              onClick={props.onCancel}
              tone="neutral"
              type="button"
            >
              Batal
            </Button>
            <Button
              class="flex-1 lg:flex-none"
              disabled={!form.canSave()}
              look="solid"
              onClick={() =>
                props.onConfirm(form.buildLines(), {
                  note: form.po().trim() || null,
                  supplierName: form.supplier().trim(),
                })
              }
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
          formLogger.info("receipt_picker_open_changed", { open });
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
                    {/* Create row appears once at least one character is
                        typed: pre-filled with the query. Similar names
                        (Mie Telor vs Mie Kuning) still list below it. */}
                    <Show when={form.pickerSearch().trim().length > 0}>
                      <button
                        class="flex w-full items-center gap-3 border-border border-b bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
                        onClick={() => {
                          formLogger.info("receipt_register_tapped", {
                            search: form.pickerSearch().trim(),
                          });
                          form.setNewName(form.pickerSearch().trim());
                          form.setShowCreateForm(true);
                          formLogger.info("receipt_create_form_requested", {
                            showCreateForm: form.showCreateForm(),
                          });
                        }}
                        type="button"
                      >
                        <span class="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                          <FiPlus class="h-4 w-4" />
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="block truncate font-semibold text-body-sm text-foreground">
                            Daftarkan &ldquo;{form.pickerSearch().trim()}
                            &rdquo; sebagai bahan baku baru
                          </span>
                        </span>
                      </button>
                    </Show>
                    <For
                      each={form.available()}
                      fallback={
                        <Show when={listEmptyMessage()}>
                          {(msg) => (
                            <p class="px-4 py-6 text-center text-caption text-faint-foreground">
                              {msg()}
                            </p>
                          )}
                        </Show>
                      }
                    >
                      {(p) => (
                        <button
                          class="flex w-full items-center justify-between border-border border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted"
                          onClick={() => form.addItem(p)}
                          type="button"
                        >
                          <p class="min-w-0 flex-1 font-semibold text-body-sm text-foreground">
                            {p.isIngredient ? "🥕" : "🛒"} {p.name}{" "}
                            <span class="text-faint-foreground">
                              ({p.unit})
                            </span>
                          </p>
                          <FiPlus class="ml-3 h-5 w-5 shrink-0 text-primary" />
                        </button>
                      )}
                    </For>
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
                <div class="flex flex-col gap-1">
                  <span class="font-medium text-caption text-muted-foreground">
                    Kategori{" "}
                    <span class="text-faint-foreground">(Opsional)</span>
                  </span>
                  <PickerField
                    onChange={form.setNewCategory}
                    onCreate={(query) => {
                      setExtraCategories([
                        ...new Set([...extraCategories(), query]),
                      ]);
                      return query;
                    }}
                    options={categoryOptions()}
                    placeholder="Pilih atau ketik kategori baru"
                    title="Kategori"
                    value={form.newCategory()}
                  />
                </div>
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
