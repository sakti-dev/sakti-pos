import type { Component } from "solid-js";
import { Show } from "solid-js";
import { Card } from "~/components/ui/card";
import type { DailySummary } from "~/db/orders";
import { formatIDR } from "~/lib/utils";

interface DailySummaryBarProps {
  data: DailySummary | undefined;
}

export const DailySummaryBar: Component<DailySummaryBarProps> = (props) => (
  <Show when={props.data}>
    {(data) => (
      <div class="grid grid-cols-2 gap-2">
        <Card size="sm">
          <p class="text-muted-foreground text-xs">Pesanan</p>
          <p class="font-bold text-lg">{data().orderCount}</p>
        </Card>
        <Card size="sm">
          <p class="text-muted-foreground text-xs">Total</p>
          <p class="font-bold text-lg text-primary">
            {formatIDR(data().totalRevenue)}
          </p>
        </Card>
        <Card size="sm">
          <p class="text-muted-foreground text-xs">Tunai</p>
          <p class="font-bold">{formatIDR(data().cashTotal)}</p>
        </Card>
        <Card size="sm">
          <p class="text-muted-foreground text-xs">QRIS</p>
          <p class="font-bold">{formatIDR(data().qrisTotal)}</p>
        </Card>
      </div>
    )}
  </Show>
);
