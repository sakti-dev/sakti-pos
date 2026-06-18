import { createMemo, createSignal, For, Show } from "solid-js";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { SearchBar } from "~/components/search-bar";
import { TabButton } from "~/components/ui/tabs";
import { products } from "~/lib/data/catalog";
import { findIngredient } from "../components/lib/ingredients";
import { groupMovementsByDay } from "../components/lib/stats";
import { MOVEMENT_TYPE_META, type MovementType } from "../components/lib/types";

const FILTERS: { label: string; value: "all" | MovementType }[] = [
  { label: "Semua", value: "all" },
  { label: "🛒 Penjualan", value: "sale" },
  { label: "📦 Penerimaan", value: "restock" },
  { label: "📋 Opname", value: "stocktake" },
  { label: "🔧 Penyesuaian", value: "adjustment" },
];

const TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

function timeOf(ts: number): string {
  return TIME_FMT.format(new Date(ts));
}

function itemName(id: number): string {
  return (
    products.find((p) => p.id === id)?.name ?? findIngredient(id)?.name ?? "—"
  );
}

export default function HistoryPage() {
  const [q, setQ] = createSignal("");
  const [typeFilter, setTypeFilter] = createSignal<"all" | MovementType>("all");

  const groups = createMemo(() => {
    const query = q().toLowerCase();
    const tf = typeFilter();
    return groupMovementsByDay()
      .map((g) => ({
        ...g,
        items: g.items.filter((m) => {
          if (tf !== "all" && m.type !== tf) {
            return false;
          }
          if (!query) {
            return true;
          }
          return itemName(m.productId).toLowerCase().includes(query);
        }),
      }))
      .filter((g) => g.items.length > 0);
  });

  return (
    <SubPageShell
      backHref="/inventory"
      data-ssgoi-transition="/inventory/history"
      title="Riwayat Stok"
    >
      <div class="flex flex-1 flex-col overflow-hidden">
        <div class="shrink-0 space-y-2 px-4 pt-4 pb-3 lg:px-6 lg:pb-4">
          <SearchBar onInput={setQ} placeholder="Cari produk..." value={q()} />
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
                  <For each={g.items}>
                    {(m) => {
                      const meta = MOVEMENT_TYPE_META[m.type];
                      return (
                        <div class="flex items-start gap-3 border-border border-b p-3 last:border-b-0">
                          <span class="text-lg leading-none">{meta.emoji}</span>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-baseline justify-between gap-2">
                              <span class="truncate font-semibold text-body-sm text-foreground">
                                {itemName(m.productId)}
                              </span>
                              <span class="shrink-0 font-semibold text-body-sm text-foreground tabular-nums">
                                {m.qtyBefore} → {m.qtyAfter}
                                <span
                                  class={
                                    m.delta < 0 ? "text-danger" : "text-success"
                                  }
                                >
                                  {" "}
                                  ({m.delta > 0 ? "+" : ""}
                                  {m.delta})
                                </span>
                              </span>
                            </div>
                            <p class="text-caption-sm text-muted-foreground">
                              {timeOf(m.createdAt)} · {meta.label}
                              <Show when={m.ref}> · {m.ref}</Show>
                            </p>
                            <p class="text-caption-sm text-faint-foreground">
                              <Show fallback={m.note ?? ""} when={m.reason}>
                                Alasan: {m.reason}
                              </Show>
                              {" · oleh "}
                              {m.user}
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
