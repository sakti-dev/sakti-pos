import { QuantityStepper } from "~/components/ui/quantity-stepper";
import type { LineModifier } from "~/lib/sales/types";
import { formatRupiah } from "~/lib/utils";

interface CartItemRowProps {
  readonly modifiers?: readonly LineModifier[];
  readonly name: string;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
  readonly price: number;
  readonly qty: number;
}

export const CartItemRow = (props: CartItemRowProps) => (
  <div class="flex items-center gap-3 border-border/50 border-b py-2.5 last:border-b-0">
    <div class="min-w-0 flex-1">
      <div class="truncate font-semibold text-body-sm text-foreground leading-[1.3]">
        {props.name}
      </div>
      {(props.modifiers?.length ?? 0) > 0 && (
        <div class="truncate text-caption-sm text-muted-foreground">
          {props.modifiers!.map((m) => m.label).join(" · ")}
        </div>
      )}
      <div class="mt-0.5 font-medium text-caption text-muted-foreground tabular-nums">
        {formatRupiah(props.price)}
      </div>
    </div>

    <QuantityStepper
      ariaLabel={props.name}
      onDecrement={props.onDecrement}
      onIncrement={props.onIncrement}
      value={props.qty}
    />

    <div class="min-w-[72px] shrink-0 text-right font-bold text-body-sm text-foreground tabular-nums">
      {formatRupiah(props.price * props.qty)}
    </div>
  </div>
);
