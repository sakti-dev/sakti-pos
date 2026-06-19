import type { CartLine } from "~/lib/sales/types";
import { CartList } from "./cart-list";
import { CartTotals } from "./cart-totals";

interface CartPanelProps {
  readonly lines: readonly CartLine[];
  readonly onDecrement: (productId: number) => void;
  readonly onIncrement: (productId: number) => void;
  readonly onPay: () => void;
  readonly onProcess: () => void;
}

export const CartPanel = (props: CartPanelProps) => {
  const totalItems = () => props.lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = () => props.lines.reduce((s, l) => s + l.price * l.qty, 0);

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
          lines={props.lines}
          onDecrement={props.onDecrement}
          onIncrement={props.onIncrement}
        />
      </div>

      <CartTotals
        disabled={props.lines.length === 0}
        onPay={props.onPay}
        onProcess={props.onProcess}
        subtotal={subtotal()}
      />
    </>
  );
};
