import { useNavigate } from "@solidjs/router";
import { FiAlertTriangle, FiClipboard, FiInbox } from "solid-icons/fi";
import { createMemo, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { SearchBar } from "~/components/search-bar";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import {
  getProductStockList,
  type StockListItem,
  stopTracking,
} from "~/db/inventory";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { stockStatus } from "./lib/stats";
import { BadgeStock, StatCard } from "./shared";

export function RetailTab() {
  const navigate = useNavigate();
  const [search, setSearch] = createSignal("");

  const listQuery = useDrizzleQuery(
    ["drizzle", "inventory", "product-stock-list"],
    () => getProductStockList()
  );
  const list = () => listQuery.data() ?? [];
  const invalidate = () => listQuery.refetch();

  const tracked = createMemo(() => list().filter((p) => p.tracked));

  const lowRetailCount = createMemo(
    () =>
      tracked().filter(
        (p) =>
          stockStatus(p.onHandQty, p.lowStockThreshold).status !== "available"
      ).length
  );

  const filtered = createMemo(() => {
    const q = search().toLowerCase().trim();
    if (!q) {
      return list();
    }
    return list().filter((p) => p.name.toLowerCase().includes(q));
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        {/* KPI cards — scroll away, giving the list full height once past */}
        <div class="grid grid-cols-2 gap-2 px-4 py-3 lg:px-6">
          <StatCard
            dot="warning"
            icon={<FiAlertTriangle class="h-4 w-4" />}
            label="Produk Mau Habis"
            value={String(lowRetailCount())}
            valueSuffix="Item"
          />
          <StatCard
            icon={<FiInbox class="h-4 w-4" />}
            label="Produk Dipantau"
            value={String(tracked().length)}
            valueSuffix={`dari ${list().length} menu`}
          />
        </div>

        {/* Actions — scroll away too */}
        <div class="flex flex-wrap justify-end gap-2 px-4 lg:px-6">
          <Button
            class="justify-center rounded-xl"
            look="outline"
            onClick={() => navigate("/inventory/stocktake/new?scope=retail")}
            size="sm"
            tone="primary"
          >
            <FiClipboard class="h-4 w-4" /> Stock Opname
          </Button>
        </div>

        {/* Search — sticks while the cards above scroll away.
            bg-background matches the page so no visible band; covers the
            parchment-darker rows scrolling behind it. */}
        <div class="sticky top-0 z-10 mt-2 bg-background px-4 py-2 lg:px-6">
          <SearchBar
            onInput={setSearch}
            placeholder="Cari menu jualan..."
            value={search()}
          />
        </div>

        {/* List */}
        <div class="px-4 pb-28 lg:px-6 lg:pb-6">
          <For
            each={filtered()}
            fallback={
              <div class="flex flex-col items-center gap-1 py-20 text-center">
                <p class="text-body-sm text-muted-foreground">
                  Menu tidak ditemukan
                </p>
                <p class="text-caption text-faint-foreground">
                  Coba ubah kata kunci pencarian
                </p>
              </div>
            }
          >
            {(p, i) => (
              <FadeIn delay={0.05 + i() * 0.02} duration={0.3} y={8}>
                <ProductRow item={p} onChanged={invalidate} />
              </FadeIn>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function ProductRow(props: { item: StockListItem; onChanged: () => void }) {
  const navigate = useNavigate();
  const p = () => props.item;

  const handleStop = () => {
    stopTracking("product", p().id)
      .then(() => {
        toast.success(`Berhenti pantau stok ${p().name}`);
        props.onChanged();
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Gagal berhenti pantau"
        );
      });
  };

  return (
    <div class="mb-2 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {p().name}
        </h3>
        <p class="mt-0.5 text-caption-sm text-faint-foreground">Menu jualan</p>
      </div>
      <div class="shrink-0">
        <Show
          fallback={
            <Button
              look="outline"
              onClick={() =>
                navigate(`/catalog/product/${p().id}?highlight=stok`)
              }
              size="xs"
              tone="primary"
            >
              Mulai Pantau
            </Button>
          }
          when={p().tracked}
        >
          <div class="flex items-center gap-1.5">
            <BadgeStock qty={p().onHandQty} threshold={p().lowStockThreshold} />
            <button
              aria-label={`Berhenti pantau ${p().name}`}
              class="rounded-full p-1.5 text-faint-foreground transition hover:bg-muted hover:text-foreground"
              onClick={handleStop}
              title="Berhenti pantau"
              type="button"
            >
              ✕
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
