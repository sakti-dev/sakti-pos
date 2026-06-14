import { Show } from "solid-js";
import { CheckCircleIcon } from "~/assets";

interface SuccessOverlayProps {
  readonly show: boolean;
}

export function SuccessOverlay(props: SuccessOverlayProps) {
  return (
    <Show when={props.show}>
      <div class="fixed inset-0 z-[1000] flex animate-fade-in items-center justify-center bg-[linear-gradient(135deg,var(--color-banner-from),var(--color-banner-to))]">
        <div class="flex animate-success-pop flex-col items-center gap-4">
          <div class="grid h-20 w-20 place-items-center rounded-full bg-accent/15 text-accent shadow-card">
            <CheckCircleIcon class="h-9 w-9" />
          </div>
          <div class="font-bold font-display text-heading-sm text-white tracking-[-0.02em]">
            Berhasil masuk
          </div>
          <div class="font-medium text-body-sm text-white/55">
            Mengalihkan ke dashboard...
          </div>
        </div>
      </div>
    </Show>
  );
}
