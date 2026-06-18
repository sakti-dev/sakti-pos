import { A } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { ArrowRightIcon, EyeClosedIcon, EyeOpenIcon } from "~/assets";
import { earningsAmount, earningsBreakdown } from "../lib/data";

export const MoneyHero = () => {
  const [visible, setVisible] = createSignal(true);
  const masked = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

  const b = earningsBreakdown;

  return (
    <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md">
      {/* Sunlit glow — lime rarity: one decorative moment */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -top-16 -right-12 size-48 rounded-full bg-accent/[0.06] blur-2xl"
      />

      <div class="relative flex items-start justify-between gap-3">
        <div class="font-semibold text-caption-sm text-white/65 uppercase tracking-[0.14em]">
          Pendapatan hari ini
        </div>
        <button
          aria-label={visible() ? "Sembunyikan nominal" : "Tampilkan nominal"}
          class="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/10 text-white/60 transition-colors duration-150 hover:border-white/25 hover:bg-white/10 hover:text-white/90"
          onClick={() => setVisible((v) => !v)}
          type="button"
        >
          <Show
            fallback={<EyeClosedIcon class="size-[18px]" />}
            when={visible()}
          >
            <EyeOpenIcon class="size-[18px]" />
          </Show>
        </button>
      </div>

      <div class="relative mt-2.5 flex min-h-[40px] items-baseline sm:min-h-[48px]">
        <Show
          fallback={
            <span class="font-display font-light text-[40px] text-white/30 tabular-nums leading-none tracking-[0.25em] sm:text-display">
              {masked}
            </span>
          }
          when={visible()}
        >
          <span class="font-bold font-display text-[40px] text-white tabular-nums leading-none tracking-[-0.02em] sm:text-display">
            {earningsAmount}
          </span>
        </Show>
      </div>

      {/* Breakdown — the owner's "trust the day" detail, one tap deep */}
      <A
        class="group relative mt-4 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 no-underline"
        href="/transactions"
      >
        <div class="flex items-center gap-3 text-caption text-white/75">
          <span class="inline-flex items-center gap-1.5">
            <span class="size-1.5 rounded-full bg-accent-soft" />
            {b.cash} tunai
          </span>
          <span class="h-3 w-px bg-white/15" />
          <span class="inline-flex items-center gap-1.5">
            <span class="size-1.5 rounded-full bg-white/50" />
            {b.card} kartu
          </span>
          <span class="h-3 w-px bg-white/15" />
          <span class="inline-flex items-center gap-1.5">
            <span class="size-1.5 rounded-full bg-white/20" />
            {b.unpaid} belum dibayar
          </span>
        </div>
        <ArrowRightIcon class="size-4 shrink-0 text-white/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-white/70" />
      </A>
    </div>
  );
};
