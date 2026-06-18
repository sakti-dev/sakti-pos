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
import { formatRupiah } from "~/lib/utils";
import { ingredients } from "./lib/ingredients";
import { isLowStock } from "./lib/stats";
import { currentStock } from "./lib/store";
import { BadgeStock, StatCard } from "./shared";

interface IngredientTabProps {
  readonly onCreateIngredient: () => void;
}

export function IngredientTab(props: IngredientTabProps) {
  const navigate = useNavigate();
  const [search, setSearch] = createSignal("");

  const lowIngredientCount = createMemo(
    () =>
      ingredients.filter((ing) =>
        isLowStock(currentStock(ing.id), "ingredient")
      ).length
  );

  const estimatedCapital = createMemo(() =>
    ingredients.reduce(
      (sum, ing) => sum + currentStock(ing.id) * ing.latestCostPrice,
      0
    )
  );

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    return ingredients.filter((ing) => {
      if (!q) {
        return true;
      }
      return (
        ing.name.toLowerCase().includes(q) || ing.sku.toLowerCase().includes(q)
      );
    });
  });

  return (
    <div class="mt-4 flex flex-1 flex-col overflow-hidden">
      <div class="grid shrink-0 grid-cols-1 gap-2 px-4 sm:grid-cols-2 lg:px-6">
        <StatCard
          dot="danger"
          icon={<FiAlertTriangle class="h-4 w-4" />}
          label="Bahan Kritis / Habis"
          value={String(lowIngredientCount())}
          valueSuffix="Bahan"
        />
        <StatCard
          icon={<FiPackage class="h-4 w-4" />}
          label="Estimasi Modal Gudang"
          value={formatRupiah(estimatedCapital())}
          valueSuffix=""
        />
      </div>

      <div class="mt-3 flex shrink-0 flex-wrap justify-end gap-2 px-4 lg:px-6">
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
          onClick={() => navigate("/inventory/stocktake/new?scope=ingredient")}
          size="sm"
          tone="primary"
        >
          <FiClipboard class="h-4 w-4" /> Stock Opname
        </Button>
        <Button
          class="justify-center rounded-xl"
          look="outline"
          onClick={props.onCreateIngredient}
          size="sm"
          tone="primary"
        >
          <FiPlus class="h-4 w-4" /> Bahan Baru
        </Button>
      </div>

      <div class="mt-2 shrink-0 px-4 lg:px-6">
        <SearchBar
          onInput={setSearch}
          placeholder="Cari bahan baku..."
          value={search()}
        />
      </div>

      <div class="scrollbar-none mt-2 flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
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
              <IngredientRow ingredient={ing} />
            </FadeIn>
          )}
        </For>
      </div>
    </div>
  );
}

function IngredientRow(props: { ingredient: (typeof ingredients)[number] }) {
  const ing = () => props.ingredient;

  return (
    <div class="mb-2 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {ing().name}
        </h3>
        <p class="mt-0.5 text-caption-sm text-faint-foreground">
          {ing().sku}
          <Show when={ing().category}> · {ing().category}</Show>
        </p>
      </div>
      <div class="shrink-0">
        <BadgeStock qty={currentStock(ing().id)} />
      </div>
    </div>
  );
}
