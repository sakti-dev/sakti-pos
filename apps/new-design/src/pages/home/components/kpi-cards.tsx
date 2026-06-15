import { For } from "solid-js";
import { type KpiTone, kpiCards } from "~/lib/data/dashboard";
import { cn } from "~/lib/utils";

/* Semantic state is carried ONLY by the icon chip (soft inner container),
   never by the card body. All four cards share one identical surface. */
const TONE_CHIP: Record<KpiTone, string> = {
  info: "bg-status-info text-status-info-foreground",
  warning: "bg-status-warning text-status-warning-foreground",
  danger: "bg-status-danger text-status-danger-foreground",
  success: "bg-status-success text-status-success-foreground",
};

export const KpiCards = () => (
  <section>
    <div class="mb-3.5">
      <h3 class="font-display font-medium text-body-lg text-foreground tracking-tight">
        Transaksi
      </h3>
      <p class="mt-[3px] text-body-sm text-muted-foreground">
        Aktivitas transaksi yang perlu dituntaskan
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,1fr)]">
      <For each={kpiCards}>
        {(card) => (
          <article class="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-card dark:shadow-none">
            <header class="flex items-start justify-between gap-3">
              <h4 class="pt-1.5 font-medium text-body-sm text-foreground tracking-tight">
                {card.name}
              </h4>
              <span
                class={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border",
                  TONE_CHIP[card.tone]
                )}
              >
                <card.ActionIcon class="h-[18px] w-[18px]" />
              </span>
            </header>

            <div
              class="font-display font-normal text-foreground tabular-nums leading-none"
              style={{
                "font-size": card.value === 0 ? "42px" : "48px",
                "letter-spacing": "-1.5px",
              }}
            >
              {card.value}
            </div>

            <footer class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-[3px] font-semibold text-caption-sm text-muted-foreground tabular-nums">
                {card.count}
                <span class="text-[0.62em] leading-none">▲</span>
              </span>
              <span class="truncate text-caption text-faint-foreground">
                {card.subtitle}
              </span>
            </footer>
          </article>
        )}
      </For>
    </div>
  </section>
);
