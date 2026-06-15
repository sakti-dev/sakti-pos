import { For, Show } from "solid-js";
import { PlusIcon } from "~/assets";
import { formatRupiah } from "~/lib/utils";
import type { Product } from "./types";

interface ProductGridProps {
  readonly onAdd: (id: number) => void;
  readonly products: readonly Product[];
}

export const ProductGrid = (props: ProductGridProps) => {
  return (
    <div class="scrollbar-none grid min-h-0 flex-1 grid-cols-2 content-start items-start gap-3.5 overflow-y-auto [grid-auto-rows:min-content] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
      <Show
        fallback={
          <div class="col-[1/-1] py-16 text-center font-medium text-body-sm text-muted-foreground">
            Tidak ada menu ditemukan
          </div>
        }
        when={props.products.length > 0}
      >
        <For each={props.products}>
          {(p) => (
            <button
              aria-label={`${p.name} ${formatRupiah(p.price)}`}
              class="group relative aspect-square cursor-pointer overflow-hidden rounded-2xl bg-muted transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.97]"
              onClick={() => props.onAdd(p.id)}
              type="button"
            >
              <img
                alt={p.name}
                class="absolute inset-0 h-full w-full object-cover transition-transform duration-400 ease-out group-hover:scale-108"
                loading="lazy"
                src={`https://picsum.photos/id/${p.img}/400/400`}
              />

              {/* Gradient overlay */}
              <div class="absolute inset-0 z-[1] bg-[linear-gradient(to_top,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_15%,rgba(0,0,0,0.90)_35%,rgba(0,0,0,0.70)_50%,rgba(0,0,0,0.50)_65%,rgba(0,0,0,0.30)_78%,rgba(0,0,0,0.15)_88%,transparent_100%)]" />

              {/* Text */}
              <div class="absolute inset-x-0 bottom-0 z-[2] flex flex-col gap-1.5 p-4">
                <div class="line-clamp-2 font-bold text-body text-white leading-[1.35] [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
                  {p.name}
                </div>
                <div class="font-semibold text-body-sm text-white/90 tabular-nums tracking-snug [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]">
                  {formatRupiah(p.price)}
                </div>
              </div>

              {/* Add badge (hover) */}
              <div class="absolute top-2.5 right-2.5 z-[3] grid h-8 w-8 scale-50 place-items-center rounded-full bg-white/90 text-primary opacity-0 shadow-card transition duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-100 group-hover:opacity-100 dark:bg-accent">
                <PlusIcon class="h-4 w-4" />
              </div>
            </button>
          )}
        </For>
      </Show>
    </div>
  );
};
