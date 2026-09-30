import { createEffect, For, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
} from "~/components/ui/adaptive-dialog";
import { Button } from "~/components/ui/button";
import type { ModifierGroupRow } from "~/db/modifier-groups";
import type { LineModifier, Product } from "~/lib/sales/types";
import { cn, formatRupiah } from "~/lib/utils";

interface ModifierSheetProps {
  readonly groups: readonly ModifierGroupRow[];
  readonly onAdd: (modifiers: readonly LineModifier[]) => void;
  readonly onClose: () => void;
  /** null = closed; otherwise the product being configured. */
  readonly product: Product | null;
}

/** Per-group selection state; single groups hold one option id (or null
 *  for the "Tanpa" escape), multi groups hold a set. */
interface Selection {
  readonly multi: Record<string, Set<string>>;
  readonly single: Record<string, string | null>;
}

function defaultSelection(groups: readonly ModifierGroupRow[]): Selection {
  const single: Record<string, string | null> = {};
  const multi: Record<string, Set<string>> = {};
  for (const group of groups) {
    if (group.selectionType === "single") {
      // Required single preselects the first option (spec: cart-add).
      single[group.id] = group.isRequired
        ? (group.options[0]?.id ?? null)
        : null;
    } else {
      multi[group.id] = new Set(
        group.isRequired && group.options[0] ? [group.options[0].id] : []
      );
    }
  }
  return { multi, single };
}

export const ModifierSheet = (props: ModifierSheetProps) => {
  const groups = () => props.groups;
  const [selection, setSelection] = createStore<Selection>(
    defaultSelection([])
  );
  // Reset per product: fresh defaults each time the sheet opens.
  createEffect(() => {
    if (props.product != null) {
      setSelection(reconcile(defaultSelection(props.groups)));
    }
  });

  const chosen = (): LineModifier[] => {
    const result: LineModifier[] = [];
    for (const group of groups()) {
      if (group.selectionType === "single") {
        const optionId = selection.single[group.id];
        const option = group.options.find((o) => o.id === optionId);
        if (option) {
          result.push(toModifier(group, option));
        }
        continue;
      }
      for (const option of group.options) {
        if (selection.multi[group.id]?.has(option.id)) {
          result.push(toModifier(group, option));
        }
      }
    }
    return result;
  };

  const unitPrice = () => {
    const delta = chosen().reduce((sum, m) => sum + m.priceDelta, 0);
    return (props.product?.price ?? 0) + delta;
  };

  return (
    <Show when={props.product != null}>
      <AdaptiveDialog
        onOpenChange={(open) => {
          if (!open) {
            props.onClose();
          }
        }}
        open={props.product != null}
      >
        <AdaptiveDialogContent class="max-h-[85dvh]">
          <div class="flex flex-col gap-1">
            <h2 class="font-bold font-display text-foreground text-h4">
              {props.product?.name}
            </h2>
            <p class="text-caption text-muted-foreground">
              Pilih varian lalu tambahkan ke keranjang
            </p>
          </div>

          <div class="flex flex-col gap-5 overflow-y-auto">
            <For each={groups()}>
              {(group) => (
                <section class="flex flex-col gap-2">
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="font-semibold text-body-sm text-foreground">
                      {group.name}
                      {group.isRequired ? "" : " (opsional)"}
                    </h3>
                    <span class="text-caption-sm text-muted-foreground">
                      {group.selectionType === "single"
                        ? "Pilih satu"
                        : "Bisa beberapa"}
                    </span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={group.options}>
                      {(option) => {
                        const selected = () =>
                          group.selectionType === "single"
                            ? selection.single[group.id] === option.id
                            : (selection.multi[group.id]?.has(option.id) ??
                              false);
                        return (
                          <button
                            class={cn(
                              "cursor-pointer rounded-full border px-3.5 py-2 font-medium text-caption-sm transition-colors",
                              selected()
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-foreground hover:border-primary/40"
                            )}
                            onClick={() => {
                              if (group.selectionType === "single") {
                                if (!group.isRequired && selected()) {
                                  setSelection("single", group.id, null);
                                } else {
                                  setSelection("single", group.id, option.id);
                                }
                                return;
                              }
                              const current =
                                selection.multi[group.id] ?? new Set<string>();
                              const next = new Set(current);
                              if (next.has(option.id)) {
                                next.delete(option.id);
                              } else {
                                next.add(option.id);
                              }
                              setSelection("multi", group.id, next);
                            }}
                            type="button"
                          >
                            {option.label}
                            {option.priceDeltaMinorUnits > 0 && (
                              <span class="ml-1.5 text-muted-foreground tabular-nums">
                                +
                                {formatRupiah(
                                  option.priceDeltaMinorUnits / 100
                                )}
                              </span>
                            )}
                          </button>
                        );
                      }}
                    </For>
                    <Show
                      when={
                        group.selectionType === "single" && !group.isRequired
                      }
                    >
                      <button
                        class={cn(
                          "cursor-pointer rounded-full border px-3.5 py-2 font-medium text-caption-sm transition-colors",
                          selection.single[group.id] == null
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40"
                        )}
                        onClick={() => {
                          setSelection("single", group.id, null);
                        }}
                        type="button"
                      >
                        Tanpa {group.name}
                      </button>
                    </Show>
                  </div>
                </section>
              )}
            </For>
          </div>

          <Button
            class="w-full"
            onClick={() => {
              props.onAdd(chosen());
            }}
            type="button"
          >
            Tambahkan · {formatRupiah(unitPrice())}
          </Button>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </Show>
  );
};

function toModifier(
  group: ModifierGroupRow,
  option: ModifierGroupRow["options"][number]
): LineModifier {
  return {
    groupId: group.id,
    groupName: group.name,
    label: option.label,
    optionId: option.id,
    priceDelta: option.priceDeltaMinorUnits / 100,
  };
}
