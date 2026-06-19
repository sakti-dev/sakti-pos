import { For, Show } from "solid-js";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";
import { currentStock } from "../../components/lib/store";
import { DeltaBadge } from "./delta";
import { EmptyStateView } from "./empty-state";
import type { StocktakeState } from "./use-stocktake";

export function StocktakeTable(props: { state: StocktakeState }) {
  const s = () => props.state;

  return (
    <div class="@container scrollbar-none hidden md:block">
      <Table class="table-fixed">
        <colgroup>
          <col />
          <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
          <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
          <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
        </colgroup>
        <TableHeader>
          <TableRow class="sticky top-0 z-10">
            <TableHead class="border-sage border-b-2 bg-card px-4 pt-3 pb-2.5 font-semibold text-body-sm">
              Nama Barang
            </TableHead>
            <TableHead class="border-sage border-b-2 bg-card px-3 pt-3 pb-2.5 text-center font-semibold text-body-sm">
              Stok Tercatat
            </TableHead>
            <TableHead class="border-sage border-b-2 bg-card px-3 pt-3 pb-2.5 text-center font-semibold text-body-sm">
              Hasil Hitung
            </TableHead>
            <TableHead class="border-sage border-b-2 bg-card px-3 pt-3 pb-2.5 text-center font-semibold text-body-sm">
              Selisih
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <For each={s().filteredItems()}>
            {(p, i) => {
              const system = () => currentStock(p.id);
              const counted = () => s().counts()[p.id] ?? system();
              const diff = () => s().diffOf(p.id);

              return (
                <TableRow
                  class={cn(
                    "border-border border-b",
                    i() % 2 === 1 && "bg-card"
                  )}
                >
                  <TableCell class="px-4 py-2.5">
                    <p class="truncate font-medium text-body-sm text-foreground">
                      {p.name}
                    </p>
                    <p class="text-caption-sm text-faint-foreground">{p.sku}</p>
                  </TableCell>
                  <TableCell class="px-3 py-2.5 text-center font-medium text-body-sm text-muted-foreground tabular-nums">
                    {system()}{" "}
                    <span class="text-caption text-faint-foreground">
                      {p.unit}
                    </span>
                  </TableCell>
                  <TableCell class="px-3 py-2.5">
                    <div class="flex items-center gap-1.5">
                      <QuantityStepper
                        ariaLabel={p.name}
                        class="w-full"
                        editable
                        onDecrement={() => s().decrement(p.id)}
                        onIncrement={() => s().increment(p.id)}
                        onInput={(v) => s().setCount(p.id, v)}
                        value={counted()}
                      />
                      <span class="shrink-0 text-caption text-faint-foreground">
                        {p.unit}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell class="px-3 py-2.5">
                    <DeltaBadge diff={diff()} unit={p.unit} />
                  </TableCell>
                </TableRow>
              );
            }}
          </For>
          <Show when={s().emptyState().kind !== "none"}>
            <TableRow>
              <TableCell class="py-12" colspan={4}>
                <EmptyStateView
                  onAction={() => s().onEmptyCta(s().emptyState().kind)}
                  scope={s().scope}
                  state={s().emptyState()}
                />
              </TableCell>
            </TableRow>
          </Show>
        </TableBody>
      </Table>
    </div>
  );
}
