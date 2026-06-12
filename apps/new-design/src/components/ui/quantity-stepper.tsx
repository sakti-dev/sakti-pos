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
      "flex shrink-0 items-center overflow-hidden rounded-[6px] border border-border dark:border-[rgba(255,255,255,0.10)]",
      props.class
    )}
  >
    <button
      aria-label={`Kurangi ${props.ariaLabel ?? "jumlah"}`}
      class="grid h-9 w-9 place-items-center bg-surface text-[16px] text-text transition-[background] duration-100 hover:bg-surface-gray active:bg-primary-light dark:bg-[#2a2a2a] dark:text-[#ccc] dark:hover:bg-[#333]"
      onClick={props.onDecrement}
      type="button"
    >
      −
    </button>
    <span class="grid h-9 w-8 place-items-center border-border border-x bg-surface-gray font-semibold text-[13px] text-text tabular-nums dark:border-[rgba(255,255,255,0.10)] dark:bg-[#222] dark:text-[#ddd]">
      {String(props.value).padStart(2, "0")}
    </span>
    <button
      aria-label={`Tambah ${props.ariaLabel ?? "jumlah"}`}
      class="grid h-9 w-9 place-items-center bg-surface text-[16px] text-text transition-[background] duration-100 hover:bg-surface-gray active:bg-primary-light dark:bg-[#2a2a2a] dark:text-[#ccc] dark:hover:bg-[#333]"
      onClick={props.onIncrement}
      type="button"
    >
      +
    </button>
  </div>
);
