import type { CartEntry, Product } from "./types";

export interface CartSheetProps {
  readonly cart: readonly CartEntry[];
  readonly onClose: () => void;
  readonly onDecrement: (id: number) => void;
  readonly onIncrement: (id: number) => void;
  readonly onPay: () => void;
  readonly onProcess: () => void;
  readonly open: boolean;
  readonly products: readonly Product[];
}

export const CartSheet = (props: CartSheetProps) => {
  return (
    <>
      {/* Mobile cart FAB */}
      <button
        aria-label="Buka keranjang"
        class="fixed right-4 bottom-5 left-4 z-[90] flex hidden h-14 items-center justify-between rounded-[14px] bg-primary px-5 font-semibold text-[14px] text-cream tracking-[0.02em] shadow-[0_6px_24px_rgba(26,51,0,0.35)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(26,51,0,0.45)] active:scale-[0.98] max-[900px]:flex dark:bg-[#2d5a00] dark:shadow-[0_6px_24px_rgba(0,0,0,0.60)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.70)]"
        onClick={() => props.onClose()} /* opens sheet via parent state */
        type="button"
      >
        {/* Placeholder — actual FAB will be driven by parent */}
      </button>

      {/* Overlay */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: overlay dismiss backdrop */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: overlay backdrop */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: overlay backdrop */}
      <div
        class="fixed inset-0 z-[200] hidden bg-[rgba(0,0,0,0.40)] transition-[background] duration-300 max-[900px]:block"
        classList={{
          "pointer-events-auto": props.open,
          "pointer-events-none": !props.open,
          "bg-[rgba(0,0,0,0)]": !props.open,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div
          class="absolute right-0 bottom-0 left-0 flex max-h-[85vh] flex-col rounded-t-lg bg-surface shadow-[0_-8px_40px_rgba(0,0,0,0.15)] transition-transform duration-350 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] dark:bg-[#1a1a1a] dark:shadow-[0_-8px_40px_rgba(0,0,0,0.40)]"
          classList={{
            "translate-y-0": props.open,
            "translate-y-full": !props.open,
          }}
        >
          <div class="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border dark:bg-[rgba(255,255,255,0.12)]" />
          {/* Sheet content is a placeholder — will be wired by parent */}
        </div>
      </div>
    </>
  );
};
