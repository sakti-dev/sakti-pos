import { For, type JSX } from "solid-js";
import { toast } from "solid-sonner";
import { BagIcon, ChartIcon, GoogleIcon, GridDetailIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const ghostCards = [
  {
    Icon: GridDetailIcon,
    label: "Pembayaran",
    class: "w-[90px] bottom-10 right-4 opacity-65",
    lineWidths: ["65%", "80%"],
    anim: "animate-ghost-3",
  },
  {
    Icon: ChartIcon,
    label: "Laporan",
    class: "w-[85px] bottom-10 left-4 opacity-65",
    lineWidths: ["60%", "75%"],
    anim: "animate-ghost-4",
  },
  {
    Icon: BagIcon,
    label: "Pesanan",
    class: "w-[95px] top-[140px] right-4 opacity-60",
    lineWidths: ["50%", "65%"],
    anim: "animate-ghost-2",
  },
  {
    Icon: ChartIcon,
    label: "Invoice",
    class: "w-[100px] top-[140px] left-4 opacity-70",
    lineWidths: ["55%", "70%"],
    anim: "animate-ghost-1",
  },
] as const;

export function AuthRightPanel(props: {
  title: string;
  subtitle: string;
  googleLabel: string;
  footer: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <main class="relative flex w-full flex-col justify-start overflow-y-auto bg-background p-8 pt-10 lg:w-[480px] lg:min-w-[420px] lg:justify-center lg:px-14 lg:py-10">
      <For each={ghostCards}>
        {(gc) => (
          <div
            class={cn(
              "pointer-events-none absolute z-0 flex flex-col items-center rounded-lg border-[1.5px] border-primary/10 bg-primary/5",
              gc.class,
              gc.anim
            )}
          >
            <div class="flex items-center justify-center p-3 pb-1">
              <gc.Icon class="h-6 w-6 text-primary/45" />
            </div>
            <For each={gc.lineWidths}>
              {(w) => (
                <div
                  class="mx-2 my-1 h-1.5 rounded-sm bg-primary/10"
                  style={{ width: w }}
                />
              )}
            </For>
            <div class="px-2 pb-2 text-center font-semibold text-[9px] text-primary/50 uppercase tracking-[0.04em]">
              {gc.label}
            </div>
          </div>
        )}
      </For>

      {/* Mobile logo (≤lg) */}
      <div class="mb-6 flex flex-col items-center gap-3 lg:hidden">
        <img
          alt="Nata POS"
          class="h-12 w-12 rounded-sm object-contain"
          height={48}
          src="/logo.png"
          width={48}
        />
        <span class="font-bold font-display text-[22px] text-primary tracking-[-0.01em] dark:text-foreground">
          Nata POS
        </span>
      </div>

      {/* Form header */}
      <div class="relative z-[1] mb-7 text-center lg:text-left">
        <h1 class="mb-1.5 font-bold font-display text-[26px] tracking-[-0.01em]">
          {props.title}
        </h1>
        <p class="text-muted-foreground text-sm leading-relaxed">
          {props.subtitle}
        </p>
      </div>

      {props.children}

      {/* Divider */}
      <div class="relative z-[1] my-6 flex items-center gap-4">
        <div class="h-px flex-1 bg-border" />
        <span class="text-muted-foreground text-xs uppercase tracking-[0.06em]">
          atau
        </span>
        <div class="h-px flex-1 bg-border" />
      </div>

      <Button
        class="relative z-[1] w-full"
        look="outline"
        onClick={() => toast.success("Menghubungkan ke Google...")}
        size="lg"
        tone="neutral"
      >
        <GoogleIcon class="h-5 w-5 shrink-0" />
        {props.googleLabel}
      </Button>

      {/* Footer */}
      <div class="relative z-[1] mt-7 text-center text-[13px] text-muted-foreground">
        {props.footer}
      </div>
    </main>
  );
}
