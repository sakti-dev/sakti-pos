import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { ProductImage } from "~/components/image";
import { cardVariants } from "~/components/ui/card";
import type { ProductWithCategory } from "~/db/orders";
import { cn, formatIDR } from "~/lib/utils";
import { addToCart } from "~/store/cart";

interface ProductGridProps {
  products: ProductWithCategory[];
}

export const ProductGrid: Component<ProductGridProps> = (props) => (
  <Show
    fallback={
      <div class="flex flex-1 flex-col items-center justify-center gap-1 py-12 text-muted-foreground">
        <p>Tidak ada produk</p>
        <p class="text-sm">Tambahkan produk di halaman Menu</p>
      </div>
    }
    when={props.products.length > 0}
  >
    <div class="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
      <For each={props.products}>
        {(product) => (
          <button
            class={cn(
              cardVariants({ radius: "lg", interactive: "pressable" }),
              "flex min-h-[96px] flex-col items-start justify-between gap-2 text-left"
            )}
            onClick={() => addToCart(product)}
            type="button"
          >
            <ProductImage
              alt={product.name}
              class="h-16 w-full rounded-md"
              entityId={product.id}
              imageAssetId={product.imageAssetId ?? null}
            />
            <span class="line-clamp-2 w-full font-medium leading-snug">
              {product.name}
            </span>
            <span class="font-semibold text-primary">
              {formatIDR(product.priceMinorUnits)}
            </span>
          </button>
        )}
      </For>
    </div>
  </Show>
);
