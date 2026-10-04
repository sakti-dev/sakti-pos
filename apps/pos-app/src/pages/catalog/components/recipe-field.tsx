import { FiAlertTriangle } from "solid-icons/fi";
import { createEffect, createSignal, For, Show } from "solid-js";
import { CheckIcon, PlusIcon, XCloseIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogTitle,
} from "~/components/ui/adaptive-dialog";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export interface RecipeFieldItem {
  /** Bahan id. */
  readonly id: string;
  readonly isActive: boolean;
  readonly title: string;
  readonly unit: string;
}

export interface RecipeRowState {
  readonly ingredientId: string;
  readonly qtyPerUnit: number;
}

interface RecipeFieldProps {
  /** Label for the dashed add button, e.g. "Tambah Bahan". */
  readonly addLabel: string;
  readonly emptyMessage: string;
  /** All active bahan (plus any linked-but-deactivated ones). */
  readonly items: readonly RecipeFieldItem[];
  readonly onQty: (ingredientId: string, qty: number) => void;
  readonly onRemove: (ingredientId: string) => void;
  readonly onSelect: (ingredientId: string) => void;
  /** Current recipe rows (order preserved for display). */
  readonly rows: readonly RecipeRowState[];
  readonly sheetTitle: string;
}

/* Qty-aware attachment field for recipes: selected rows carry a
   per-unit qty input (in the bahan's unit); adding goes through a
   searchable sheet, same Option-A skeleton as the varian field. */
export const RecipeField = (props: RecipeFieldProps) => {
  const [open, setOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  let searchInput: HTMLInputElement | undefined;

  /* Focus trap is off for this sheet (its containment refocus pops the
     Android keyboard back open on close), so the open-time focus on the
     search field is ours. */
  createEffect(() => {
    if (open()) {
      requestAnimationFrame(() => searchInput?.focus());
    }
  });

  const itemOf = (id: string) => props.items.find((i) => i.id === id);
  const selectedIds = () => new Set(props.rows.map((r) => r.ingredientId));
  const selectedCount = () => props.rows.length;

  const displayRows = () =>
    props.rows.map((row) => ({ ...row, item: itemOf(row.ingredientId) }));

  const visibleItems = () => {
    const q = search().toLowerCase().trim();
    if (!q) {
      return props.items;
    }
    return props.items.filter((item) => item.title.toLowerCase().includes(q));
  };

  return (
    <div class="flex flex-col gap-1.5">
      <Show
        fallback={
          <p class="rounded-lg border border-border border-dashed px-3 py-3 text-center text-caption-sm text-muted-foreground">
            {props.emptyMessage}
          </p>
        }
        when={props.items.length > 0}
      >
        <div class="flex flex-col gap-1.5">
          <For each={displayRows()}>
            {({ item, ingredientId, qtyPerUnit }) => (
              <Show when={item}>
                {(i) => (
                  <div
                    class={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                      i().isActive
                        ? "border-primary/25 bg-primary/5"
                        : "border-status-warning/40 bg-status-warning/10"
                    )}
                  >
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span class="truncate font-medium text-body-sm text-foreground">
                          {i().title}
                        </span>
                        <Show when={!i().isActive}>
                          <span
                            class="flex items-center gap-0.5 text-caption-sm text-status-warning"
                            title="Bahan sudah dinonaktifkan"
                          >
                            <FiAlertTriangle class="size-3.5" />
                            nonaktif
                          </span>
                        </Show>
                      </div>
                      <div class="text-caption-sm text-muted-foreground">
                        per 1 terjual, pakai
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-1.5">
                      <input
                        aria-label={`Jumlah ${i().title} per 1 terjual`}
                        class="h-9 w-20 rounded-md border border-input bg-background px-2 text-right font-sans text-body-sm text-foreground tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                        inputMode="decimal"
                        onChange={(e) => {
                          const raw = e.currentTarget.value.replace(",", ".");
                          const qty = Number.parseFloat(raw);
                          if (Number.isFinite(qty) && qty > 0) {
                            props.onQty(ingredientId, qty);
                            e.currentTarget.value = String(qty);
                          } else {
                            e.currentTarget.value = String(qtyPerUnit);
                          }
                        }}
                        type="text"
                        value={qtyPerUnit}
                      />
                      <span class="min-w-8 text-caption-sm text-muted-foreground">
                        {i().unit}
                      </span>
                      <Button
                        aria-label={`Lepas ${i().title}`}
                        class="size-8 shrink-0 justify-center"
                        look="outline"
                        onClick={() => props.onRemove(ingredientId)}
                        size="none"
                        tone="danger"
                        type="button"
                      >
                        <XCloseIcon class="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </Show>
            )}
          </For>
        </div>

        <Button
          class="w-full border border-dashed bg-background/20"
          look="outline"
          onClick={() => {
            setSearch("");
            setOpen(true);
          }}
          tone="neutral"
          type="button"
        >
          <PlusIcon class="h-4 w-4" />
          {props.addLabel}
        </Button>

        <AdaptiveDialog onOpenChange={setOpen} open={open()}>
          <AdaptiveDialogContent class="max-h-[85vh]">
            <AdaptiveDialogTitle>{props.sheetTitle}</AdaptiveDialogTitle>

            <SearchBar
              onInput={setSearch}
              placeholder="Cari bahan..."
              ref={(el) => {
                searchInput = el;
              }}
              value={search()}
            />

            <div class="scrollbar-none -mx-1 flex max-h-[50vh] flex-col gap-1 overflow-y-auto px-1">
              <For each={visibleItems()}>
                {(item) => (
                  <button
                    aria-pressed={selectedIds().has(item.id)}
                    class={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                      selectedIds().has(item.id)
                        ? "border-primary/30 bg-primary/5"
                        : "border-transparent bg-muted/40 hover:border-primary/20"
                    )}
                    onClick={() => props.onSelect(item.id)}
                    type="button"
                  >
                    <span
                      class={cn(
                        "grid size-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors",
                        selectedIds().has(item.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      )}
                    >
                      <Show when={selectedIds().has(item.id)}>
                        <CheckIcon class="size-3.5" />
                      </Show>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium text-body-sm text-foreground">
                        {item.title}
                      </span>
                      <span class="block truncate text-caption-sm text-muted-foreground">
                        {item.unit}
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </div>

            <Button class="w-full" onClick={() => setOpen(false)} type="button">
              Selesai · {selectedCount()} bahan
            </Button>
          </AdaptiveDialogContent>
        </AdaptiveDialog>
      </Show>
    </div>
  );
};
