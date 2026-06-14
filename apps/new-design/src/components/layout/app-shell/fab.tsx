import { A } from "@solidjs/router";
import { CashRegisterIcon } from "~/assets";

export const Fab = () => (
  <div class="fixed right-7 bottom-7 z-[90] max-[900px]:hidden">
    <A
      aria-label="Buat Transaksi"
      class="group relative inline-flex h-14 overflow-hidden rounded-[10px] p-[2px] shadow-card transition-[transform,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:translate-y-[-3px] hover:scale-[1.03] hover:shadow-card-hover active:translate-y-0 active:scale-[0.98] active:shadow-card active:duration-100"
      href="/transaction-new"
    >
      {/* Rotating gradient ring — built from theme tokens so it adapts to dark/light */}
      <span class="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,var(--color-accent)_0%,var(--color-primary)_50%,var(--color-accent)_100%)]" />
      {/* Content */}
      <span class="relative inline-flex h-full w-full items-center justify-center gap-2.5 rounded-[8px] bg-primary px-7 font-semibold text-[15px] text-primary-foreground tracking-[0.02em]">
        <CashRegisterIcon class="h-5 w-5" />
        Buat Transaksi
      </span>
    </A>
  </div>
);
