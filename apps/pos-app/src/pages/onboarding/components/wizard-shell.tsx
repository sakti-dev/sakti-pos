import { type JSX, Show } from "solid-js";
import { ArrowLeftIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import { cn } from "~/lib/utils";

interface WizardShellProps {
  readonly canProceed: boolean;
  readonly children: JSX.Element;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly step: number; // 1-based
  readonly submitLabel?: string;
  readonly submitting?: boolean;
  readonly subtitle: string;
  readonly title: string;
  readonly total: number; // e.g. 3
}

/**
 * Layout shell for one onboarding step: sticky progress + header up top,
 * scrollable step body in the middle, sticky back/next footer at the
 * bottom (thumb-reachable primary action on mobile — PRODUCT.md
 * principle 4).
 */
export function WizardShell(props: WizardShellProps) {
  const progressPct = () => `${(props.step / props.total) * 100}%`;
  const isFirst = () => props.step === 1;
  const isLast = () => props.step === props.total;

  return (
    <div class="flex min-h-0 w-full flex-1 flex-col bg-background">
      {/* ── Progress + header (sticky) ── */}
      <header class="shrink-0 px-5 pt-5 sm:px-7">
        <div class="mx-auto w-full max-w-xl">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-semibold text-caption text-muted-foreground uppercase tracking-[0.08em]">
              Langkah {props.step} dari {props.total}
            </span>
            <Show when={isLast()}>
              <span class="font-semibold text-caption text-primary uppercase tracking-[0.08em]">
                Selesai
              </span>
            </Show>
          </div>
          {/* Progress bar — canopy track, lime fill on the active step */}
          <div
            aria-hidden
            class="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="presentation"
          >
            <div
              class="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: progressPct() }}
            />
          </div>

          <h1 class="mt-5 font-bold font-display text-[26px] text-foreground leading-tight tracking-snug">
            {props.title}
          </h1>
          <p class="mt-1.5 text-body-sm text-muted-foreground leading-relaxed">
            {props.subtitle}
          </p>
        </div>
      </header>

      {/* ── Step body (scrollable) ── */}
      <main class="flex-1 overflow-y-auto px-5 pt-6 pb-4 sm:px-7">
        <FadeIn class="mx-auto w-full max-w-xl" duration={0.32} y={10}>
          {props.children}
        </FadeIn>
      </main>

      {/* ── Footer actions (sticky, thumb-reachable) ── */}
      <footer class="shrink-0 border-border border-t bg-background px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-7">
        <div class="mx-auto flex w-full max-w-xl items-center gap-3">
          <Show when={!isFirst()}>
            <Button
              class="shrink-0"
              look="outline"
              onClick={props.onBack}
              size="lg"
              tone="neutral"
            >
              <ArrowLeftIcon class="size-4" />
              Kembali
            </Button>
          </Show>

          <Button
            class={cn("flex-1", !props.canProceed && "opacity-60")}
            disabled={!props.canProceed || props.submitting}
            onClick={props.onNext}
            size="lg"
            type="button"
          >
            <Show
              fallback={
                <span class="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              }
              when={!props.submitting}
            >
              {props.submitLabel ?? (isLast() ? "Selesai" : "Lanjut")}
            </Show>
          </Button>
        </div>
      </footer>
    </div>
  );
}
