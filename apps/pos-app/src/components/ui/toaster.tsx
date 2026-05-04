import { For } from "solid-js";
import { dismissToast, type Toast, toasts } from "~/lib/toast";
import { cn } from "~/lib/utils";

const VARIANT_STYLES: Record<Toast["variant"], string> = {
  error: "bg-destructive text-destructive-foreground",
  info: "bg-card text-foreground border",
  success: "bg-success text-success-foreground",
};

export function Toaster() {
  return (
    <div
      aria-live="polite"
      class="fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      <For each={toasts()}>
        {(t) => (
          <div
            class={cn(
              "flex w-full max-w-sm items-center justify-between rounded-xl px-4 py-3 font-medium text-sm shadow-lg",
              VARIANT_STYLES[t.variant]
            )}
          >
            <span>{t.message}</span>
            <button
              class="ml-2 opacity-70 hover:opacity-100"
              onClick={() => dismissToast(t.id)}
              type="button"
            >
              ✕
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
