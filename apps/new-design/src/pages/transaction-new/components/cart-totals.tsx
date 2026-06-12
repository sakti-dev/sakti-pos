import { CreditCardIcon, FileIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import { formatRupiah } from "~/lib/utils";

interface CartTotalsProps {
  readonly disabled: boolean;
  readonly onPay: () => void;
  readonly onProcess: () => void;
  readonly subtotal: number;
  readonly taxRate?: number;
}

export const CartTotals = (props: CartTotalsProps) => {
  const tax = () => Math.round(props.subtotal * (props.taxRate ?? 0.11));
  const total = () => props.subtotal + tax();

  return (
    <div class="flex shrink-0 flex-col gap-3 border-border border-t bg-surface px-5 py-4 dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1a1a1a]">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="font-medium text-[13px] text-text-secondary dark:text-[#888]">
            Subtotal
          </span>
          <span class="font-semibold text-[13px] text-text tabular-nums dark:text-[#f0f0f0]">
            {formatRupiah(props.subtotal)}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="font-medium text-[13px] text-text-secondary dark:text-[#888]">
            Pajak ({((props.taxRate ?? 0.11) * 100).toFixed(0)}%)
          </span>
          <span class="font-semibold text-[13px] text-text tabular-nums dark:text-[#f0f0f0]">
            {formatRupiah(tax())}
          </span>
        </div>
        <div class="my-1 h-px bg-border dark:bg-[rgba(255,255,255,0.06)]" />
        <div class="flex items-center justify-between">
          <span class="font-bold text-[15px] text-text dark:text-[#f0f0f0]">
            Total
          </span>
          <span class="font-bold text-[18px] text-primary tabular-nums tracking-[-0.01em] dark:text-accent">
            {formatRupiah(total())}
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <Button
          aria-label="Bayar"
          class="rounded-[14px] shadow-[0_4px_16px_rgba(9,73,51,0.20)] hover:shadow-[0_6px_24px_rgba(9,73,51,0.30)] active:scale-[0.98] active:shadow-[0_2px_8px_rgba(9,73,51,0.20)] disabled:opacity-40 disabled:shadow-none dark:shadow-[0_4px_16px_rgba(0,0,0,0.50)] dark:disabled:bg-[#2a2a2a] dark:disabled:text-[#555] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.60)]"
          disabled={props.disabled}
          onClick={props.onPay}
          size="lg"
          type="button"
        >
          <CreditCardIcon class="h-[18px] w-[18px]" />
          Bayar Sekarang
        </Button>
        <Button
          aria-label="Proses"
          class="rounded-[14px] disabled:opacity-40"
          disabled={props.disabled}
          look="outline"
          onClick={props.onProcess}
          size="lg"
          tone="primary"
          type="button"
        >
          <FileIcon class="h-4 w-4" />
          Simpan Pesanan
        </Button>
      </div>
    </div>
  );
};
