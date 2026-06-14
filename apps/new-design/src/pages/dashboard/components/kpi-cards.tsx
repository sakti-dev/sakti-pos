import type { Component } from "solid-js";
import { For } from "solid-js";
import { CheckCircleIcon, ClockIcon, CreditCardIcon, FileIcon } from "~/assets";
import { cn } from "~/lib/utils";

type Tone = "info" | "warning" | "danger" | "success";

/* Semantic state is carried ONLY by the icon chip (soft inner container),
   never by the card body. All four cards share one identical surface. */
const TONE_CHIP: Record<Tone, string> = {
  info: "bg-status-info text-status-info-foreground",
  warning: "bg-status-warning text-status-warning-foreground",
  danger: "bg-status-danger text-status-danger-foreground",
  success: "bg-status-success text-status-success-foreground",
};

interface KpiCardData {
  readonly ActionIcon: Component<{ class?: string }>;
  readonly count: number;
  readonly name: string;
  readonly subtitle: string;
  readonly tone: Tone;
  readonly value: number;
}

const cards: readonly KpiCardData[] = [
  {
    name: "Transaksi Baru",
    value: 0,
    count: 0,
    subtitle: "Hari ini",
    tone: "info",
    ActionIcon: FileIcon,
  },
  {
    name: "Sedang Diproses",
    value: 0,
    count: 0,
    subtitle: "Perlu dituntaskan",
    tone: "warning",
    ActionIcon: ClockIcon,
  },
  {
    name: "Menunggu Dibayar",
    value: 0,
    count: 0,
    subtitle: "Menunggu pembayaran",
    tone: "danger",
    ActionIcon: CreditCardIcon,
  },
  {
    name: "Transaksi Selesai",
    value: 0,
    count: 0,
    subtitle: "Selesai hari ini",
    tone: "success",
    ActionIcon: CheckCircleIcon,
  },
] as const;

export const KpiCards = () => (
  <section>
    <div class="mb-3.5">
      <h3 class="font-display font-medium text-[18px] text-foreground tracking-[-0.36px]">
        Transaksi
      </h3>
      <p class="mt-[3px] text-[13px] text-muted-foreground tracking-[0.01em]">
        Aktivitas transaksi yang perlu dituntaskan
      </p>
    </div>

    <div class="grid grid-cols-[repeat(4,1fr)] gap-4 max-[1100px]:grid-cols-2 max-[600px]:grid-cols-1">
      <For each={cards}>
        {(card) => (
          <article class="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-card dark:shadow-none">
            <header class="flex items-start justify-between gap-3">
              <h4 class="pt-1.5 font-medium text-[14px] text-foreground tracking-[-0.42px]">
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
              <span class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-[3px] font-semibold text-[11px] text-muted-foreground tabular-nums">
                {card.count}
                <span class="text-[0.62em] leading-none">▲</span>
              </span>
              <span class="truncate text-[12px] text-faint-foreground">
                {card.subtitle}
              </span>
            </footer>
          </article>
        )}
      </For>
    </div>
  </section>
);
