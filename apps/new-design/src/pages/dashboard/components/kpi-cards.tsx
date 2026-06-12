import type { Component, JSX } from "solid-js";
import { For } from "solid-js";
import { CheckCircleIcon, ClockIcon, CreditCardIcon, FileIcon } from "~/assets";

interface KpiTheme {
  readonly badgeBg: string;
  readonly btnText: string;
  readonly cardBg: string;
  readonly darkCardBg: string;
  readonly darkTextValue: string;
  readonly glowColor: string;
  readonly textAccent: string;
  readonly textValue: string;
}
interface KpiCardData {
  readonly ActionIcon: Component<{ class?: string }>;
  readonly count: number;
  readonly name: string;
  readonly subtitle: string;
  readonly theme: KpiTheme;
  readonly value: number;
}
const themes: Record<string, KpiTheme> = {
  teal: {
    badgeBg: "rgba(60,208,112,0.12)",
    btnText: "#094933",
    cardBg: "#094933",
    darkCardBg: "#0a2e1e",
    darkTextValue: "#ededed",
    glowColor: "#3cd070",
    textAccent: "#3cd070",
    textValue: "#ffffff",
  },
  yellow: {
    badgeBg: "rgba(250,204,21,0.12)",
    btnText: "#3d3200",
    cardBg: "#3d3200",
    darkCardBg: "#2a2300",
    darkTextValue: "#ededed",
    glowColor: "#facc15",
    textAccent: "#fde68a",
    textValue: "#ffffff",
  },
  terracotta: {
    badgeBg: "rgba(251,146,60,0.12)",
    btnText: "#3d1508",
    cardBg: "#3d1508",
    darkCardBg: "#2a1008",
    darkTextValue: "#ededed",
    glowColor: "#fb923c",
    textAccent: "#fed7aa",
    textValue: "#ffffff",
  },
  green: {
    badgeBg: "rgba(74,222,128,0.12)",
    btnText: "#052e16",
    cardBg: "#052e16",
    darkCardBg: "#041f0e",
    darkTextValue: "#ededed",
    glowColor: "#4ade80",
    textAccent: "#86efac",
    textValue: "#ffffff",
  },
};

const cards: readonly KpiCardData[] = [
  {
    name: "Transaksi Baru",
    value: 0,
    count: 0,
    subtitle: "Hari ini",
    theme: themes.teal,
    ActionIcon: FileIcon,
  },
  {
    name: "Sedang Diproses",
    value: 0,
    count: 0,
    subtitle: "Perlu dituntaskan",
    theme: themes.yellow,
    ActionIcon: ClockIcon,
  },
  {
    name: "Menunggu Dibayar",
    value: 0,
    count: 0,
    subtitle: "Menunggu pembayaran",
    theme: themes.terracotta,
    ActionIcon: CreditCardIcon,
  },
  {
    name: "Transaksi Selesai",
    value: 0,
    count: 0,
    subtitle: "Selesai hari ini",
    theme: themes.green,
    ActionIcon: CheckCircleIcon,
  },
] as const;

export const KpiCards = () => {
  return (
    <section>
      <div class="mb-3.5">
        <h3 class="font-bold font-display text-[18px] text-text dark:text-text">
          Transaksi
        </h3>
        <p class="mt-[3px] text-[13px] text-text-muted tracking-[0.01em]">
          Aktivitas transaksi yang perlu dituntaskan
        </p>
      </div>

      <div class="grid grid-cols-[repeat(4,1fr)] gap-4 max-[1100px]:grid-cols-2 max-[600px]:grid-cols-2">
        <For each={cards}>
          {(card) => (
            <div
              class="relative cursor-default overflow-hidden rounded-[18px] border border-border p-6 transition-[transform] duration-300 ease-out hover:-translate-y-[3px] dark:border-[rgba(255,255,255,0.04)] dark:[background-color:var(--kpi-dark-bg)]"
              style={
                {
                  "background-color": card.theme.cardBg,
                  "--kpi-dark-bg": card.theme.darkCardBg,
                } as JSX.CSSProperties
              }
            >
              {/* Glow */}
              <div
                class="pointer-events-none absolute -bottom-[60px] -left-[60px] h-[180px] w-[180px] opacity-35 transition-opacity duration-300 [filter:blur(55px)] hover:opacity-55"
                style={{ "background-color": card.theme.glowColor }}
              />

              {/* Header */}
              <div class="relative z-[1] mb-4 flex items-center justify-between">
                <span class="font-medium text-[14px] text-[rgba(255,255,255,0.80)] tracking-[-0.3px] dark:text-[rgba(255,255,255,0.70)]">
                  {card.name}
                </span>
                <button
                  aria-label={`Lihat detail ${card.name}`}
                  class="grid h-9 w-9 place-items-center rounded-full bg-[rgba(255,255,255,0.9)] transition-[transform,box-shadow] duration-200 hover:rotate-[5deg] hover:scale-108 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                  style={{ color: card.theme.btnText }}
                  type="button"
                >
                  <card.ActionIcon class="h-4 w-4" />
                </button>
              </div>

              {/* Value */}
              <div
                class="relative z-[1] mb-4 font-bold font-display tabular-nums leading-none dark:[color:var(--kpi-dark-text)]"
                classList={{
                  "opacity-35": card.value === 0,
                  "dark:opacity-25": card.value === 0,
                }}
                style={
                  {
                    color: card.theme.textValue,
                    "--kpi-dark-text": card.theme.darkTextValue,
                    "font-size": card.value === 0 ? "42px" : "48px",
                    "letter-spacing": card.value === 0 ? undefined : "-1.5px",
                  } as JSX.CSSProperties
                }
              >
                {card.value}
              </div>

              {/* Footer */}
              <div
                class="relative z-[1] flex items-center gap-2.5 font-medium text-[13px]"
                style={{ color: card.theme.textAccent }}
              >
                <span
                  class="inline-flex items-center gap-1 rounded-[6px] border border-transparent px-2.5 py-[2px] font-semibold text-[12px]"
                  style={{ "background-color": card.theme.badgeBg }}
                >
                  {card.count}
                  <span class="text-[0.65rem]">▲</span>
                </span>
                <span>{card.subtitle}</span>
              </div>
            </div>
          )}
        </For>
      </div>
    </section>
  );
};
