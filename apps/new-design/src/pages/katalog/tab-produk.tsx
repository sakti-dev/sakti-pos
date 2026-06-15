import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { PlusIcon, SearchIcon } from "~/assets";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { Tab } from "~/components/ui/tab";
import {
  categories,
  type Product,
  products,
  stockStatus,
} from "~/lib/data/catalog";
import { formatRupiah } from "~/lib/utils";

export function TabProduk() {
  const [search, setSearch] = createSignal("");
  const [activeCat, setActiveCat] = createSignal("all");

  // Mutable stock overlay so inline steppers work without touching
  // the immutable sample data. stockMap[id] → current stock value.
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
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* Search + add */}
      <div class="flex shrink-0 items-center gap-2.5 px-4 pt-3 pb-2 lg:px-6">
        <label class="flex flex-1 items-center gap-2 rounded-xl bg-card px-3.5 py-2 shadow-card">
          <SearchIcon class="h-4 w-4 shrink-0 text-faint-foreground" />
          <input
            class="w-full bg-transparent text-body-sm text-foreground outline-none placeholder:text-faint-foreground"
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="Cari produk atau SKU..."
            type="text"
            value={search()}
          />
        </label>
        <Button as={A} href="#" size="sm">
          <PlusIcon class="h-4 w-4" />
          <span class="hidden sm:inline">Tambah Produk</span>
        </Button>
      </div>

      {/* Category filter pills */}
      <div class="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 lg:px-6">
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
      </div>

      {/* Product list — container query so columns adapt to content width,
          not viewport. 2 cols when container ≥40rem (640px). */}
      <div class="@container scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
        <Show
          fallback={
            <EmptyState
              message="Produk tidak ditemukan"
              subtitle="Coba ubah filter atau kata kunci"
            />
          }
          when={filtered().length > 0}
        >
          <div class="grid @2xl:grid-cols-2 grid-cols-1 gap-2">
            <For each={filtered()}>
              {(product) => (
                <ProductRow
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

function ProductRow(props: {
  onAdjustStock: (delta: number) => void;
  onSetStock: (value: number) => void;
  product: Product;
  stock: number;
}) {
  const s = () => stockStatus(props.stock);
  return (
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/20 lg:gap-4">
      {/* Left: tap to edit form */}
      <A
        aria-label={`Edit ${props.product.name}`}
        class="min-w-0 flex-1 no-underline"
        href="#"
      >
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.product.name}
        </h3>
        <p class="mt-0.5 truncate text-caption-sm text-faint-foreground">
          {props.product.sku} · {formatRupiah(props.product.price)}
        </p>
        <Badge class="mt-1" size="sm" variant={s().badge}>
          {s().label}
        </Badge>
      </A>
      {/* Right: inline stock stepper */}
      <div class="flex shrink-0 flex-col items-center gap-1">
        <QuantityStepper
          ariaLabel={`Stok ${props.product.name}`}
          editable
          onDecrement={() => props.onAdjustStock(-1)}
          onIncrement={() => props.onAdjustStock(1)}
          onInput={(v) => props.onSetStock(v)}
          value={props.stock}
        />
        <span class="font-medium text-caption-sm text-faint-foreground">
          {props.product.unit}
        </span>
      </div>
    </div>
  );
}

function EmptyState(props: { message: string; subtitle: string }) {
  return (
    <div class="flex flex-col items-center justify-center gap-1 py-20 text-center">
      <p class="text-body-sm text-muted-foreground">{props.message}</p>
      <p class="text-caption text-faint-foreground">{props.subtitle}</p>
    </div>
  );
}
