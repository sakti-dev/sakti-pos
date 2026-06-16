import { Badge } from "~/components/ui/badge";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import type { Product } from "~/lib/data/catalog";
import { stockStatus } from "~/lib/inventory/stats";
import { currentStock } from "~/lib/inventory/store";
import { cn, formatRupiah } from "~/lib/utils";

export interface InventoryRowProps {
  readonly onAdjust: (direction: "in" | "out") => void;
  readonly product: Product;
}

export function InventoryRow(props: InventoryRowProps) {
  const stock = () => currentStock(props.product.id);
  const s = () => stockStatus(stock());
  const dotClass = () => {
    if (s().status === "out") {
      return "bg-danger";
    }
    if (s().status === "low") {
      return "bg-warning";
    }
    return "bg-success";
  };

  return (
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/20 lg:gap-4">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.product.name}
        </h3>
        <p class="mt-0.5 truncate text-caption-sm text-faint-foreground">
          {props.product.sku} · {formatRupiah(props.product.price)}
        </p>
        <div class="mt-1 flex items-center gap-1.5">
          <span class={cn("inline-block size-1.5 rounded-full", dotClass())} />
          <Badge size="sm" variant={s().badge}>
            {s().label}
          </Badge>
        </div>
      </div>
      <div class="flex shrink-0 flex-col items-center gap-1">
        <QuantityStepper
          ariaLabel={`Stok ${props.product.name}`}
          editable
          onDecrement={() => props.onAdjust("out")}
          onIncrement={() => props.onAdjust("in")}
          onInput={() => props.onAdjust("out")}
          value={stock()}
        />
        <span class="font-medium text-caption-sm text-faint-foreground">
          {props.product.unit}
        </span>
      </div>
    </div>
  );
}
