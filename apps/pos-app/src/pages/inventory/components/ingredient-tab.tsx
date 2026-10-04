import { useNavigate } from "@solidjs/router";
import {
  FiAlertTriangle,
  FiClipboard,
  FiPackage,
  FiPlus,
  FiTruck,
} from "solid-icons/fi";
import { createMemo, createSignal, For, Show } from "solid-js";
import { SearchBar } from "~/components/search-bar";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import { getIngredientStockList, type StockListItem } from "~/db/inventory";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { stockStatus } from "./lib/stats";
import { BadgeStock, StatCard } from "./shared";

export function IngredientTab() {
  const navigate = useNavigate();
  const [search, setSearch] = createSignal("");

  const listQuery = useDrizzleQuery(
    ["drizzle", "inventory", "ingredient-stock-list"],
    () => getIngredientStockList()
  );
  const list = () => listQuery.data() ?? [];

  const lowIngredientCount = createMemo(
    () =>
      list().filter(
        (ing) =>
          stockStatus(ing.onHandQty, ing.lowStockThreshold).status !==
          "available"
      ).length
  );

  const filtered = createMemo(() => {
    const q = search().toLowerCase().trim();
    if (!q) {
      return list();
    }
    return list().filter(
      (ing) =>
        ing.name.toLowerCase().includes(q) ||
        (ing.unit ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        {/* KPI cards — scroll away, giving the list full height once past */}
        <div class="grid grid-cols-2 gap-2 px-4 py-3 lg:px-6">
          <StatCard
            dot="danger"
            icon={<FiAlertTriangle class="h-4 w-4" />}
            label="Bahan Kritis / Habis"
            value={String(lowIngredientCount())}
            valueSuffix="Bahan"
          />
          <StatCard
            icon={<FiPackage class="h-4 w-4" />}
            label="Total Bahan Terdaftar"
            value={String(list().length)}
            valueSuffix="Bahan"
          />
        </div>

        {/* Actions — scroll away too */}
        <div class="flex flex-wrap justify-end gap-2 px-4 lg:px-6">
          <Button
            class="justify-center rounded-xl"
            look="outline"
            onClick={() => navigate("/inventory/goods-receipt/new")}
            size="sm"
            tone="primary"
          >
            <FiTruck class="h-4 w-4" /> Terima Barang
          </Button>
          <Button
            class="justify-center rounded-xl"
            look="outline"
            onClick={() =>
              navigate("/inventory/stocktake/new?scope=ingredient")
            }
            size="sm"
            tone="primary"
          >
            <FiClipboard class="h-4 w-4" /> Stock Opname
          </Button>
          <Button
            class="justify-center rounded-xl"
            look="outline"
            onClick={() => navigate("/inventory/ingredient/new")}
            size="sm"
            tone="primary"
          >
            <FiPlus class="h-4 w-4" /> Bahan Baru
          </Button>
        </div>

        {/* Search — sticks while the cards above scroll away.
            bg-background matches the page so no visible band; covers the
            parchment-darker rows scrolling behind it. */}
        <div class="sticky top-0 z-10 mt-2 bg-background px-4 py-2 lg:px-6">
          <SearchBar
            onInput={setSearch}
            placeholder="Cari bahan baku..."
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
                  Belum ada bahan baku dapur
                </p>
                <p class="text-caption text-faint-foreground">
                  Ketuk tombol di atas untuk mulai mengelola stok gudang
                </p>
              </div>
            }
          >
            {(ing, i) => (
              <FadeIn delay={0.05 + i() * 0.02} duration={0.3} y={8}>
                <IngredientRow
                  item={ing}
                  onOpen={(id) => navigate(`/inventory/ingredient/${id}`)}
                />
              </FadeIn>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function IngredientRow(props: {
  item: StockListItem;
  onOpen: (id: string) => void;
}) {
  const ing = () => props.item;

  return (
    <button
      class="mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/30"
      onClick={() => props.onOpen(ing().id)}
      type="button"
    >
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {ing().name}
        </h3>
        <p class="mt-0.5 text-caption-sm text-faint-foreground">{ing().unit}</p>
      </div>
      <div class="shrink-0">
        <Show
          fallback={
            <span class="text-caption-sm text-faint-foreground">
              belum dipantau
            </span>
          }
          when={ing().tracked}
        >
          <BadgeStock
            qty={ing().onHandQty}
            threshold={ing().lowStockThreshold}
            unit={ing().unit}
          />
        </Show>
      </div>
    </button>
  );
}
