import { createSignal, Show } from "solid-js";
import { EyeClosedIcon, EyeOpenIcon } from "~/assets";

export const EarningsCard = () => {
  const [visible, setVisible] = createSignal(true);
  const amount = "Rp 2.450.000";
  const masked = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

  return (
    <div class="relative flex items-center justify-between overflow-hidden rounded-[18px] border border-accent/15 bg-[linear-gradient(135deg,#244a18,#0f2110)] p-6">
      {/* Decorative circles */}
      <div class="pointer-events-none absolute -top-[50px] -right-[30px] h-[140px] w-[140px] rounded-full bg-accent/5" />
      <div class="pointer-events-none absolute -bottom-[40px] left-[35%] h-[100px] w-[100px] rounded-full bg-accent/5" />

      <div class="relative z-[1]">
        <div class="mb-2 font-semibold text-[11px] text-accent/75 uppercase tracking-[0.08em]">
          Est. Pendapatan Hari Ini
        </div>
        <Show
          fallback={
            <div class="flex h-[48px] items-center font-light text-[30px] text-white/30 tabular-nums tracking-[0.14em]">
              {masked}
            </div>
          }
          when={visible()}
        >
          <div class="flex items-center font-light text-display text-white tabular-nums">
            {amount}
          </div>
        </Show>
      </div>

      <button
        aria-label="Tampilkan/sembunyikan"
        class="relative z-[1] grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-white/10 bg-transparent text-white/65 transition-[background,border-color] duration-150 hover:border-white/25 hover:bg-white/10"
        onClick={() => setVisible((v) => !v)}
        type="button"
      >
        <Show
          fallback={<EyeClosedIcon class="h-[18px] w-[18px]" />}
          when={visible()}
        >
          <EyeOpenIcon class="h-[18px] w-[18px]" />
        </Show>
      </button>
    </div>
  );
};
