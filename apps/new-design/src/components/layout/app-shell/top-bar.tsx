import { createSignal, onCleanup } from "solid-js";
import { BellIcon, CloudIcon } from "~/assets";

function formatClock(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const TopBar = () => {
  const [clock, setClock] = createSignal(formatClock());
  const [syncing, setSyncing] = createSignal(false);

  const timer = setInterval(() => setClock(formatClock()), 1000);
  onCleanup(() => clearInterval(timer));

  const handleSync = () => {
    if (syncing()) {
      return;
    }
    setSyncing(true);
    setTimeout(() => setSyncing(false), 1800);
  };

  return (
    <header class="fixed top-0 right-0 left-[var(--sidebar-w,80px)] z-[99] flex h-[54px] shrink-0 items-center justify-between border-border border-b bg-surface px-7 max-[900px]:left-0 max-[900px]:px-[18px] dark:border-[rgba(255,255,255,0.06)] dark:bg-[#141414]">
      <div class="flex items-center gap-3">
        {/* Sync button */}
        <button
          aria-label="Sinkronisasi"
          class="inline-flex items-center gap-[7px] rounded-pill border border-[rgba(60,208,112,0.18)] bg-[rgba(60,208,112,0.12)] px-3.5 py-1.5 font-medium text-[#3cd070] text-[13px] tracking-[0.01em] transition-[background,border-color,transform] duration-200 hover:border-[rgba(60,208,112,0.35)] hover:bg-[rgba(60,208,112,0.20)] active:scale-[0.96] dark:border-[rgba(60,208,112,0.25)] dark:bg-[rgba(60,208,112,0.12)] dark:text-[#3cd070] dark:hover:border-[rgba(60,208,112,0.40)] dark:hover:bg-[rgba(60,208,112,0.22)]"
          onClick={handleSync}
          type="button"
        >
          <span class="relative h-4 w-4 shrink-0">
            <CloudIcon class={syncing() ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span class="absolute -right-0.5 -bottom-px h-[7px] w-[7px] animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full border-[#094933] border-[1.5px] bg-[#3cd070] dark:border-[#073d2b] dark:bg-[#3cd070]" />
          </span>
          {syncing() ? "Sinkronisasi\u2026" : "Online"}
        </button>

        {/* Live clock */}
        <span class="font-medium text-[14px] text-text-secondary tabular-nums">
          {clock()}
          <span class="ml-1 text-[11px] text-text-muted tracking-[0.02em]">
            WIB
          </span>
        </span>
      </div>

      {/* Notification bell */}
      <button
        aria-label="Notifikasi"
        class="grid h-[38px] w-[38px] place-items-center rounded-[8px] border border-border bg-surface text-text-secondary transition-[background,border-color,box-shadow] duration-150 hover:border-[rgba(9,73,51,0.15)] hover:bg-surface-gray hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.10)] dark:bg-[#1a1a1a] dark:text-[#a0a0a0] dark:hover:border-[rgba(255,255,255,0.12)] dark:hover:bg-[#222] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.30)]"
        type="button"
      >
        <BellIcon class="h-[18px] w-[18px]" />
      </button>
    </header>
  );
};
