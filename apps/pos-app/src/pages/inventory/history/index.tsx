import dayjs from "dayjs";
import { createMemo, createSignal, For, Show } from "solid-js";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { SearchBar } from "~/components/search-bar";
import { TabButton } from "~/components/ui/tabs";
import {
  getStockHistory,
  type StockHistoryEntry,
  type StockHistoryKind,
} from "~/db/inventory";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";

const FILTERS: { label: string; value: "all" | StockHistoryKind }[] = [
  { label: "Semua", value: "all" },
  { label: "🛒 Penjualan", value: "sale" },
  { label: "📦 Penerimaan", value: "receipt" },
  { label: "📋 Opname", value: "stocktake" },
  { label: "🔧 Penyesuaian", value: "adjustment" },
];

const KIND_META: Record<StockHistoryKind, { emoji: string; label: string }> = {
  adjustment: { emoji: "🔧", label: "Penyesuaian" },
  receipt: { emoji: "📦", label: "Penerimaan" },
  sale: { emoji: "🛒", label: "Penjualan" },
  stocktake: { emoji: "📋", label: "Stock Opname" },
};

const DAY_LABEL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

interface DayGroup {
  readonly entries: StockHistoryEntry[];
  readonly key: string;
  readonly label: string;
}

function groupByDay(entries: readonly StockHistoryEntry[]): DayGroup[] {
  const map = new Map<string, StockHistoryEntry[]>();
  for (const entry of entries) {
    const key = entry.at.slice(0, 10);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      entries: [...items].sort((a, b) => b.at.localeCompare(a.at)),
      key,
      label: DAY_LABEL.format(dayjs(key).toDate()),
    }));
}

export default function HistoryPage() {
  const [q, setQ] = createSignal("");
  const [typeFilter, setTypeFilter] = createSignal<"all" | StockHistoryKind>(
    "all"
  );

  const historyQuery = useDrizzleQuery(
    ["drizzle", "inventory", "history"],
    () => getStockHistory()
  );
  const entries = () => historyQuery.data() ?? [];

  const groups = createMemo(() => {
    const query = q().toLowerCase().trim();
    const tf = typeFilter();
    return groupByDay(
      entries().filter((e) => {
        if (tf !== "all" && e.kind !== tf) {
          return false;
        }
        if (!query) {
          return true;
        }
        return e.targetName.toLowerCase().includes(query);
      })
    );
  });

  return (
    <SubPageShell
      backHref="/inventory"
      data-ssgoi-transition="/inventory/history"
      title="Riwayat Stok"
    >
      <div class="flex flex-1 flex-col overflow-hidden">
        <div class="shrink-0 space-y-2 px-4 pt-4 pb-3 lg:px-6 lg:pb-4">
          <SearchBar onInput={setQ} placeholder="Cari item..." value={q()} />
          <div class="scrollbar-none flex gap-2 overflow-x-auto">
            <For each={FILTERS}>
              {(f) => (
                <TabButton
                  active={typeFilter() === f.value}
                  onClick={() => setTypeFilter(f.value)}
                  shape="pill"
                  tone="accent"
                >
                  {f.label}
                </TabButton>
              )}
            </For>
          </div>
        </div>

        <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
          <For
            each={groups()}
            fallback={
              <p class="py-20 text-center text-body-sm text-muted-foreground">
                Belum ada aktivitas
              </p>
            }
          >
            {(g) => (
              <div class="mb-4">
                <p class="mb-1.5 font-semibold text-caption-sm text-muted-foreground">
                  {g.label}
                </p>
                <div class="overflow-hidden rounded-xl border border-border">
                  <For each={g.entries}>
                    {(m) => {
                      const meta = KIND_META[m.kind];
                      return (
                        <div class="flex items-start gap-3 border-border border-b p-3 last:border-b-0">
                          <span class="text-lg leading-none">{meta.emoji}</span>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-baseline justify-between gap-2">
                              <span class="truncate font-semibold text-body-sm text-foreground">
                                {m.targetName}
                              </span>
                              <span class="shrink-0 font-semibold text-body-sm text-foreground tabular-nums">
                                <span
                                  class={
                                    m.qtyDelta < 0
                                      ? "text-danger"
                                      : "text-success"
                                  }
                                >
                                  {m.qtyDelta > 0 ? "+" : ""}
                                  {m.qtyDelta}
                                </span>
                              </span>
                            </div>
                            <p class="text-caption-sm text-muted-foreground">
                              {TIME_FMT.format(dayjs(m.at).toDate())} ·{" "}
                              {meta.label}
                              <Show when={m.ref}> · {m.ref}</Show>
                              <Show when={m.orderNumber}>
                                {" "}
                                · No. {m.orderNumber}
                              </Show>
                            </p>
                            <p class="text-caption-sm text-faint-foreground">
                              <Show when={m.supplierName}>
                                Supplier: {m.supplierName} ·{" "}
                              </Show>
                              <Show when={m.reason}>Alasan: {m.reason} · </Show>
                              <Show when={m.note}>{m.note} · </Show>
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </SubPageShell>
  );
}
