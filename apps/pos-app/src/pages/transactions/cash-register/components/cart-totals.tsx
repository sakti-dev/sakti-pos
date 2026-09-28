import { CreditCardIcon, FileIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import type { OrderTotals } from "~/lib/sales/types";
import { formatRupiah } from "~/lib/utils";

interface CartTotalsProps {
  readonly disabled: boolean;
  readonly onPay: () => void;
  readonly onProcess: () => void;
  readonly totals: OrderTotals;
}

export const CartTotals = (props: CartTotalsProps) => (
  <div class="flex shrink-0 flex-col gap-3 border-border border-t bg-card px-5 py-4">
    <div class="flex items-center justify-between">
      <span class="text-body-sm text-muted-foreground">Subtotal</span>
      <span class="font-medium text-body-sm text-foreground tabular-nums">
        {formatRupiah(props.totals.subtotal)}
      </span>
    </div>
    {props.totals.serviceCharge > 0 && (
      <div class="flex items-center justify-between">
        <span class="text-body-sm text-muted-foreground">
          Biaya Layanan ({Math.round(props.totals.serviceChargeRate * 100)}%)
        </span>
        <span class="font-medium text-body-sm text-foreground tabular-nums">
          {formatRupiah(props.totals.serviceCharge)}
        </span>
      </div>
    )}
    {props.totals.tax > 0 && (
      <div class="flex items-center justify-between">
        <span class="text-body-sm text-muted-foreground">
          Pajak ({Math.round(props.totals.taxRate * 100)}%)
        </span>
        <span class="font-medium text-body-sm text-foreground tabular-nums">
          {formatRupiah(props.totals.tax)}
        </span>
      </div>
    )}
    <div class="flex items-center justify-between">
      <span class="font-bold text-body text-foreground">Total</span>
      <span class="font-bold text-body-lg text-primary tabular-nums dark:text-accent">
        {formatRupiah(props.totals.total)}
      </span>
    </div>

    <div class="flex flex-col gap-2">
      <Button
        aria-label="Bayar"
        class="rounded-2xl shadow-card hover:shadow-card-hover active:scale-[0.98] active:shadow-card disabled:opacity-40 disabled:shadow-none"
        disabled={props.disabled}
        onClick={props.onPay}
        size="lg"
        type="button"
      >
        <CreditCardIcon class="size-5" />
        Bayar Sekarang
      </Button>
      <Button
        aria-label="Proses"
        class="rounded-2xl disabled:opacity-40"
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
