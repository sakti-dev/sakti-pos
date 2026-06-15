import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { LayersIcon, PlusIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import { Button } from "~/components/ui/button";
import {
  formatVariantOptions,
  getVariantProductNames,
  products,
  type Variant,
  variants,
} from "~/lib/data/catalog";

export function VariantTab() {
  const [search, setSearch] = createSignal("");

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    if (!q) {
      return variants;
    }
    return variants.filter((v) => {
      const nameMatch = v.name.toLowerCase().includes(q);
      const optsMatch = v.options
        .map((o) => o.label)
        .join(",")
        .toLowerCase()
        .includes(q);
      const prodMatch = v.productIds.some((pid) =>
        products
          .find((p) => p.id === pid)
          ?.name.toLowerCase()
          .includes(q)
      );
      return nameMatch || optsMatch || prodMatch;
    });
  });

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* Search + add */}
      <div class="flex shrink-0 items-center gap-2.5 px-4 pt-3 pb-3 lg:px-6">
        <SearchBar
          class="flex-1"
          onInput={setSearch}
          placeholder="Cari varian..."
          value={search()}
        />
        <Button
          as={A}
          class="hidden sm:inline-flex"
          href="/catalog/variant/new"
          size="sm"
        >
          <PlusIcon class="h-4 w-4" />
          Tambah Varian
        </Button>
      </div>

      {/* Variant list */}
      <div class="scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
        <Show
          fallback={
            <EmptyState
              message="Belum ada varian"
              subtitle="Tambah varian untuk opsi produk"
            />
          }
          when={filtered().length > 0}
        >
          <div class="flex flex-col gap-2.5">
            <For each={filtered()}>
              {(variant) => <VariantItem variant={variant} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function VariantItem(props: { variant: Variant }) {
  return (
    <A
      aria-label={`Edit ${props.variant.name}`}
      class="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 no-underline transition-colors hover:border-primary/20 lg:gap-4 lg:p-4"
      href={`/catalog/variant/${props.variant.id}`}
    >
      <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <LayersIcon class="h-5 w-5 text-primary" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-semibold text-body-sm text-foreground">
          {props.variant.name}
        </h3>
        <p class="truncate text-caption text-muted-foreground">
          {formatVariantOptions(props.variant.options)}
        </p>
        <p class="truncate text-caption-sm text-faint-foreground">
          {getVariantProductNames(props.variant.productIds, products)}
        </p>
      </div>
      <span class="hidden shrink-0 font-medium text-caption text-muted-foreground sm:block">
        {props.variant.productIds.length} produk
      </span>
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
