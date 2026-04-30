import type { Component } from "solid-js";
import { Show } from "solid-js";
import type { DailySummary } from "~/db/orders";
import { formatIDR } from "~/lib/utils";

interface DailySummaryBarProps {
  data: DailySummary | undefined;
}

const DailySummaryBar: Component<DailySummaryBarProps> = (props) => (
  <Show when={props.data}>
    {(data) => (
      <div class="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3">
        <div class="text-center">
          <p class="font-bold text-lg">{data().orderCount}</p>
          <p class="text-muted-foreground text-xs">Pesanan</p>
        </div>
        <div class="text-center">
          <p class="font-bold text-lg text-primary">
            {formatIDR(data().totalRevenue)}
          </p>
          <p class="text-muted-foreground text-xs">Total</p>
        </div>
        <div class="text-center">
          <p class="text-muted-foreground text-xs">Tunai / QRIS</p>
          <p class="text-xs">
            <span class="font-medium">{formatIDR(data().cashTotal)}</span>
            {" / "}
            <span class="font-medium">{formatIDR(data().qrisTotal)}</span>
          </p>
        </div>
      </div>
    )}
  </Show>
);

export { DailySummaryBar };
