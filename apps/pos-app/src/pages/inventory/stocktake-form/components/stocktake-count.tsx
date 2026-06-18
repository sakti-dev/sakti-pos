import { createMemo, createSignal, For, Show } from "solid-js";
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

type DiffState = "pending" | "match" | "small" | "big";

const diffState = (diff: number | null): DiffState => {
  if (diff === null) {
    return "pending";
  }
  if (diff === 0) {
    return "match";
  }
  if (Math.abs(diff) <= 2) {
    return "small";
  }
  return "big";
};

/** Focus the next empty counted input in DOM order (keyboard counting). */
function focusNextInput(current: HTMLInputElement) {
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[aria-label^="Dihitung "]'
    )
  );
  const idx = all.indexOf(current);
  const next = all.slice(idx + 1).find((el) => el.value === "");
  (next ?? all[idx + 1])?.focus();
}

export function StocktakeCount(props: StocktakeCountProps) {
  const opnum = nextStocktakeNumber();
  const ref = stocktakeRef(opnum);

  const [activeCat, setActiveCat] = createSignal<string>("all");
  const [counts, setCounts] = createSignal<Record<number, number | null>>({});
  const [reason, setReason] = createSignal("");

  const setCount = (id: number, raw: string) => {
    const parsed = raw === "" ? null : Number.parseInt(raw, 10);
    setCounts((prev) => ({
      ...prev,
      [id]:
        parsed !== null && Number.isFinite(parsed) ? Math.max(0, parsed) : null,
    }));
  };

  const countedList = createMemo(() =>
    Object.entries(counts())
      .filter(([, c]) => c !== null)
      .map(([id, c]) => ({ productId: Number(id), counted: c ?? 0 }))
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

  const inCat = () =>
    activeCat() === "all"
      ? scopeItems()
      : scopeItems().filter((p) => p.category === activeCat());

  const progress = createMemo(() => {
    const list = inCat();
    const done = list.filter(
      (p) => counts()[p.id] !== null && counts()[p.id] !== undefined
    ).length;
    return { done, total: list.length };
  });

  const catProgress = (catId: string) => {
    const list = scopeItems().filter((p) => p.category === catId);
    return `${list.filter((p) => counts()[p.id] != null).length}/${list.length}`;
  };

  const uniqueCats = createMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    for (const item of scopeItems()) {
      if (item.category && !seen.has(item.category)) {
        seen.add(item.category);
        result.push({ id: item.category, name: item.category });
      }
    }
    return result;
  });

  const canConfirm = createMemo(
    () => reason().trim().length > 0 && countedList().length > 0
  );

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div class="flex shrink-0 items-center justify-between border-border border-b px-4 py-3 lg:px-6">
        <div class="flex items-center gap-3">
          <button
            class="font-medium text-body-sm text-muted-foreground"
            onClick={props.onCancel}
            type="button"
          >
            ✕
          </button>
          <span class="font-semibold text-body-sm text-foreground">
            Stock Opname {ref}
          </span>
        </div>
        <span class="font-medium text-caption-sm text-muted-foreground">
          {progress().done} / {progress().total} telah dihitung
        </span>
      </div>

      {/* Category pills w/ progress */}
      <div class="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 py-2 lg:px-6">
        <button
          class={cn(
            "rounded-full border-2 px-3 py-1.5 text-[13px]",
            activeCat() === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground"
          )}
          onClick={() => setActiveCat("all")}
          type="button"
        >
          Semua {progress().done}/{progress().total}
        </button>
        <For each={uniqueCats()}>
          {(c) => (
            <button
              class={cn(
                "rounded-full border-2 px-3 py-1.5 text-[13px]",
                activeCat() === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground"
              )}
              onClick={() => setActiveCat(c.id)}
              type="button"
            >
              {c.name} {catProgress(c.id)}
            </button>
          )}
        </For>
      </div>

      {/* Counting grid */}
      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-2 lg:px-6">
        <div class="mb-2 grid grid-cols-[1fr_64px_80px_64px] gap-2 px-2 font-medium text-caption-sm text-muted-foreground">
          <span>Produk</span>
          <span class="text-center">Sistem</span>
          <span class="text-center">Dihitung</span>
          <span class="text-center">Selisih</span>
        </div>
        <div class="overflow-hidden rounded-xl border border-border">
          <For each={inCat()}>
            {(p) => {
              const system = () => currentStock(p.id);
              const counted = () => counts()[p.id] ?? null;
              const diff = () =>
                counted() === null ? null : (counted() ?? 0) - system();
              const st = () => diffState(diff());
              return (
                <div class="grid grid-cols-[1fr_64px_80px_64px] items-center gap-2 border-border border-b p-2.5 last:border-b-0">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-body-sm text-foreground">
                      {p.name}
                    </p>
                    <p class="text-caption-sm text-faint-foreground">{p.sku}</p>
                  </div>
                  <span class="text-center font-medium text-body-sm text-muted-foreground tabular-nums">
                    {system()}
                  </span>
                  <input
                    aria-label={`Dihitung ${p.name}`}
                    class="h-9 w-full rounded-md border border-border bg-muted text-center font-semibold text-[13px] text-foreground tabular-nums outline-none focus:border-primary"
                    inputMode="numeric"
                    onInput={(e) => setCount(p.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        focusNextInput(e.currentTarget);
                      }
                    }}
                    type="number"
                    value={counted() ?? ""}
                  />
                  <Show
                    fallback={
                      <span class="text-center text-caption-sm text-faint-foreground">
                        ⏳
                      </span>
                    }
                    when={counted() !== null}
                  >
                    <span
                      class={cn(
                        "text-center font-semibold text-body-sm tabular-nums",
                        st() === "match" && "text-success",
                        st() === "small" && "text-warning",
                        st() === "big" && "text-danger"
                      )}
                    >
                      {diff()! > 0 ? "+" : ""}
                      {diff()}
                    </span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Summary + actions */}
      <div class="shrink-0 space-y-2 border-border border-t px-4 py-3 lg:px-6">
        <div class="flex items-center justify-between font-medium text-body-sm">
          <span class="text-muted-foreground">
            {countedList().length} dihitung · {withVariance().length} ada
            selisih
          </span>
          <span class="text-foreground tabular-nums">
            Total selisih:{" "}
            <span class={totalDiff() < 0 ? "text-danger" : "text-foreground"}>
              {totalDiff() > 0 ? "+" : ""}
              {totalDiff()} ({formatRupiah(totalValue())})
            </span>
          </span>
        </div>
        <input
          class="h-10 w-full rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary"
          onInput={(e) => setReason(e.currentTarget.value)}
          placeholder="Alasan opname (wajib)..."
          type="text"
        />
        <p class="text-caption-sm text-faint-foreground">
          ⚠ Tindakan ini akan menyesuaikan stok & tidak bisa dibatalkan. Setiap
          selisih direkam sebagai penyesuaian.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="rounded-md px-4 py-2 font-medium text-body-sm text-muted-foreground"
            onClick={props.onCancel}
            type="button"
          >
            Batal
          </button>
          <button
            class="rounded-md bg-primary px-4 py-2 font-semibold text-body-sm text-primary-foreground disabled:opacity-40"
            disabled={!canConfirm()}
            onClick={() => props.onConfirm(ref, reason().trim(), rows())}
            type="button"
          >
            Selesai & Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
