import { A } from "@solidjs/router";
import { Badge } from "~/components/ui/badge";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { type Product, stockStatus } from "~/lib/data/catalog";
import { formatRupiah } from "~/lib/utils";

export function InventoryRow(props: {
  onAdjustStock: (delta: number) => void;
  onSetStock: (value: number) => void;
  product: Product;
  stock: number;
}) {
  const s = () => stockStatus(props.stock);
  return (
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/20 lg:gap-4">
      <A
        aria-label={`Edit ${props.product.name}`}
        class="min-w-0 flex-1 no-underline"
        href="#"
      >
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.product.name}
        </h3>
        <p class="mt-0.5 truncate text-caption-sm text-faint-foreground">
          {props.product.sku} · {formatRupiah(props.product.price)}
        </p>
        <Badge class="mt-1" size="sm" variant={s().badge}>
          {s().label}
        </Badge>
      </A>
      <div class="flex shrink-0 flex-col items-center gap-1">
        <QuantityStepper
          ariaLabel={`Stok ${props.product.name}`}
          editable
          onDecrement={() => props.onAdjustStock(-1)}
          onIncrement={() => props.onAdjustStock(1)}
          onInput={(v) => props.onSetStock(v)}
          value={props.stock}
        />
        <span class="font-medium text-caption-sm text-faint-foreground">
          {props.product.unit}
        </span>
      </div>
    </div>
  );
}
