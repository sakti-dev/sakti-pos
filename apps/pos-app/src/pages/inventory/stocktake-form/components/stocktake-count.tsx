import { createMemo, createSignal, For, Show } from "solid-js";
import { SearchBar } from "~/components/search-bar";
import { Button } from "~/components/ui/button";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { products } from "~/lib/data/catalog";
import { cn, formatRupiah } from "~/lib/utils";
import { ingredients } from "../../components/lib/ingredients";
import { currentStock } from "../../components/lib/store";
import {
  nextStocktakeNumber,
  stocktakeRef,
  type VarianceRow,
  varianceRows,
  varianceValue,
} from "../lib/stocktake";

export interface StocktakeCountProps {
  readonly onCancel: () => void;
  readonly onConfirm: (
    ref: string,
    reason: string,
    rows: VarianceRow[]
  ) => void;
  readonly scope: "bahan" | "jualan";
}

export function StocktakeCount(props: StocktakeCountProps) {
  const opnum = nextStocktakeNumber();
  const ref = stocktakeRef(opnum);

  const [counts, setCounts] = createSignal<Record<number, number>>({});
  const [touched, setTouched] = createSignal<Set<number>>(new Set());
  const [reason, setReason] = createSignal("");
  const [search, setSearch] = createSignal("");

  const increment = (id: number) => {
    const current = counts()[id] ?? 0;
    const next = current + 1;
    setCounts((prev) => ({ ...prev, [id]: next }));
    setTouched((prev) => new Set(prev).add(id));
  };

  const decrement = (id: number) => {
    const current = counts()[id] ?? 0;
    const next = Math.max(0, current - 1);
    setCounts((prev) => ({ ...prev, [id]: next }));
    setTouched((prev) => new Set(prev).add(id));
  };

  const countedList = createMemo(() =>
    Object.entries(counts())
      .filter(([id]) => touched().has(Number(id)))
      .map(([id, c]) => ({ productId: Number(id), counted: c }))
  );

  const rows = createMemo(() => varianceRows(countedList()));
  const totalDiff = createMemo(() => rows().reduce((s, r) => s + r.diff, 0));
  const totalValue = createMemo(() => varianceValue(rows()));
  const withVariance = createMemo(() => rows().filter((r) => r.diff !== 0));

  const scopeItems = createMemo(() =>
    props.scope === "bahan"
      ? ingredients.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          unit: i.unit,
          category: i.category ?? "",
          price: 0,
        }))
      : products
          .filter((p) => p.isRetail)
          .map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            unit: p.unit,
            category: p.category,
            price: p.price,
          }))
  );

  const filteredItems = createMemo(() => {
    const q = search().toLowerCase().trim();
    const items = scopeItems();
    if (!q) {
      return items;
    }
    return items.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  });

  const progress = createMemo(() => {
    const total = scopeItems().length;
    const done = touched().size;
    return { done, total };
  });

  const canConfirm = createMemo(
    () => reason().trim().length > 0 && countedList().length > 0
  );

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* Description */}
      <div class="px-4 pt-3 lg:px-6">
        <p class="text-body-sm text-muted-foreground">
          {props.scope === "jualan"
            ? "Hitung jumlah fisik barang jualan jadi yang ada di etalase depan."
            : "Hitung jumlah fisik bahan baku yang ada di gudang dapur."}
        </p>
      </div>

      {/* Search */}
      <div class="mt-3 px-4 lg:px-6">
        <SearchBar
          onInput={setSearch}
          placeholder="Cari nama barang atau SKU..."
          value={search()}
        />
      </div>

      {/* ── Desktop Table ─────────────────────────────────── */}
      <div class="scrollbar-none hidden flex-1 overflow-y-auto px-4 pt-3 md:block lg:px-6">
        <div class="@container overflow-hidden rounded-lg border border-border">
          <table class="w-full table-fixed">
            <colgroup>
              <col />
              <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
              <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
              <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
            </colgroup>
            <thead>
              <tr class="bg-muted/50 text-left">
                <th class="px-4 py-2 font-medium text-caption-sm text-muted-foreground uppercase tracking-wide">
                  Nama Barang
                </th>
                <th class="px-3 py-2 text-center font-medium text-caption-sm text-muted-foreground uppercase tracking-wide">
                  Stok Tercatat
                </th>
                <th class="px-3 py-2 text-center font-medium text-caption-sm text-muted-foreground uppercase tracking-wide">
                  Hasil Hitung
                </th>
                <th class="px-3 py-2 text-center font-medium text-caption-sm text-muted-foreground uppercase tracking-wide">
                  Selisih
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={filteredItems()}>
                {(p) => {
                  const system = () => currentStock(p.id);
                  const counted = () => counts()[p.id] ?? 0;
                  const wasTouched = () => touched().has(p.id);
                  const diff = () =>
                    wasTouched() ? counted() - system() : null;

                  return (
                    <tr class="border-border border-b last:border-b-0">
                      <td class="px-4 py-2.5">
                        <p class="truncate font-medium text-body-sm text-foreground">
                          {p.name}
                        </p>
                        <p class="text-caption-sm text-faint-foreground">
                          {p.sku}
                        </p>
                      </td>
                      <td class="px-3 py-2.5 text-center font-medium text-body-sm text-muted-foreground tabular-nums">
                        {system()}{" "}
                        <span class="text-caption text-faint-foreground">
                          {p.unit}
                        </span>
                      </td>
                      <td class="px-3 py-2.5">
                        <div class="flex items-center gap-1.5">
                          <QuantityStepper
                            ariaLabel={p.name}
                            editable
                            onDecrement={() => decrement(p.id)}
                            onIncrement={() => increment(p.id)}
                            onInput={(v) => {
                              setCounts((prev) => ({ ...prev, [p.id]: v }));
                            }}
                            placeholder="—"
                            value={counted()}
                          />
                          <span class="shrink-0 text-caption text-faint-foreground">
                            {p.unit}
                          </span>
                        </div>
                      </td>
                      <td class="px-3 py-2.5">
                        <DeltaBadge diff={diff()} unit={p.unit} />
                      </td>
                    </tr>
                  );
                }}
              </For>
              <Show when={filteredItems().length === 0}>
                <tr>
                  <td
                    class="px-4 py-8 text-center text-body-sm text-faint-foreground"
                    colspan={4}
                  >
                    {search()
                      ? "Tidak ada barang yang cocok."
                      : "Belum ada data."}
                  </td>
                </tr>
              </Show>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile List ────────────────────────────────────── */}
      <div class="scrollbar-none block flex-1 overflow-y-auto px-4 pt-3 md:hidden">
        <For each={filteredItems()}>
          {(p) => {
            const system = () => currentStock(p.id);
            const counted = () => counts()[p.id] ?? 0;
            const wasTouched = () => touched().has(p.id);
            const diff = () => (wasTouched() ? counted() - system() : null);

            return (
              <div class="flex items-start gap-3 border-border border-b py-3">
                {/* Left: name + meta */}
                <div class="min-w-0 flex-1 pt-0.5">
                  <p class="truncate font-medium text-body-sm text-foreground">
                    {p.name}
                  </p>
                  <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-body-sm text-muted-foreground">
                    <span>
                      Stok Tercatat: {system()} {p.unit}
                    </span>
                    <Show when={wasTouched()}>
                      <span>· </span>
                      <DeltaInline diff={diff()} unit={p.unit} />
                    </Show>
                  </div>
                </div>

                {/* Right: stepper */}
                <div class="w-32 shrink-0">
                  <QuantityStepper
                    ariaLabel={p.name}
                    editable
                    onDecrement={() => decrement(p.id)}
                    onIncrement={() => increment(p.id)}
                    onInput={(v) => {
                      setCounts((prev) => ({ ...prev, [p.id]: v }));
                    }}
                    placeholder="—"
                    value={counted()}
                  />
                </div>
              </div>
            );
          }}
        </For>

        <Show when={filteredItems().length === 0}>
          <div class="py-8 text-center text-body-sm text-faint-foreground">
            {search() ? "Tidak ada barang yang cocok." : "Belum ada data."}
          </div>
        </Show>
      </div>

      {/* ── Sticky Footer ──────────────────────────────────── */}
      <div class="shrink-0 space-y-2.5 border-border border-t bg-card px-4 py-3 lg:px-6">
        {/* Progress */}
        <div class="flex items-center justify-between text-caption-sm text-muted-foreground">
          <span>
            {progress().done} / {progress().total} dihitung
          </span>
          <Show when={withVariance().length > 0}>
            <span>
              {withVariance().length} ada selisih ·{" "}
              <span
                class={cn("font-semibold tabular-nums", diffColor(totalDiff()))}
              >
                {formatRupiah(totalValue())}
              </span>
            </span>
          </Show>
        </div>

        {/* Reason */}
        <input
          class="h-10 w-full rounded-md border border-border bg-muted px-3 text-body-sm outline-none transition-colors duration-150 focus:border-primary"
          onInput={(e) => setReason(e.currentTarget.value)}
          placeholder="Alasan opname (wajib)..."
          type="text"
          value={reason()}
        />

        {/* Warning */}
        <p class="text-caption-sm text-faint-foreground">
          Stok akan disesuaikan berdasarkan hasil hitung fisik. Tindakan ini
          tidak bisa dibatalkan.
        </p>

        {/* Actions */}
        <div class="flex justify-end gap-2">
          <Button
            look="ghost"
            onClick={props.onCancel}
            tone="neutral"
            type="button"
          >
            Batal
          </Button>
          <Button
            disabled={!canConfirm()}
            look="solid"
            onClick={() => props.onConfirm(ref, reason().trim(), rows())}
            tone="primary"
            type="button"
          >
            Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────── */

function diffColor(diff: number): string {
  if (diff < 0) {
    return "text-status-danger";
  }
  if (diff > 0) {
    return "text-status-success";
  }
  return "text-faint-foreground";
}

function diffBadgeColor(diff: number): string {
  if (diff < 0) {
    return "bg-status-danger/10 text-status-danger";
  }
  if (diff > 0) {
    return "bg-status-success/10 text-status-success";
  }
  return "text-faint-foreground";
}

function formatCount(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function DeltaBadge(props: { diff: number | null; unit: string }) {
  return (
    <div class="flex items-center justify-center">
      <Show
        fallback={<span class="text-caption-sm text-faint-foreground">—</span>}
        when={props.diff !== null}
      >
        <span
          class={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold text-caption-sm normal-case tabular-nums",
            diffBadgeColor(props.diff!)
          )}
        >
          {props.diff! === 0
            ? "—"
            : `${props.diff! > 0 ? "+" : ""}${formatCount(props.diff!)} ${props.unit}`}
        </span>
      </Show>
    </div>
  );
}

function DeltaInline(props: { diff: number | null; unit: string }) {
  return (
    <Show fallback={<span>· Selisih: —</span>} when={props.diff !== null}>
      <span class={cn("tabular-nums", diffColor(props.diff!))}>
        Selisih:{" "}
        {props.diff! === 0
          ? "—"
          : `${props.diff! > 0 ? "+" : ""}${formatCount(props.diff!)} ${props.unit}`}
      </span>
    </Show>
  );
}
