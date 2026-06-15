import { For, Show } from "solid-js";
import { CartShoppingIcon } from "~/assets";
import { CartItemRow } from "./cart-item-row";
import type { CartEntry, Product } from "./types";

interface CartListProps {
  readonly cart: readonly CartEntry[];
  readonly onDecrement: (id: number) => void;
  readonly onIncrement: (id: number) => void;
  readonly products: readonly Product[];
}

export const CartList = (props: CartListProps) => (
  <Show
    fallback={
      <div class="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-muted-foreground">
        <CartShoppingIcon class="h-12 w-12 opacity-30" />
        <span class="font-medium text-body-sm">Keranjang kosong</span>
        <span class="text-caption tracking-[0.02em]">
          Tap menu untuk menambahkan
        </span>
      </div>
    }
    when={props.cart.length > 0}
  >
    <For each={props.cart}>
      {(item) => {
        const p = () => props.products.find((pr) => pr.id === item.id);
        return (
          <CartItemRow
            name={p()?.name ?? ""}
            onDecrement={() => props.onDecrement(item.id)}
            onIncrement={() => props.onIncrement(item.id)}
            price={p()?.price ?? 0}
            qty={item.qty}
          />
        );
      }}
    </For>
  </Show>
);
