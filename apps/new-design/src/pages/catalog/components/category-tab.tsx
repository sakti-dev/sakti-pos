import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  GridIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "~/assets";
import { Button } from "~/components/ui/button";
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
        <label class="flex flex-1 items-center gap-2 rounded-xl bg-card px-3.5 py-2 shadow-card">
          <SearchIcon class="h-4 w-4 shrink-0 text-faint-foreground" />
          <input
            class="w-full bg-transparent text-body-sm text-foreground outline-none placeholder:text-faint-foreground"
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="Cari kategori..."
            type="text"
            value={search()}
          />
        </label>
        <Button as={A} href="/catalog/category/new" size="sm">
          <PlusIcon class="h-4 w-4" />
          <span class="hidden sm:inline">Tambah Kategori</span>
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
              {(cat) => <CategoryItem category={cat} />}
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
    <div class="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/20 lg:gap-4 lg:p-4">
      <div
        class="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: props.category.color }}
      >
        <GridIcon class="h-5 w-5 text-white" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-semibold text-body-sm text-foreground">
          {props.category.name}
        </h3>
        <p class="text-caption text-muted-foreground">{count()} produk</p>
      </div>
      <div class="flex shrink-0 gap-1">
        <Button
          aria-label={`Edit ${props.category.name}`}
          as={A}
          href={`/catalog/category/${props.category.id}`}
          look="ghost"
          size="icon-sm"
          tone="neutral"
        >
          <PencilIcon class="h-3.5 w-3.5" />
        </Button>
        <Button
          aria-label={`Hapus ${props.category.name}`}
          look="ghost"
          size="icon-sm"
          tone="danger"
        >
          <TrashIcon class="h-3.5 w-3.5" />
        </Button>
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
