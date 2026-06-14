import { motion } from "motion-solidjs";
import { createSignal, onCleanup } from "solid-js";
import { BellIcon, CloudIcon, LoaderIcon } from "~/assets";
import { cn } from "~/lib/utils";

function formatClock(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const TopBarContent = () => {
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
    <>
      <div class="flex items-center gap-3">
        <button
          aria-label="Sinkronisasi"
          class="inline-flex items-center gap-[7px] rounded-full border border-accent-foreground/15 bg-accent/15 px-3.5 py-1.5 font-medium text-[13px] text-accent-foreground tracking-[0.01em] transition-[background,border-color,transform] duration-200 hover:border-accent-foreground/25 hover:bg-accent/25 active:scale-[0.96]"
          onClick={handleSync}
          type="button"
        >
          <span class="relative h-4 w-4 shrink-0">
            {syncing() ? (
              <LoaderIcon class="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CloudIcon class="h-4 w-4" />
                <span class="absolute -right-0.5 -bottom-px h-[7px] w-[7px] animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full border-[1.5px] border-primary bg-accent" />
              </>
            )}
          </span>
          {syncing() ? "Sinkronisasi\u2026" : "Online"}
        </button>

        <span class="font-medium text-[14px] text-muted-foreground tabular-nums">
          {clock()}
          <span class="ml-1 text-[11px] text-faint-foreground tracking-[0.02em]">
            WIB
          </span>
        </span>
      </div>

      <button
        aria-label="Notifikasi"
        class="grid h-[38px] w-[38px] place-items-center rounded-[8px] border border-border bg-card text-muted-foreground transition-[background,border-color,box-shadow] duration-150 hover:border-primary/15 hover:bg-muted hover:shadow-card-hover"
        type="button"
      >
        <BellIcon class="h-[18px] w-[18px]" />
      </button>
    </>
  );
};

interface TopBarProps {
  readonly expanded: boolean;
  readonly isShell: boolean;
  readonly onClose: () => void;
}

export const TopBar = (props: TopBarProps) => (
  <motion.header
    animate={{
      x: props.isShell ? 0 : -80,
      opacity: props.isShell ? 1 : 0,
      pointerEvents: props.isShell ? "auto" : "none",
    }}
    class={cn(
      "fixed top-0 right-0 z-[99] flex h-[54px] shrink-0 items-center justify-between border-border border-b bg-card px-7 transition-[left] duration-300 max-[900px]:left-0 max-[900px]:px-[18px]",
      props.isShell && (props.expanded ? "left-[200px]" : "left-[80px]"),
      !props.isShell && "left-0"
    )}
    initial={{ x: -80, opacity: 0 }}
    onPointerDown={props.onClose}
    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
  >
    <TopBarContent />
  </motion.header>
);
