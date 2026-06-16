import { InfoIcon } from "~/assets";
import { SectionCard } from "./primitives";

export function SectionAbout() {
  return (
    <SectionCard class="items-center text-center">
      <div class="grid h-16 w-16 place-items-center rounded-2xl border border-border bg-muted">
        <InfoIcon class="h-8 w-8 text-faint-foreground" />
      </div>
      <div class="font-bold font-display text-foreground text-subheading">
        Sakti POS
      </div>
      <div class="-mt-2 text-body-sm text-muted-foreground">
        Versi 1.0.0 (Build 2026.06)
      </div>
      <p class="max-w-[360px] text-center text-body-sm text-muted-foreground leading-relaxed">
        Sistem kasir modern untuk bisnis F&amp;B Anda. Didesain untuk cepat,
        andal, dan mudah digunakan.
      </p>
      <div class="mt-2 flex gap-3">
        <button
          class="font-medium text-body-sm text-primary transition-opacity duration-150 hover:opacity-75 dark:text-accent"
          type="button"
        >
          Kebijakan Privasi
        </button>
        <button
          class="font-medium text-body-sm text-primary transition-opacity duration-150 hover:opacity-75 dark:text-accent"
          type="button"
        >
          Syarat &amp; Ketentuan
        </button>
        <button
          class="font-medium text-body-sm text-primary transition-opacity duration-150 hover:opacity-75 dark:text-accent"
          type="button"
        >
          Bantuan
        </button>
      </div>
    </SectionCard>
  );
}
