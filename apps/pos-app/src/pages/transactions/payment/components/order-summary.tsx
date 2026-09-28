import { For } from "solid-js";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { ProductThumb } from "~/lib/assets/resolve";
import type { CartLine } from "~/lib/sales/types";
import { formatRupiah } from "~/lib/utils";

interface OrderSummaryProps {
  readonly items: readonly CartLine[];
  readonly onAdjustQty: (productId: string, delta: number) => void;
  readonly serviceCharge: number;
  readonly servicePercent: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly taxPercent: number;
  readonly total: number;
  readonly totalQty: number;
}

export const OrderSummary = (props: OrderSummaryProps) => (
  <div class="order-2 flex w-full min-w-0 flex-none flex-col overflow-hidden rounded-lg border border-border/50 bg-card lg:order-1 lg:w-[380px] lg:min-w-[380px]">
    {/* header */}
    <div class="shrink-0 border-border/50 border-b px-5 pt-5 pb-4">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-body-sm text-muted-foreground uppercase tracking-wider">
          Pesanan
        </span>
        <span class="rounded-full bg-muted px-2.5 py-[3px] font-medium text-caption text-faint-foreground dark:bg-muted dark:text-faint-foreground">
          {props.totalQty} item
        </span>
      </div>
    </div>

    {/* items */}
    <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-1">
      <For each={props.items}>
        {(item) => (
          <div class="border-border/50 border-b py-3.5 last:border-b-0">
            <div class="mb-2.5 truncate font-semibold text-body-sm text-foreground leading-tight">
              {item.name}
            </div>
            <div class="flex items-center gap-3">
              <div class="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                <ProductThumb assetId={item.imageAssetId} name={item.name} />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-caption text-faint-foreground">
                  {item.category} · {formatRupiah(item.price)}
                </div>
                <div class="font-bold text-body-sm text-foreground tabular-nums">
                  {formatRupiah(item.price * item.qty)}
                </div>
              </div>
              <QuantityStepper
                ariaLabel={item.name}
                onDecrement={() => props.onAdjustQty(item.productId, -1)}
                onIncrement={() => props.onAdjustQty(item.productId, 1)}
                value={item.qty}
              />
            </div>
          </div>
        )}
      </For>
    </div>

    {/* totals — portrait only; landscape shows the pinned strip in the
        payment column instead (see TotalBanner) */}
    <div class="shrink-0 border-border border-t bg-card px-5 py-4 lg:hidden">
      <div class="flex items-center justify-between py-1.5">
        <span class="text-body-sm text-muted-foreground">Subtotal</span>
        <span class="font-medium text-body-sm text-foreground tabular-nums">
          {formatRupiah(props.subtotal)}
        </span>
      </div>
      {props.serviceCharge > 0 && (
        <div class="flex items-center justify-between py-1.5">
          <span class="text-body-sm text-muted-foreground">
            Biaya Layanan ({props.servicePercent}%)
          </span>
          <span class="font-medium text-body-sm text-foreground tabular-nums">
            {formatRupiah(props.serviceCharge)}
          </span>
        </div>
      )}
      {props.tax > 0 && (
        <div class="flex items-center justify-between py-1.5">
          <span class="text-body-sm text-muted-foreground">
            Pajak ({props.taxPercent}%)
          </span>
          <span class="font-medium text-body-sm text-foreground tabular-nums">
            {formatRupiah(props.tax)}
          </span>
        </div>
      )}
      <div class="my-3 h-px bg-border" />
      <div class="flex items-center justify-between">
        <span class="font-bold text-body text-foreground">Total</span>
        <span class="font-extrabold text-heading text-primary tabular-nums tracking-tight dark:text-accent">
          {formatRupiah(props.total)}
        </span>
      </div>
    </div>
  </div>
);
