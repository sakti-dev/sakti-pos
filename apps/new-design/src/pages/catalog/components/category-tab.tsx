import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { PlusIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import { type Category, categories, products } from "~/lib/data/catalog";

export function CategoryTab() {
  const [search, setSearch] = createSignal("");

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    if (!q) {
      return categories;
    }
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  });

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* Search + add */}
      <div class="flex shrink-0 items-center gap-2.5 px-4 pt-3 pb-3 lg:px-6">
        <SearchBar
          class="flex-1"
          onInput={setSearch}
          placeholder="Cari kategori..."
          value={search()}
        />
        <Button
          as={A}
          class="hidden sm:inline-flex"
          href="/catalog/category/new"
          size="sm"
        >
          <PlusIcon class="h-4 w-4" />
          Tambah Kategori
        </Button>
      </div>

      {/* Category list */}
      <div class="scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
        <Show
          fallback={
            <EmptyState
              message="Belum ada kategori"
              subtitle="Tambah kategori untuk mengelompokkan produk"
            />
          }
          when={filtered().length > 0}
        >
          <div class="flex flex-col gap-2.5">
            <For each={filtered()}>
              {(cat, i) => (
                <FadeIn delay={0.1 + i() * 0.03} duration={0.35} y={12}>
                  <CategoryItem category={cat} />
                </FadeIn>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function CategoryItem(props: { category: Category }) {
  const count = () =>
    products.filter((p) => p.category === props.category.id).length;
  return (
    <A
      aria-label={`Edit ${props.category.name}`}
      class="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 no-underline transition-colors hover:border-primary/20 lg:gap-4 lg:p-4"
      href={`/catalog/category/${props.category.id}`}
    >
      <div class="min-w-0 flex-1">
        <h3 class="font-semibold text-body-sm text-foreground">
          {props.category.name}
        </h3>
        <p class="text-caption text-muted-foreground">{count()} produk</p>
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
