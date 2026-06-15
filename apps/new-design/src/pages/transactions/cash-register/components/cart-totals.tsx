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

export const CartTotals = (props: CartTotalsProps) => (
  <div class="flex shrink-0 flex-col gap-3 border-border border-t bg-card px-5 py-4">
    <div class="flex items-center justify-between">
      <span class="font-bold text-body text-foreground">Total</span>
      <span class="font-bold text-body-lg text-primary tabular-nums dark:text-accent">
        {formatRupiah(props.subtotal)}
      </span>
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
