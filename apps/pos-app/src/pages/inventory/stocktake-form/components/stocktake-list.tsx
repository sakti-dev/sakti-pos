import { For, Show } from "solid-js";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { currentStock } from "../../components/lib/store";
import { DeltaInline } from "./delta";
import { EmptyStateView } from "./empty-state";
import type { StocktakeState } from "./use-stocktake";

export function StocktakeList(props: { state: StocktakeState }) {
  const s = () => props.state;

  return (
    <div class="block px-4 md:hidden">
      <For each={s().filteredItems()}>
        {(p) => {
          const system = () => currentStock(p.id);
          const counted = () => s().counts()[p.id] ?? system();
          const diff = () => s().diffOf(p.id);

          return (
            <div class="flex items-start gap-3 border-border border-b py-3">
              {/* Left: name + meta */}
              <div class="min-w-0 flex-1 pt-0.5">
                <p class="truncate font-medium text-body-sm text-foreground">
                  {p.name}
                </p>
                <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-body-sm text-muted-foreground">
                  <span>
                    Stok Tercatat: {system()} {p.unit}
                  </span>
                  <span>· </span>
                  <DeltaInline diff={diff()} unit={p.unit} />
                </div>
              </div>

              {/* Right: stepper */}
              <div class="w-32 shrink-0">
                <QuantityStepper
                  ariaLabel={p.name}
                  editable
                  onDecrement={() => s().decrement(p.id)}
                  onIncrement={() => s().increment(p.id)}
                  onInput={(v) => s().setCount(p.id, v)}
                  value={counted()}
                />
              </div>
            </div>
          );
        }}
      </For>

      <Show when={s().emptyState().kind !== "none"}>
        <div class="py-12">
          <EmptyStateView
            onAction={() => s().onEmptyCta(s().emptyState().kind)}
            scope={s().scope}
            state={s().emptyState()}
          />
        </div>
      </Show>
    </div>
  );
}
