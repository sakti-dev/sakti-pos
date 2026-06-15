import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "~/assets";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tab } from "~/components/ui/tab";
import { formatRupiah } from "~/lib/utils";
import {
  categories,
  type Product,
  productImage,
  products,
  stockStatus,
} from "./data";

export function TabProduk() {
  const [search, setSearch] = createSignal("");
  const [activeCat, setActiveCat] = createSignal("all");

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

      {/* Product grid */}
      <div class="scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
        <Show
          fallback={
            <EmptyState
              message="Produk tidak ditemukan"
              subtitle="Coba ubah filter atau kata kunci"
            />
          }
          when={filtered().length > 0}
        >
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5">
            <For each={filtered()}>
              {(product) => <ProductCard product={product} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function ProductCard(props: { product: Product }) {
  const s = () => stockStatus(props.product.stock);
  return (
    <div class="group overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/20">
      {/* Thumbnail */}
      <div class="relative aspect-square overflow-hidden bg-muted">
        <img
          alt={props.product.name}
          class="h-full w-full object-cover"
          src={productImage(props.product.id)}
        />
        <Badge class="absolute top-2 left-2" size="sm" variant={s().badge}>
          {s().label}
        </Badge>
        <div class="absolute top-2 right-2 flex gap-1">
          <Button
            aria-label={`Edit ${props.product.name}`}
            class="flex size-8 justify-center bg-card p-0 shadow-card"
            look="ghost"
            size="none"
            tone="neutral"
          >
            <PencilIcon class="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label={`Hapus ${props.product.name}`}
            class="flex size-8 justify-center bg-card p-0 shadow-card"
            look="ghost"
            size="none"
            tone="danger"
          >
            <TrashIcon class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div class="p-2.5 lg:p-3">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.product.name}
        </h3>
        <p class="mb-2 font-mono text-caption-sm text-faint-foreground">
          {props.product.sku}
        </p>
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold text-body-sm text-primary tabular-nums">
            {formatRupiah(props.product.price)}
          </span>
          <span class="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-caption-sm text-muted-foreground">
            {props.product.stock} {props.product.unit}
          </span>
        </div>
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
