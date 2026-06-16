import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { PlusIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  categories,
  type Product,
  products,
  stockStatus,
} from "~/lib/data/catalog";
import { formatRupiah } from "~/lib/utils";

export function ProductTab() {
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
        <SearchBar
          class="flex-1"
          onInput={setSearch}
          placeholder="Cari produk atau SKU..."
          value={search()}
        />
        <Button
          as={A}
          class="hidden sm:inline-flex"
          href="/catalog/product/new"
          size="sm"
        >
          <PlusIcon class="h-4 w-4" />
          Tambah Produk
        </Button>
      </div>

      {/* Category filter pills */}
      <div class="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 lg:px-6">
        <Tabs
          class="scrollbar-none overflow-x-auto"
          onChange={setActiveCat}
          value={activeCat()}
        >
          <TabsList class="flex gap-2">
            <TabsTrigger shape="pill" tone="accent" value="all" variant="pill">
              Semua
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

      {/* Product list — container query so columns adapt to content width,
          not viewport. 2 cols when container ≥40rem (640px).
          `keyed` on activeCat forces full remount when switching category,
          so FadeIn replays on every tab change. */}
      <div class="@container scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
        <Show keyed when={activeCat()}>
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
                {(product, i) => (
                  <FadeIn delay={0.1 + i() * 0.03} duration={0.35} y={12}>
                    <ProductRow product={product} />
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

function ProductRow(props: { product: Product }) {
  const s = () => stockStatus(props.product.stock);
  return (
    <A
      aria-label={`Edit ${props.product.name}`}
      class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 no-underline transition-colors hover:border-primary/20 lg:gap-4"
      href={`/catalog/product/${props.product.id}`}
    >
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.product.name}
        </h3>
        <p class="mt-0.5 truncate text-caption-sm text-faint-foreground">
          {props.product.sku} · {formatRupiah(props.product.price)}
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <span class="font-bold text-body-sm text-foreground tabular-nums">
          {props.product.stock}
        </span>
        <Badge size="sm" variant={s().badge}>
          {s().label}
        </Badge>
      </div>
    </A>
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
