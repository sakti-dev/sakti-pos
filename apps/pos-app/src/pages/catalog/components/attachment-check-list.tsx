import { For, Show } from "solid-js";
import { CheckIcon } from "~/assets";
import { cn } from "~/lib/utils";

export interface AttachmentItem {
  readonly id: string;
  readonly subtitle?: string;
  readonly title: string;
}

interface AttachmentCheckListProps {
  readonly checked: Record<string, boolean>;
  readonly emptyMessage: string;
  readonly items: readonly AttachmentItem[];
  readonly onToggle: (id: string) => void;
}

/** Explicit opt-in attachment list: a real checkbox per row, meta as the
 *  subtitle. Nothing renders as a dimmed "inactive" chip — unchecked rows
 *  are plainly not attached. */
export const AttachmentCheckList = (props: AttachmentCheckListProps) => (
  <Show
    fallback={
      <p class="rounded-lg border border-border border-dashed px-3 py-3 text-center text-caption-sm text-muted-foreground">
        {props.emptyMessage}
      </p>
    }
    when={props.items.length > 0}
  >
    <div class="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-1.5">
      <For each={props.items}>
        {(item) => (
          <button
            aria-pressed={Boolean(props.checked[item.id])}
            class={cn(
              "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
              props.checked[item.id]
                ? "border-primary/30 bg-primary/5"
                : "border-transparent bg-background hover:border-primary/20"
            )}
            onClick={() => props.onToggle(item.id)}
            type="button"
          >
            <span
              class={cn(
                "grid size-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors",
                props.checked[item.id]
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background"
              )}
            >
              <Show when={props.checked[item.id]}>
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
  </Show>
);
