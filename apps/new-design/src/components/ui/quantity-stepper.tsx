import { cn } from "~/lib/utils";

interface QuantityStepperProps {
  readonly ariaLabel?: string;
  readonly class?: string;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
  readonly value: number;
}

export const QuantityStepper = (props: QuantityStepperProps) => (
  <div
    class={cn(
      "flex shrink-0 items-center overflow-hidden rounded-[6px] border border-border",
      props.class
    )}
  >
    <button
      aria-label={`Kurangi ${props.ariaLabel ?? "jumlah"}`}
      class="grid h-9 w-9 place-items-center bg-card text-[16px] text-foreground transition-[background] duration-100 hover:bg-muted active:bg-primary/5"
      onClick={props.onDecrement}
      type="button"
    >
      −
    </button>
    <span class="grid h-9 w-8 place-items-center border-border border-x bg-muted font-semibold text-[13px] text-foreground tabular-nums">
      {String(props.value).padStart(2, "0")}
    </span>
    <button
      aria-label={`Tambah ${props.ariaLabel ?? "jumlah"}`}
      class="grid h-9 w-9 place-items-center bg-card text-[16px] text-foreground transition-[background] duration-100 hover:bg-muted active:bg-primary/5"
      onClick={props.onIncrement}
      type="button"
    >
      +
    </button>
  </div>
);
