import { createSignal, Show } from "solid-js";
import { EyeClosedIcon, EyeOpenIcon } from "~/assets";

export const EarningsCard = () => {
  const [visible, setVisible] = createSignal(true);
  const amount = "Rp 2.450.000";
  const masked = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

  return (
    <div class="relative flex items-center justify-between overflow-hidden rounded-[18px] border border-[rgba(60,208,112,0.10)] bg-[linear-gradient(135deg,#0b5239,#063a28)] p-6 dark:border-[rgba(60,208,112,0.10)] dark:bg-[linear-gradient(135deg,#073d2b,#042218)]">
      {/* Decorative circles */}
      <div class="pointer-events-none absolute -top-[50px] -right-[30px] h-[140px] w-[140px] rounded-full bg-[rgba(60,208,112,0.06)] dark:bg-[rgba(60,208,112,0.04)]" />
      <div class="pointer-events-none absolute -bottom-[40px] left-[35%] h-[100px] w-[100px] rounded-full bg-[rgba(60,208,112,0.04)] dark:bg-[rgba(60,208,112,0.03)]" />

      <div class="relative z-[1]">
        <div class="mb-2 font-semibold text-[11px] text-[rgba(60,208,112,0.65)] uppercase tracking-[0.08em] dark:text-[rgba(60,208,112,0.55)]">
          Est. Pendapatan Hari Ini
        </div>
        <Show
          fallback={
            <div class="flex h-[34px] items-center font-bold text-[26px] text-[rgba(255,255,255,0.30)] tabular-nums tracking-[0.14em] dark:text-[rgba(255,255,255,0.20)]">
              {masked}
            </div>
          }
          when={visible()}
        >
          <div class="flex h-[34px] items-center font-bold text-[30px] text-white tabular-nums tracking-[-0.02em] dark:text-[#ededed]">
            {amount}
          </div>
        </Show>
      </div>

      <button
        aria-label="Tampilkan/sembunyikan"
        class="relative z-[1] grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-transparent text-[rgba(255,255,255,0.65)] transition-[background,border-color] duration-150 hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.08)] dark:border-[rgba(60,208,112,0.15)] dark:text-[rgba(60,208,112,0.50)] dark:hover:border-[rgba(60,208,112,0.25)] dark:hover:bg-[rgba(60,208,112,0.08)]"
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
