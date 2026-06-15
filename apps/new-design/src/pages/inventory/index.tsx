import { createMemo, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { SearchBar } from "~/components/search-bar";
import { FadeIn } from "~/components/ui/fade-in";
import { Tab } from "~/components/ui/tab";
import { categories, products } from "~/lib/data/catalog";
import { useOrientation } from "~/lib/use-orientation";
import { InventoryRow } from "./product-row";

export default function InventoryPage() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  const [search, setSearch] = createSignal("");
  const [activeCat, setActiveCat] = createSignal("all");

  const [stockMap, setStockMap] = createStore<Record<number, number>>(
    Object.fromEntries(products.map((p) => [p.id, p.stock]))
  );

  const effectiveStock = (id: number) => stockMap[id] ?? 0;
  const adjustStock = (id: number, delta: number) =>
    setStockMap(id, (prev) => Math.max(0, (prev ?? 0) + delta));
  const setStock = (id: number, value: number) =>
    setStockMap(id, Math.max(0, value));

  const filtered = createMemo(() => {
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

  return (
    <div
      class="flex flex-1 flex-col overflow-hidden"
      data-ssgoi-transition="/inventory"
    >
      <FadeIn
        class="shrink-0 px-4 pt-5 pb-3 lg:px-6"
        duration={0.35}
        enable={enable()}
        y={-8}
      >
        <h1 class="font-bold font-display text-foreground text-heading-sm">
          Stok
        </h1>
        <p class="mt-0.5 text-body-sm text-muted-foreground">
          Kelola stok produk Anda
        </p>
      </FadeIn>

      <FadeIn
        class="flex shrink-0 items-center gap-2.5 px-4 pb-2 lg:px-6"
        delay={0.05}
        duration={0.4}
        enable={enable()}
        y={8}
      >
        <SearchBar
          class="flex-1"
          onInput={setSearch}
          placeholder="Cari produk atau SKU..."
          value={search()}
        />
      </FadeIn>

      <FadeIn
        class="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 lg:px-6"
        delay={0.1}
        duration={0.4}
        enable={enable()}
        y={8}
      >
        <Tab
          active={activeCat() === "all"}
          class="flex items-center gap-1.5"
          onClick={() => setActiveCat("all")}
          shape="pill"
          tone="accent"
        >
          Semua
          <span class="text-caption-sm opacity-70">{products.length}</span>
        </Tab>
        <For each={categories}>
          {(cat) => (
            <Tab
              active={activeCat() === cat.id}
              class="flex items-center gap-1.5"
              onClick={() => setActiveCat(cat.id)}
              shape="pill"
              tone="accent"
            >
              {cat.name}
              <span class="text-caption-sm opacity-70">
                {products.filter((p) => p.category === cat.id).length}
              </span>
            </Tab>
          )}
        </For>
      </FadeIn>

      <div class="@container scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
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
              {(product) => (
                <InventoryRow
                  onAdjustStock={(delta) => adjustStock(product.id, delta)}
                  onSetStock={(v) => setStock(product.id, v)}
                  product={product}
                  stock={effectiveStock(product.id)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
