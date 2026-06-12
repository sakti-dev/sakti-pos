import type { Component } from "solid-js";
import { For } from "solid-js";
import { CheckCircleIcon, ClockIcon, CreditCardIcon, FileIcon } from "~/assets";

interface KpiTheme {
  readonly btnText: string;
  readonly cardBg: string;
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
    cardBg: "#0d3820",
    glowColor: "#a8e5e5",
    textAccent: "#a8e5e5",
    textValue: "#f0fdf4",
    btnText: "#0d3820",
  },
  yellow: {
    cardBg: "#332b00",
    glowColor: "#facc15",
    textAccent: "#fde68a",
    textValue: "#fffbeb",
    btnText: "#332b00",
  },
  terracotta: {
    cardBg: "#3d1508",
    glowColor: "#e8622c",
    textAccent: "#fed7aa",
    textValue: "#fff7ed",
    btnText: "#3d1508",
  },
  green: {
    cardBg: "#1a2e08",
    glowColor: "#84cc16",
    textAccent: "#d9f99d",
    textValue: "#f7fee7",
    btnText: "#1a2e08",
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
        <h3 class="font-bold text-[17px] text-text tracking-[-0.01em] dark:text-[#f0f0f0]">
          Transaksi
        </h3>
        <p class="mt-[3px] text-[13px] text-text-muted tracking-[0.01em] dark:text-[#666]">
          Aktivitas transaksi yang perlu dituntaskan
        </p>
      </div>

      <div class="grid grid-cols-[repeat(4,1fr)] gap-3 max-[1100px]:grid-cols-2 max-[600px]:grid-cols-2">
        <For each={cards}>
          {(card) => (
            <div
              class="relative cursor-default overflow-hidden rounded-[20px] p-6 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.25)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.40)]"
              style={{
                "background-color": card.theme.cardBg,
                "box-shadow": "0 8px 24px rgba(0,0,0,0.15)",
              }}
            >
              {/* Glow */}
              <div
                class="pointer-events-none absolute -bottom-[60px] -left-[60px] h-[180px] w-[180px] opacity-35 transition-opacity duration-300 [filter:blur(55px)] hover:opacity-55"
                style={{ "background-color": card.theme.glowColor }}
              />

              {/* Header */}
              <div class="relative z-[1] mb-4 flex items-center justify-between">
                <span class="font-medium text-[14px] text-[rgba(255,255,255,0.85)] tracking-[-0.3px] dark:text-[rgba(255,255,255,0.80)]">
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
                class="relative z-[1] mb-4 font-medium tabular-nums leading-none"
                classList={{ "opacity-35": card.value === 0 }}
                style={{
                  color: card.theme.textValue,
                  "font-size": card.value === 0 ? "42px" : "48px",
                  "letter-spacing": card.value === 0 ? undefined : "-1.5px",
                }}
              >
                {card.value}
              </div>

              {/* Footer */}
              <div
                class="relative z-[1] flex items-center gap-2.5 font-medium text-[13px]"
                style={{ color: card.theme.textAccent }}
              >
                <span class="inline-flex items-center gap-1 rounded-[12px] border border-current bg-[rgba(255,255,255,0.05)] px-2.5 py-[2px] font-semibold text-[12px]">
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
