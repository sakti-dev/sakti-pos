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
  <div class="flex w-[380px] min-w-[380px] flex-col overflow-hidden rounded-[18px] border border-border/50 bg-card max-[900px]:order-2 max-[900px]:w-full max-[900px]:min-w-0 max-[900px]:flex-none dark:border-border/50 dark:bg-card">
    {/* header */}
    <div class="shrink-0 border-border/50 border-b px-5 pt-5 pb-4 dark:border-border/50">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-[13px] text-muted-foreground uppercase tracking-[0.06em]">
          Pesanan
        </span>
        <span class="rounded-full bg-muted px-2.5 py-[3px] font-medium text-[12px] text-faint-foreground dark:bg-muted dark:text-faint-foreground">
          {props.totalQty} item
        </span>
      </div>
    </div>

    {/* items */}
    <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-1">
      <For each={props.items}>
        {(item) => (
          <div class="border-border/50 border-b py-3.5 last:border-b-0 dark:border-border/50">
            <div class="mb-2.5 truncate font-semibold text-[14px] text-foreground leading-tight dark:text-foreground">
              {item.name}
            </div>
            <div class="flex items-center gap-3">
              <div class="h-12 w-12 shrink-0 overflow-hidden rounded-[6px] bg-muted">
                <img
                  alt={item.name}
                  class="h-full w-full object-cover"
                  loading="lazy"
                  src={`https://picsum.photos/id/${item.img}/120/120`}
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-[12px] text-faint-foreground">
                  {item.desc} · {formatRupiah(item.price)}
                </div>
                <div class="font-bold text-[14px] text-foreground tabular-nums dark:text-foreground">
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
    <div class="shrink-0 border-border border-t bg-card px-5 py-4 dark:border-border dark:bg-card">
      <div class="flex items-center justify-between py-1.5">
        <span class="text-[13px] text-muted-foreground">Subtotal</span>
        <span class="font-medium text-[13px] text-foreground tabular-nums dark:text-foreground">
          {formatRupiah(props.subtotal)}
        </span>
      </div>
      <div class="flex items-center justify-between py-1.5 max-[900px]:hidden">
        <span class="text-[13px] text-muted-foreground">Pajak (11%)</span>
        <span class="font-medium text-[13px] text-foreground tabular-nums dark:text-foreground">
          {formatRupiah(props.tax)}
        </span>
      </div>
      <div class="my-3 h-px bg-border max-[900px]:hidden dark:bg-border" />
      <div class="flex items-center justify-between max-[900px]:hidden">
        <span class="font-bold text-[16px] text-foreground dark:text-foreground">
          Total
        </span>
        <span class="font-extrabold text-[26px] text-primary tabular-nums tracking-[-0.02em]">
          {formatRupiah(props.total)}
        </span>
      </div>
    </div>
  </div>
);
