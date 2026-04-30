import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import type { ProductWithCategory } from "~/db/orders";
import { addToCart } from "~/lib/cart";
import { formatIDR } from "~/lib/utils";

interface ProductGridProps {
  products: ProductWithCategory[];
}

const ProductGrid: Component<ProductGridProps> = (props) => (
  <Show
    fallback={
      <div class="flex flex-1 items-center justify-center py-12 text-muted-foreground">
        Tidak ada produk
      </div>
    }
    when={props.products.length > 0}
  >
    <div class="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3">
      <For each={props.products}>
        {(product) => (
          <button
            class="flex min-h-[80px] flex-col items-start justify-between rounded-xl border border-border bg-card p-3 text-left active:bg-accent/80"
            onClick={() => addToCart(product)}
            type="button"
          >
            <span class="line-clamp-2 w-full font-medium text-sm leading-snug">
              {product.name}
            </span>
            <span class="font-semibold text-primary text-xs">
              {formatIDR(product.price)}
            </span>
          </button>
        )}
      </For>
    </div>
  </Show>
);

export { ProductGrid };
