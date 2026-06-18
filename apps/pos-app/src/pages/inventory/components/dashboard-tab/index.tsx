import { useNavigate } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { BoxPackageIcon, PencilIcon, UtensilsIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import { Badge } from "~/components/ui/badge";
import { FadeIn } from "~/components/ui/fade-in";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { categories, products } from "~/lib/data/catalog";
import { useOrientation } from "~/lib/use-orientation";
import { formatRupiah } from "~/lib/utils";
import { stockStatus } from "../lib/stats";
import { currentStock } from "../lib/store";
import { StatCards } from "./stat-cards";

// ── Inline ingredient data (UI-only, no real table yet) ──
interface Ingredient {
  readonly category: string;
  readonly id: number;
  readonly name: string;
  readonly sku: string;
  readonly stock: number;
  readonly unit: string;
}

const ingredientCategories = [
  { id: "bumbu-curah", name: "Bumbu Curah" },
  { id: "sachet-mentah", name: "Sachet Mentah" },
] as const;

const ingredients: readonly Ingredient[] = [
  {
    id: 1001,
    name: "Bawang Putih",
    sku: "RAW-01",
    stock: 12,
    unit: "Kg",
    category: "bumbu-curah",
  },
  {
    id: 1002,
    name: "Cabai Rawit Merah",
    sku: "RAW-02",
    stock: 0.5,
    unit: "Kg",
    category: "bumbu-curah",
  },
  {
    id: 1003,
    name: "Garam Dapur",
    sku: "RAW-03",
    stock: 3,
    unit: "Kg",
    category: "bumbu-curah",
  },
  {
    id: 1004,
    name: "Minyak Goreng",
    sku: "RAW-04",
    stock: 8,
    unit: "Liter",
    category: "bumbu-curah",
  },
  {
    id: 1005,
    name: "Nutrisari Jeruk (Sachet)",
    sku: "SCH-08",
    stock: 120,
    unit: "Pcs",
    category: "sachet-mentah",
  },
  {
    id: 1006,
    name: "Kopi Arabika Biji",
    sku: "SCH-09",
    stock: 0,
    unit: "Kg",
    category: "sachet-mentah",
  },
  {
    id: 1007,
    name: "Gula Pasir",
    sku: "SCH-10",
    stock: 5,
    unit: "Kg",
    category: "bumbu-curah",
  },
] as const;

type SubTab = "jualan" | "bahan";

// ── Shared stock row (used by both products and ingredients) ──
interface StockRowData {
  readonly badge: "danger" | "success" | "warning";
  readonly detail: string;
  readonly name: string;
  readonly sku: string;
  readonly statusLabel: string;
  readonly stock: number;
  readonly unit: string;
}

function StockRow(props: { readonly data: StockRowData }) {
  return (
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 lg:gap-4">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.data.name}
        </h3>
        <p class="mt-0.5 truncate text-caption-sm text-faint-foreground">
          {props.data.sku} · {props.data.detail}
        </p>
        <div class="mt-1">
          <Badge
            class="px-2 py-0.5 normal-case"
            size="sm"
            variant={props.data.badge}
          >
            {props.data.statusLabel}
          </Badge>
        </div>
      </div>
      <div class="shrink-0 text-right">
        <span class="font-bold text-body text-foreground">
          {props.data.stock}
        </span>
        <span class="ml-1 text-caption-sm text-faint-foreground">
          {props.data.unit}
        </span>
      </div>
    </div>
  );
}

export function DashboardTab() {
  const navigate = useNavigate();
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();

  const [subTab, setSubTab] = createSignal<SubTab>("jualan");
  const [search, setSearch] = createSignal("");
  const [activeCat, setActiveCat] = createSignal("all");

  // Computed counts for StatCards (all items)
  const allStock = createMemo(() => {
    const items = [
      ...products.map((p) => currentStock(p.id)),
      ...ingredients.map((i) => i.stock),
    ];
    return items;
  });
  const totalCount = createMemo(() => allStock().length);
  const lowCount = createMemo(
    () => allStock().filter((s) => stockStatus(s).status === "low").length
  );
  const outCount = createMemo(
    () => allStock().filter((s) => stockStatus(s).status === "out").length
  );
  const totalValue = createMemo(() =>
    products.reduce((acc, p) => acc + p.price * currentStock(p.id), 0)
  );

  // Pre-computed category counts
  const productCatCounts = createMemo(() =>
    Object.fromEntries(
      categories.map((c) => [
        c.id,
        products.filter((p) => p.category === c.id).length,
      ])
    )
  );
  const ingredientCatCounts = createMemo(() =>
    Object.fromEntries(
      ingredientCategories.map((c) => [
        c.id,
        ingredients.filter((i) => i.category === c.id).length,
      ])
    )
  );

  // Filtered products
  const filteredProducts = createMemo(() => {
    const q = search().toLowerCase();
    const cat = activeCat();
    return products.filter((p) => {
      const matchCat = cat === "all" || p.category === cat;
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  });

  // Filtered ingredients
  const filteredIngredients = createMemo(() => {
    const q = search().toLowerCase();
    const cat = activeCat();
    return ingredients.filter((i) => {
      const matchCat = cat === "all" || i.category === cat;
      const matchQ =
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  });

  const onEditBanyakStok = () => {
    const mode = subTab() === "jualan" ? "jualan" : "bahan";
    navigate(`/inventory/bulk-adjust?mode=${mode}`);
  };

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 space-y-3 px-4 pt-4 pb-3 lg:px-6 lg:pb-4">
        {/* StatCards */}
        <StatCards
          low={lowCount()}
          out={outCount()}
          total={totalCount()}
          value={totalValue()}
        />

        {/* Sub-tab: Menu Jualan vs Bahan Baku */}
        <Tabs
          class="w-full"
          onChange={(v) => {
            setSubTab(v as SubTab);
            setActiveCat("all");
            setSearch("");
          }}
          value={subTab()}
        >
          <TabsList class="flex w-full gap-2">
            <TabsTrigger
              class="flex-1 justify-center py-3 text-body-sm"
              shape="rounded"
              tone="primary"
              value="jualan"
              variant="pill"
            >
              <UtensilsIcon class="h-5 w-5" /> Menu Jualan
            </TabsTrigger>
            <TabsTrigger
              class="flex-1 justify-center py-3 text-body-sm"
              shape="rounded"
              tone="primary"
              value="bahan"
              variant="pill"
            >
              <BoxPackageIcon class="h-5 w-5" /> Bahan Baku
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search + Edit Banyak Stok */}
        <div class="flex items-center gap-2">
          <SearchBar
            class="flex-1"
            onInput={setSearch}
            placeholder={
              subTab() === "jualan"
                ? "Cari nama menu jualan..."
                : "Cari nama bahan baku..."
            }
            value={search()}
          />
          <button
            class="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 font-semibold text-body-sm text-primary-foreground transition-colors hover:bg-primary/90"
            disabled
            onClick={onEditBanyakStok}
            type="button"
          >
            <PencilIcon class="h-4 w-4" /> Edit Stok
          </button>
        </div>

        {/* Category pills */}
        <Show when={subTab() === "jualan"}>
          <Tabs
            class="scrollbar-none overflow-x-auto"
            onChange={setActiveCat}
            value={activeCat()}
          >
            <TabsList class="flex gap-2">
              <TabsTrigger
                shape="pill"
                tone="accent"
                value="all"
                variant="pill"
              >
                Semua{" "}
                <span class="text-caption-sm opacity-70">
                  ({products.length})
                </span>
              </TabsTrigger>
              <For each={categories}>
                {(cat) => (
                  <TabsTrigger
                    shape="pill"
                    tone="accent"
                    value={cat.id}
                    variant="pill"
                  >
                    {cat.name}
                    <span class="text-caption-sm opacity-70">
                      ({productCatCounts()[cat.id] ?? 0})
                    </span>
                  </TabsTrigger>
                )}
              </For>
            </TabsList>
          </Tabs>
        </Show>
        <Show when={subTab() === "bahan"}>
          <Tabs
            class="scrollbar-none overflow-x-auto"
            onChange={setActiveCat}
            value={activeCat()}
          >
            <TabsList class="flex gap-2">
              <TabsTrigger
                shape="pill"
                tone="accent"
                value="all"
                variant="pill"
              >
                Semua{" "}
                <span class="text-caption-sm opacity-70">
                  ({ingredients.length})
                </span>
              </TabsTrigger>
              <For each={ingredientCategories}>
                {(cat) => (
                  <TabsTrigger
                    shape="pill"
                    tone="accent"
                    value={cat.id}
                    variant="pill"
                  >
                    {cat.name}
                    <span class="text-caption-sm opacity-70">
                      ({ingredientCatCounts()[cat.id] ?? 0})
                    </span>
                  </TabsTrigger>
                )}
              </For>
            </TabsList>
          </Tabs>
        </Show>
      </div>

      {/* Product / Ingredient list */}
      <div class="@container scrollbar-none flex-1 overflow-y-auto px-4 pt-2 pb-28 lg:px-6 lg:pb-6">
        <Show when={subTab() === "jualan"}>
          <Show
            fallback={
              <div class="flex flex-col items-center justify-center gap-1 py-20 text-center">
                <p class="text-body-sm text-muted-foreground">
                  Produk tidak ditemukan
                </p>
                <p class="text-caption text-faint-foreground">
                  Coba ubah filter atau kata kunci
                </p>
              </div>
            }
            when={filteredProducts().length > 0}
          >
            <div class="grid @2xl:grid-cols-2 grid-cols-1 gap-2">
              <For each={filteredProducts()}>
                {(product, i) => (
                  <FadeIn
                    delay={0.1 + i() * 0.03}
                    duration={0.35}
                    enable={enable()}
                    y={12}
                  >
                    <StockRow
                      data={{
                        badge: stockStatus(currentStock(product.id)).badge,
                        detail: formatRupiah(product.price),
                        name: product.name,
                        sku: product.sku,
                        statusLabel: stockStatus(currentStock(product.id))
                          .label,
                        stock: currentStock(product.id),
                        unit: product.unit,
                      }}
                    />
                  </FadeIn>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={subTab() === "bahan"}>
          <Show
            fallback={
              <div class="flex flex-col items-center justify-center gap-1 py-20 text-center">
                <p class="text-body-sm text-muted-foreground">
                  Bahan baku tidak ditemukan
                </p>
                <p class="text-caption text-faint-foreground">
                  Coba ubah filter atau kata kunci
                </p>
              </div>
            }
            when={filteredIngredients().length > 0}
          >
            <div class="grid @2xl:grid-cols-2 grid-cols-1 gap-2">
              <For each={filteredIngredients()}>
                {(ingredient, i) => (
                  <FadeIn
                    delay={0.1 + i() * 0.03}
                    duration={0.35}
                    enable={enable()}
                    y={12}
                  >
                    <StockRow
                      data={{
                        badge: stockStatus(ingredient.stock).badge,
                        detail: `Satuan: ${ingredient.unit}`,
                        name: ingredient.name,
                        sku: ingredient.sku,
                        statusLabel: stockStatus(ingredient.stock).label,
                        stock: ingredient.stock,
                        unit: ingredient.unit,
                      }}
                    />
                  </FadeIn>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
