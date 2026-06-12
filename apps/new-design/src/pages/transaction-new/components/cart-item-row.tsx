import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { formatRupiah } from "~/lib/utils";

interface CartItemRowProps {
  readonly name: string;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
  readonly price: number;
  readonly qty: number;
}

export const CartItemRow = (props: CartItemRowProps) => (
  <div class="flex items-center gap-3 border-border-light border-b py-2.5 last:border-b-0 dark:border-[rgba(255,255,255,0.04)]">
    <div class="min-w-0 flex-1">
      <div class="truncate font-semibold text-[13px] text-text leading-[1.3] dark:text-[#f0f0f0]">
        {props.name}
      </div>
      <div class="mt-0.5 font-medium text-[12px] text-text-secondary tabular-nums dark:text-[#888]">
        {formatRupiah(props.price)}
      </div>
    </div>

    <QuantityStepper
      ariaLabel={props.name}
      onDecrement={props.onDecrement}
      onIncrement={props.onIncrement}
      value={props.qty}
    />

    <div class="min-w-[72px] shrink-0 text-right font-bold text-[14px] text-text tabular-nums dark:text-[#f0f0f0]">
      {formatRupiah(props.price * props.qty)}
    </div>
  </div>
);
