import { CartList } from "./cart-list";
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
      <div class="flex h-header shrink-0 items-center justify-between border-border border-b px-5">
        <span class="font-bold font-display text-foreground text-lg tracking-snug">
          Keranjang
        </span>
        <span class="rounded-full bg-muted px-2.5 py-[2px] font-semibold text-caption text-muted-foreground tracking-wide">
          {totalItems()} item
        </span>
      </div>

      <div class="scrollbar-none flex flex-1 flex-col overflow-y-auto px-5 py-3">
        <CartList
          cart={props.cart}
          onDecrement={props.onDecrement}
          onIncrement={props.onIncrement}
          products={props.products}
        />
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
