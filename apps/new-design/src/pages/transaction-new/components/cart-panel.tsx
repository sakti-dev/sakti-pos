import { For, Show } from "solid-js";
import { CartShoppingIcon } from "~/assets";
import { CartItemRow } from "./cart-item-row";
import { CartTotals } from "./cart-totals";
import type { CartEntry, Product } from "./types";

interface CartPanelProps {
  readonly cart: readonly CartEntry[];
  readonly onDecrement: (id: number) => void;
  readonly onIncrement: (id: number) => void;
  readonly onPay: () => void;
  readonly onProcess: () => void;
  readonly products: readonly Product[];
}

export const CartPanel = (props: CartPanelProps) => {
  const totalItems = () => props.cart.reduce((s, c) => s + c.qty, 0);
  const subtotal = () =>
    props.cart.reduce((s, c) => {
      const p = props.products.find((pr) => pr.id === c.id);
      return s + (p ? p.price * c.qty : 0);
    }, 0);

  return (
    <>
      <div class="flex shrink-0 items-center justify-between border-border border-b px-5 pt-5 pb-3.5 dark:border-[rgba(255,255,255,0.06)]">
        <span class="font-bold text-[15px] text-text tracking-[-0.01em] dark:text-[#f0f0f0]">
          Keranjang
        </span>
        <span class="rounded-pill bg-surface-gray px-2.5 py-[2px] font-semibold text-[12px] text-text-muted tracking-[0.02em] dark:bg-[#252525] dark:text-[#888]">
          {totalItems()} item
        </span>
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-3">
        <Show
          fallback={
            <div class="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-text-muted">
              <CartShoppingIcon class="h-12 w-12 opacity-30" />
              <span class="font-medium text-[14px] tracking-[0.01em]">
                Keranjang kosong
              </span>
              <span class="text-[12px] tracking-[0.02em]">
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
      </div>

      <CartTotals
        disabled={props.cart.length === 0}
        onPay={props.onPay}
        onProcess={props.onProcess}
        subtotal={subtotal()}
      />
    </>
  );
};
