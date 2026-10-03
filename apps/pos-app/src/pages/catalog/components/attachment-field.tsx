import { createSignal, For, Show } from "solid-js";
import { CheckIcon, PlusIcon, XCloseIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogTitle,
} from "~/components/ui/adaptive-dialog";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export interface AttachmentItem {
  readonly id: string;
  readonly subtitle?: string;
  readonly title: string;
}

interface AttachmentFieldProps {
  /** Label for the dashed add button, e.g. "Tambah Varian". */
  readonly addLabel: string;
  readonly emptyMessage: string;
  readonly items: readonly AttachmentItem[];
  /** Field heading, e.g. "Varian". */
  readonly label: string;
  readonly onToggle: (id: string) => void;
  readonly selected: Record<string, boolean>;
  readonly sheetTitle: string;
}

/* Option-A attachment field: the form shows ONLY what is attached
   (rows with remove); adding goes through a searchable sheet so the
   form stays short no matter how many candidates exist. */
export const AttachmentField = (props: AttachmentFieldProps) => {
  const [open, setOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");

  const selectedItems = () =>
    props.items.filter((item) => props.selected[item.id]);
  const selectedCount = () => selectedItems().length;

  const visibleItems = () => {
    const q = search().toLowerCase().trim();
    if (!q) {
      return props.items;
    }
    return props.items.filter((item) => {
      const inTitle = item.title.toLowerCase().includes(q);
      const inSubtitle = item.subtitle?.toLowerCase().includes(q) ?? false;
      return inTitle || inSubtitle;
    });
  };

  return (
    <div class="flex flex-col gap-1.5">
      <Show
        fallback={
          <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
            {props.label}
          </span>
        }
        when={props.items.length > 0}
      >
        <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
          {props.label} ({selectedCount()})
        </span>
      </Show>

      <Show
        fallback={
          <p class="rounded-lg border border-border border-dashed px-3 py-3 text-center text-caption-sm text-muted-foreground">
            {props.emptyMessage}
          </p>
        }
        when={props.items.length > 0}
      >
        <div class="flex flex-col gap-1.5">
          <For each={selectedItems()}>
            {(item) => (
              <div class="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-body-sm text-foreground">
                    {item.title}
                  </div>
                  <Show when={item.subtitle}>
                    <div class="truncate text-caption-sm text-muted-foreground">
                      {item.subtitle}
                    </div>
                  </Show>
                </div>
                <Button
                  aria-label={`Lepas ${item.title}`}
                  class="size-8 shrink-0 justify-center"
                  look="outline"
                  onClick={() => props.onToggle(item.id)}
                  size="none"
                  tone="danger"
                  type="button"
                >
                  <XCloseIcon class="h-3.5 w-3.5" />
                </Button>
              </div>
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
              placeholder="Cari..."
              value={search()}
            />

            <div class="scrollbar-none -mx-1 flex max-h-[50vh] flex-col gap-1 overflow-y-auto px-1">
              <For each={visibleItems()}>
                {(item) => (
                  <button
                    aria-pressed={Boolean(props.selected[item.id])}
                    class={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                      props.selected[item.id]
                        ? "border-primary/30 bg-primary/5"
                        : "border-transparent bg-muted/40 hover:border-primary/20"
                    )}
                    onClick={() => props.onToggle(item.id)}
                    type="button"
                  >
                    <span
                      class={cn(
                        "grid size-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors",
                        props.selected[item.id]
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      )}
                    >
                      <Show when={props.selected[item.id]}>
                        <CheckIcon class="size-3.5" />
                      </Show>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium text-body-sm text-foreground">
                        {item.title}
                      </span>
                      <Show when={item.subtitle}>
                        <span class="block truncate text-caption-sm text-muted-foreground">
                          {item.subtitle}
                        </span>
                      </Show>
                    </span>
                  </button>
                )}
              </For>
            </div>

            <Button class="w-full" onClick={() => setOpen(false)} type="button">
              Selesai · {selectedCount()} dipilih
            </Button>
          </AdaptiveDialogContent>
        </AdaptiveDialog>
      </Show>
    </div>
  );
};
