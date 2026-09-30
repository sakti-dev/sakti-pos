import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { LayersIcon, PlusIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import { getModifierGroups } from "~/db/modifier-groups";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { formatRupiah } from "~/lib/utils";

const SELECTION_LABEL: Record<string, string> = {
  multi: "multi",
  single: "satu pilihan",
};

function optionsSummary(options: readonly { label: string }[]): string {
  return options.map((o) => o.label).join(" · ");
}

export function VariantTab() {
  const [search, setSearch] = createSignal("");

  const groupsQuery = useDrizzleQuery(
    ["drizzle", "modifier-groups", "list"],
    () => getModifierGroups()
  );
  const groups = () => groupsQuery.data() ?? [];

  const filtered = createMemo(() => {
    const q = search().toLowerCase().trim();
    if (!q) {
      return groups();
    }
    return groups().filter((g) => {
      const nameMatch = g.name.toLowerCase().includes(q);
      const optsMatch = optionsSummary(g.options).toLowerCase().includes(q);
      const prodMatch = g.products.some((p) =>
        p.name.toLowerCase().includes(q)
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
              message={
                groups().length === 0
                  ? "Belum ada varian"
                  : "Tidak ada varian yang cocok"
              }
              subtitle={
                groups().length === 0
                  ? "Tambah varian untuk opsi produk"
                  : "Coba kata kunci lain"
              }
            />
          }
          when={filtered().length > 0}
        >
          <div class="flex flex-col gap-2.5">
            <For each={filtered()}>
              {(group, i) => (
                <FadeIn delay={0.1 + i() * 0.03} duration={0.35} y={12}>
                  <VariantItem group={group} />
                </FadeIn>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function VariantItem(props: {
  group: Awaited<ReturnType<typeof getModifierGroups>>[number];
}) {
  return (
    <A
      aria-label={`Edit ${props.group.name}`}
      class="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 no-underline transition-colors hover:border-primary/20 lg:gap-4 lg:p-4"
      href={`/catalog/variant/${props.group.id}`}
    >
      <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <LayersIcon class="h-5 w-5 text-primary" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-semibold text-body-sm text-foreground">
          {props.group.name}
          {props.group.isRequired ? "" : " (opsional)"}
        </h3>
        <p class="truncate text-caption text-muted-foreground">
          {optionsSummary(props.group.options) || "Tanpa opsi"}
        </p>
        <Show when={props.group.options.length > 0}>
          <p class="truncate text-caption-sm text-faint-foreground">
            {props.group.options
              .filter((o) => o.priceDeltaMinorUnits > 0)
              .map(
                (o) =>
                  `${o.label} +${formatRupiah(o.priceDeltaMinorUnits / 100)}`
              )
              .join(" · ") ||
              `Pilih ${SELECTION_LABEL[props.group.selectionType]}`}
          </p>
        </Show>
      </div>
      <span class="hidden shrink-0 font-medium text-caption text-muted-foreground sm:block">
        {props.group.products.length} produk
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
