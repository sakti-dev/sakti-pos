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
    <div class="flex shrink-0 flex-col gap-3 border-border border-t bg-card px-5 py-4">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="font-medium text-[13px] text-muted-foreground">
            Subtotal
          </span>
          <span class="font-semibold text-[13px] text-foreground tabular-nums">
            {formatRupiah(props.subtotal)}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="font-medium text-[13px] text-muted-foreground">
            Pajak ({((props.taxRate ?? 0.11) * 100).toFixed(0)}%)
          </span>
          <span class="font-semibold text-[13px] text-foreground tabular-nums">
            {formatRupiah(tax())}
          </span>
        </div>
        <div class="my-1 h-px bg-border" />
        <div class="flex items-center justify-between">
          <span class="font-bold text-[15px] text-foreground">
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
          class="rounded-[14px] shadow-card hover:shadow-card-hover active:scale-[0.98] active:shadow-card disabled:opacity-40 disabled:shadow-none"
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
