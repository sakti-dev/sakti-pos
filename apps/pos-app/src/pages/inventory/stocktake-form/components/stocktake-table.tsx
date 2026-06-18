import { For, Show } from "solid-js";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { cn } from "~/lib/utils";
import { currentStock } from "../../components/lib/store";
import { DeltaBadge } from "./delta";
import { EmptyStateView } from "./empty-state";
import type { StocktakeState } from "./use-stocktake";

export function StocktakeTable(props: { state: StocktakeState }) {
  const s = () => props.state;

  return (
    <div class="@container scrollbar-none hidden md:block">
      <table class="w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          <col />
          <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
          <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
          <col class="@[1024px]:w-36 @[1280px]:w-40 @[800px]:w-32 w-28" />
        </colgroup>
        <thead>
          <tr class="sticky top-0 z-10">
            <th class="border-sage border-b-2 bg-card px-4 pt-3 pb-2.5 text-left font-semibold text-body-sm text-foreground">
              Nama Barang
            </th>
            <th class="border-sage border-b-2 bg-card px-3 pt-3 pb-2.5 text-center font-semibold text-body-sm text-foreground">
              Stok Tercatat
            </th>
            <th class="border-sage border-b-2 bg-card px-3 pt-3 pb-2.5 text-center font-semibold text-body-sm text-foreground">
              Hasil Hitung
            </th>
            <th class="border-sage border-b-2 bg-card px-3 pt-3 pb-2.5 text-center font-semibold text-body-sm text-foreground">
              Selisih
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={s().filteredItems()}>
            {(p, i) => {
              const system = () => currentStock(p.id);
              const counted = () => s().counts()[p.id] ?? system();
              const diff = () => s().diffOf(p.id);

              return (
                <tr
                  class={cn(
                    "border-border border-b last:border-b-0",
                    i() % 2 === 1 && "bg-card"
                  )}
                >
                  <td class="px-4 py-2.5">
                    <p class="truncate font-medium text-body-sm text-foreground">
                      {p.name}
                    </p>
                    <p class="text-caption-sm text-faint-foreground">{p.sku}</p>
                  </td>
                  <td class="px-3 py-2.5 text-center font-medium text-body-sm text-muted-foreground tabular-nums">
                    {system()}{" "}
                    <span class="text-caption text-faint-foreground">
                      {p.unit}
                    </span>
                  </td>
                  <td class="px-3 py-2.5">
                    <div class="flex items-center gap-1.5">
                      <QuantityStepper
                        ariaLabel={p.name}
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
                  </td>
                  <td class="px-3 py-2.5">
                    <DeltaBadge diff={diff()} unit={p.unit} />
                  </td>
                </tr>
              );
            }}
          </For>
          <Show when={s().emptyState().kind !== "none"}>
            <tr>
              <td class="py-12" colspan={4}>
                <EmptyStateView
                  onAction={() => s().onEmptyCta(s().emptyState().kind)}
                  scope={s().scope}
                  state={s().emptyState()}
                />
              </td>
            </tr>
          </Show>
        </tbody>
      </table>
    </div>
  );
}
