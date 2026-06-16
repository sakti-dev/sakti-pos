import { For } from "solid-js";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { formatRupiah } from "~/lib/utils";

export interface OrderItem {
  readonly desc: string;
  readonly id: number;
  readonly img: number;
  readonly name: string;
  readonly price: number;
  qty: number;
}

interface OrderSummaryProps {
  readonly items: readonly OrderItem[];
  readonly onAdjustQty: (id: number, delta: number) => void;
  readonly subtotal: number;
  readonly tax: number;
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
                <img
                  alt={item.name}
                  class="h-full w-full object-cover"
                  loading="lazy"
                  src={`https://picsum.photos/id/${item.img}/120/120`}
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-caption text-faint-foreground">
                  {item.desc} · {formatRupiah(item.price)}
                </div>
                <div class="font-bold text-body-sm text-foreground tabular-nums">
                  {formatRupiah(item.price * item.qty)}
                </div>
              </div>
              <QuantityStepper
                ariaLabel={item.name}
                onDecrement={() => props.onAdjustQty(item.id, -1)}
                onIncrement={() => props.onAdjustQty(item.id, 1)}
                value={item.qty}
              />
            </div>
          </div>
        )}
      </For>
    </div>

    {/* totals — simplified on mobile: only subtotal row visible */}
    <div class="shrink-0 border-border border-t bg-card px-5 py-4">
      <div class="flex items-center justify-between py-1.5">
        <span class="text-body-sm text-muted-foreground">Subtotal</span>
        <span class="font-medium text-body-sm text-foreground tabular-nums">
          {formatRupiah(props.subtotal)}
        </span>
      </div>
      <div class="flex items-center justify-between py-1.5">
        <span class="text-body-sm text-muted-foreground">Pajak (11%)</span>
        <span class="font-medium text-body-sm text-foreground tabular-nums">
          {formatRupiah(props.tax)}
        </span>
      </div>
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
