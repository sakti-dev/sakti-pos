import { useNavigate } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { SearchBar } from "~/components/search-bar";
import { FadeIn } from "~/components/ui/fade-in";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { categories, products } from "~/lib/data/catalog";
import {
  computeStockValue,
  countByStatus,
  stockStatus,
} from "~/lib/inventory/stats";
import { currentStock } from "~/lib/inventory/store";
import { useOrientation } from "~/lib/use-orientation";
import { InventoryRow } from "../product-row";
import { AdjustmentSheet } from "./adjustment-sheet";
import { StatCards } from "./stat-cards";

type StatusFilter = "all" | "low" | "out";

export function DashboardTab() {
  const navigate = useNavigate();
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();

  const [search, setSearch] = createSignal("");
  const [activeCat, setActiveCat] = createSignal("all");
  const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");

  // Adjustment sheet state.
  const [adjustProductId, setAdjustProductId] = createSignal<number | null>(
    null
  );
  const adjustProduct = () =>
    products.find((p) => p.id === adjustProductId()) ?? null;

  const openSheet = (productId: number) => setAdjustProductId(productId);

  const counts = createMemo(() => countByStatus());
  const value = createMemo(() => computeStockValue());

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    const cat = activeCat();
    const sf = statusFilter();
    return products.filter((p) => {
      const matchCat = cat === "all" || p.category === cat;
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      if (!(matchCat && matchQ)) {
        return false;
      }
      if (sf !== "all") {
        return stockStatus(currentStock(p.id)).status === sf;
      }
      return true;
    });
  });

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 space-y-3 px-4 pt-4 lg:px-6">
        <StatCards
          low={counts().low}
          onLow={() => setStatusFilter("low")}
          onOut={() => setStatusFilter("out")}
          out={counts().out}
          total={products.length}
          value={value()}
        />

        {/* Primary action tiles */}
        <div class="grid grid-cols-2 gap-2">
          <button
            class="flex flex-col gap-0.5 rounded-xl border-2 border-border bg-card p-3 text-left transition-colors hover:border-primary/30"
            onClick={() => navigate("/inventory/terima/new")}
            type="button"
          >
            <span class="font-semibold text-body-sm text-foreground">
              ➕ Terima Barang
            </span>
            <span class="text-caption-sm text-muted-foreground">
              Restock dari supplier
            </span>
          </button>
          <button
            class="flex flex-col gap-0.5 rounded-xl border-2 border-border bg-card p-3 text-left transition-colors hover:border-primary/30"
            onClick={() => navigate("/inventory/opname/new")}
            type="button"
          >
            <span class="font-semibold text-body-sm text-foreground">
              📋 Mulai Stock Opname
            </span>
            <span class="text-caption-sm text-muted-foreground">
              Hitung stok fisik
            </span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <SearchBar
            class="flex-1"
            onInput={setSearch}
            placeholder="Cari produk atau SKU..."
            value={search()}
          />
          <Show when={statusFilter() !== "all"}>
            <button
              class="font-medium text-caption-sm text-primary"
              onClick={() => setStatusFilter("all")}
              type="button"
            >
              ✕ Reset filter
            </button>
          </Show>
        </div>

        <Tabs
          class="scrollbar-none overflow-x-auto"
          onChange={setActiveCat}
          value={activeCat()}
        >
          <TabsList class="flex gap-2">
            <TabsTrigger shape="pill" tone="accent" value="all" variant="pill">
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
                    ({products.filter((p) => p.category === cat.id).length})
                  </span>
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
      </div>

      <div class="@container scrollbar-none flex-1 overflow-y-auto px-4 pt-2 pb-28 lg:px-6 lg:pb-6">
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
          when={filtered().length > 0}
        >
          <div class="grid @2xl:grid-cols-2 grid-cols-1 gap-2">
            <For each={filtered()}>
              {(product, i) => (
                <FadeIn
                  delay={0.1 + i() * 0.03}
                  duration={0.35}
                  enable={enable()}
                  y={12}
                >
                  <InventoryRow
                    onAdjust={() => openSheet(product.id)}
                    product={product}
                  />
                </FadeIn>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* The adjustment overlay */}
      <Show when={adjustProduct()}>
        {(p) => (
          <AdjustmentSheet
            onOpenChange={(o) => !o && setAdjustProductId(null)}
            open={adjustProductId() !== null}
            product={p()}
          />
        )}
      </Show>
    </div>
  );
}
