import { createEffect, createSignal, For, Show } from "solid-js";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "~/components/ui/adaptive-dialog";
import { cn } from "~/lib/utils";

export interface PickerOption {
  readonly label: string;
  readonly value: string;
}

interface PickerFieldProps {
  readonly class?: string;
  readonly onChange?: (value: string) => void;
  readonly onCreate?: (query: string) => Promise<string> | string;
  readonly options: PickerOption[];
  readonly placeholder?: string;
  readonly title: string;
  readonly value?: string;
}

export function PickerField(props: PickerFieldProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  /** Label of an inline-created option that isn't in `options` (yet). */
  const [createdLabel, setCreatedLabel] = createSignal<{
    label: string;
    value: string;
  } | null>(null);
  let searchInput: HTMLInputElement | undefined;

  /* Focus trap is off for this sheet (its containment refocus pops the
     Android keyboard back open on close), so the open-time focus on the
     search field is ours. */
  createEffect(() => {
    if (open()) {
      requestAnimationFrame(() => searchInput?.focus());
    }
  });

  /** Selected option — or the inline-created label — or the raw value. */
  const selected = (): PickerOption | undefined => {
    const match = props.options.find((o) => o.value === props.value);
    if (match) {
      return match;
    }
    const created = createdLabel();
    if (created && created.value === props.value) {
      return created;
    }
    return props.value ? { label: props.value, value: props.value } : undefined;
  };

  const filtered = () => {
    const q = query().toLowerCase().trim();
    if (!q) {
      return props.options;
    }
    return props.options.filter((o) => o.label.toLowerCase().includes(q));
  };

  const canCreate = () => {
    if (!(props.onCreate && query().trim())) {
      return false;
    }
    return !props.options.some(
      (o) => o.label.toLowerCase() === query().trim().toLowerCase()
    );
  };

  const handleSelect = (value: string) => {
    if (createdLabel()?.value !== value) {
      setCreatedLabel(null);
    }
    props.onChange?.(value);
    setOpen(false);
    setQuery("");
  };

  const handleCreate = async () => {
    if (creating()) {
      return;
    }
    try {
      setCreating(true);
      const label = query().trim();
      const result = props.onCreate!(label);
      const newValue = result instanceof Promise ? await result : result;
      setCreatedLabel({ label, value: newValue });
      handleSelect(newValue);
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdaptiveDialog
      onOpenChange={setOpen}
      open={open()}
      snapPoints={[0, 0.6, 1]}
    >
      <button
        class={cn(
          "flex h-12 w-full items-center justify-between rounded-sm border-2 border-input bg-background px-3.5 font-sans text-body-sm outline-none transition-colors duration-standard ease-standard",
          "hover:border-primary/50 dark:hover:border-accent/50",
          props.class
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <span class={selected() ? "text-foreground" : "text-muted-foreground"}>
          {selected()?.label ?? props.placeholder}
        </span>
        <ChevronDownIcon class="size-4 shrink-0 text-muted-foreground" />
      </button>

      <AdaptiveDialogContent class="max-w-md">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{props.title}</AdaptiveDialogTitle>
        </AdaptiveDialogHeader>

        <SearchBar
          mode="full"
          onInput={setQuery}
          placeholder="Cari..."
          ref={(el) => {
            searchInput = el;
          }}
          value={query()}
        />

        <div class="scrollbar-none grow divide-y divide-border overflow-y-auto">
          {/* ── Create new ── */}
          <Show when={canCreate()}>
            <button
              class="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
              disabled={creating()}
              onClick={handleCreate}
              type="button"
            >
              <span class="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Show
                  fallback={<PlusIcon class="size-4 animate-spin" />}
                  when={!creating()}
                >
                  <PlusIcon class="size-4" />
                </Show>
              </span>
              <span class="text-body-sm text-muted-foreground">
                Buat{" "}
                <span class="font-medium text-foreground">
                  &ldquo;{query().trim()}&rdquo;
                </span>
              </span>
            </button>
          </Show>

          {/* ── Options ── */}
          <For each={filtered()}>
            {(option) => (
              <button
                class="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-muted"
                onClick={() => handleSelect(option.value)}
                type="button"
              >
                <span class="text-body-sm text-foreground">{option.label}</span>
                <Show when={option.value === props.value}>
                  <CheckIcon class="size-4 shrink-0 text-primary" />
                </Show>
              </button>
            )}
          </For>

          {/* ── Empty state (no results, no create) ── */}
          <Show when={filtered().length === 0 && !canCreate()}>
            <div class="flex items-center justify-center px-3 py-8">
              <span class="text-body-sm text-muted-foreground">
                Tidak ditemukan
              </span>
            </div>
          </Show>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
