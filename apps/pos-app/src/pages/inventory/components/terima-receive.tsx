import { createMemo, createSignal, For } from "solid-js";
import { Button } from "~/components/ui/button";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { Sheet } from "~/components/ui/sheet";
import { products } from "~/lib/data/catalog";
import { currentStock } from "~/lib/inventory/store";
import { nextReceiptNumber, receiptRef } from "~/lib/inventory/terima";
import { formatRupiah } from "~/lib/utils";

interface LineItem {
  readonly costPrice: number;
  readonly productId: number;
  readonly qty: number;
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

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function TerimaReceive(props: TerimaReceiveProps) {
  const ref = receiptRef(nextReceiptNumber());
  const [note, setNote] = createSignal("");
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [po, setPo] = createSignal("");
  const [supplier, setSupplier] = createSignal("");
  const [items, setItems] = createSignal<LineItem[]>([]);

  const addProduct = (productId: number) => {
    setItems((prev) =>
      prev.some((i) => i.productId === productId)
        ? prev
        : [...prev, { costPrice: 0, productId, qty: 1 }]
    );
    setPickerOpen(false);
  };

  const updateItem = (productId: number, patch: Partial<LineItem>) =>
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, ...patch } : i))
    );
  const removeItem = (productId: number) =>
    setItems((prev) => prev.filter((i) => i.productId !== productId));

  const totalQty = createMemo(() => items().reduce((s, i) => s + i.qty, 0));
  const totalCost = createMemo(() =>
    items().reduce((s, i) => s + i.qty * i.costPrice, 0)
  );
  const canSave = createMemo(() => items().length > 0);

  const productName = (id: number) =>
    products.find((p) => p.id === id)?.name ?? "—";
  const productUnit = (id: number) =>
    products.find((p) => p.id === id)?.unit ?? "";
  const available = () =>
    products.filter((p) => !items().some((i) => i.productId === p.id));

  const handleSave = () =>
    props.onConfirm({
      ref,
      supplier: supplier().trim() || undefined,
      note:
        [po().trim(), note().trim()].filter(Boolean).join(" · ") || undefined,
      items: items().map((i) => ({
        productId: i.productId,
        qty: i.qty,
        costPrice: i.costPrice,
      })),
    });

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center justify-between border-border border-b px-4 py-3 lg:px-6">
        <button
          class="font-medium text-body-sm text-muted-foreground"
          onClick={props.onCancel}
          type="button"
        >
          ✕
        </button>
        <span class="font-semibold text-body-sm text-foreground">
          Terima Barang {ref}
        </span>
        <span class="w-4" />
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
        <div class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label class="flex flex-col gap-1">
            <span class="font-medium text-caption-sm text-muted-foreground">
              Supplier
            </span>
            <input
              class="h-10 rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary"
              onInput={(e) => setSupplier(e.currentTarget.value)}
              placeholder="Toko Kopi Maju Jaya"
              type="text"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-medium text-caption-sm text-muted-foreground">
              No. PO (opsional)
            </span>
            <input
              class="h-10 rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary"
              onInput={(e) => setPo(e.currentTarget.value)}
              placeholder="PO-2026-0042"
              type="text"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-medium text-caption-sm text-muted-foreground">
              Tanggal
            </span>
            <input
              class="h-10 rounded-md border border-border bg-card px-3 text-body-sm outline-none"
              disabled
              type="text"
              value={DATE_FMT.format(new Date())}
            />
          </label>
        </div>

        <div class="overflow-hidden rounded-xl border border-border">
          <For
            each={items()}
            fallback={
              <p class="p-4 text-center text-body-sm text-muted-foreground">
                Belum ada item. Ketuk “Tambah item”.
              </p>
            }
          >
            {(it) => (
              <div class="border-border border-b p-3 last:border-b-0">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-semibold text-body-sm text-foreground">
                      {productName(it.productId)}
                    </p>
                    <p class="text-caption-sm text-faint-foreground">
                      stok saat ini: {currentStock(it.productId)}{" "}
                      {productUnit(it.productId)}
                    </p>
                  </div>
                  <button
                    class="text-caption-sm text-danger"
                    onClick={() => removeItem(it.productId)}
                    type="button"
                  >
                    ✕ hapus
                  </button>
                </div>
                <div class="mt-2 flex items-center gap-3">
                  <QuantityStepper
                    ariaLabel={`Qty ${productName(it.productId)}`}
                    editable
                    onDecrement={() =>
                      updateItem(it.productId, {
                        qty: Math.max(1, it.qty - 1),
                      })
                    }
                    onIncrement={() =>
                      updateItem(it.productId, { qty: it.qty + 1 })
                    }
                    onInput={(v) =>
                      updateItem(it.productId, { qty: Math.max(1, v) })
                    }
                    value={it.qty}
                  />
                  <label class="flex flex-1 items-center gap-1.5">
                    <span class="text-caption-sm text-muted-foreground">
                      Harga beli
                    </span>
                    <input
                      class="h-9 flex-1 rounded-md border border-border bg-muted px-2 text-right text-body-sm tabular-nums outline-none focus:border-primary"
                      inputMode="numeric"
                      onInput={(e) =>
                        updateItem(it.productId, {
                          costPrice:
                            Number.parseInt(e.currentTarget.value, 10) || 0,
                        })
                      }
                      placeholder="0"
                      type="number"
                      value={it.costPrice || ""}
                    />
                  </label>
                  <span class="w-24 text-right font-semibold text-body-sm text-foreground tabular-nums">
                    {formatRupiah(it.qty * it.costPrice)}
                  </span>
                </div>
              </div>
            )}
          </For>
        </div>

        <button
          class="mt-2 w-full rounded-xl border-2 border-border border-dashed py-2.5 font-medium text-body-sm text-muted-foreground hover:border-primary/30"
          onClick={() => setPickerOpen(true)}
          type="button"
        >
          ➕ Tambah item dari katalog
        </button>

        <label class="mt-3 block">
          <span class="font-medium text-caption-sm text-muted-foreground">
            Catatan
          </span>
          <input
            class="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary"
            onInput={(e) => setNote(e.currentTarget.value)}
            type="text"
          />
        </label>
      </div>

      <div class="flex shrink-0 items-center justify-between border-border border-t px-4 py-3 lg:px-6">
        <div class="font-medium text-body-sm">
          <span class="text-muted-foreground">{totalQty()} item · </span>
          <span class="text-foreground tabular-nums">
            {formatRupiah(totalCost())}
          </span>
        </div>
        <div class="flex gap-2">
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

      {/* Product picker */}
      <Sheet onOpenChange={setPickerOpen} open={pickerOpen()}>
        {() => (
          <div class="max-h-[60vh] overflow-y-auto p-2">
            <For
              each={available()}
              fallback={
                <p class="p-4 text-center text-body-sm text-muted-foreground">
                  Semua produk sudah ditambahkan
                </p>
              }
            >
              {(p) => (
                <button
                  class="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-muted"
                  onClick={() => addProduct(p.id)}
                  type="button"
                >
                  <div>
                    <p class="font-semibold text-body-sm text-foreground">
                      {p.name}
                    </p>
                    <p class="text-caption-sm text-faint-foreground">
                      {p.sku} · {formatRupiah(p.price)}
                    </p>
                  </div>
                  <span class="text-primary">＋</span>
                </button>
              )}
            </For>
          </div>
        )}
      </Sheet>
    </div>
  );
}
