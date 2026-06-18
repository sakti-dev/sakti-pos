import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { cn } from "~/lib/utils";
import { type AttentionTone, attentionItems } from "../lib/data";

/* Semantic state lives ONLY on the leading icon chip — the row body is a
   single shared surface. Status reads via icon + label + value, never
   color alone. */
const CHIP: Record<AttentionTone, string> = {
  warning: "bg-status-warning/12 text-status-warning",
  danger: "bg-status-danger/12 text-status-danger",
  info: "bg-status-info/12 text-status-info",
};

export const AttentionList = () => {
  const total = attentionItems.reduce((sum, i) => sum + i.count, 0);

  return (
    <section>
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h3 class="font-bold font-display text-body-lg text-foreground tracking-[-0.01em]">
            Perlu dituntaskan
          </h3>
          <Show when={total > 0}>
            <span class="grid size-5 place-items-center rounded-full bg-primary font-bold text-[10px] text-primary-foreground tabular-nums">
              {total}
            </span>
          </Show>
        </div>
      </div>

      <div class="overflow-hidden rounded-2xl border border-border bg-card">
        <For each={attentionItems}>
          {(item, i) => (
            <>
              <Show when={i() > 0}>
                <div aria-hidden="true" class="mx-4 h-px bg-border" />
              </Show>
              <A
                class="group flex items-center gap-3.5 px-4 py-3.5 no-underline transition-colors duration-150 hover:bg-muted/60 active:bg-muted"
                href={item.href ?? "#"}
              >
                <span
                  class={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    CHIP[item.tone]
                  )}
                >
                  <item.Icon class="size-5" />
                </span>

                <div class="min-w-0 flex-1">
                  <div class="font-medium text-body-sm text-foreground">
                    {item.label}
                  </div>
                  <div class="truncate text-caption text-muted-foreground">
                    {item.subtitle}
                  </div>
                </div>

                <span
                  class={cn(
                    "min-w-5 rounded-full px-2 py-0.5 text-center font-bold text-caption-sm tabular-nums",
                    item.count > 0
                      ? "bg-primary/8 text-primary"
                      : "bg-muted text-faint-foreground"
                  )}
                >
                  {item.count}
                </span>
                <svg
                  aria-hidden="true"
                  class="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </A>
            </>
          )}
        </For>
      </div>
    </section>
  );
};
