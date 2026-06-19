import { For, Show } from "solid-js";
import { CartShoppingIcon } from "~/assets";
import type { CartLine } from "~/lib/sales/types";
import { CartItemRow } from "./cart-item-row";

interface CartListProps {
  readonly lines: readonly CartLine[];
  readonly onDecrement: (productId: number) => void;
  readonly onIncrement: (productId: number) => void;
}

export const CartList = (props: CartListProps) => (
  <Show
    fallback={
      <div class="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-muted-foreground">
        <CartShoppingIcon class="h-12 w-12 opacity-30" />
        <span class="font-medium text-body-sm">Keranjang kosong</span>
        <span class="text-caption tracking-wide">
          Tap menu untuk menambahkan
        </span>
      </div>
    }
    when={props.lines.length > 0}
  >
    <For each={props.lines}>
      {(line) => (
        <CartItemRow
          name={line.name}
          onDecrement={() => props.onDecrement(line.productId)}
          onIncrement={() => props.onIncrement(line.productId)}
          price={line.price}
          qty={line.qty}
        />
      )}
    </For>
  </Show>
);
