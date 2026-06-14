import { A } from "@solidjs/router";
import { CashRegisterIcon } from "~/assets";

export const Fab = () => (
  <div class="fixed right-7 bottom-7 z-[90] max-[900px]:hidden">
    <A
      aria-label="Buat Transaksi"
      class="relative flex h-14 animate-[fab-pulse_2.8s_ease-in-out_infinite] items-center gap-2.5 rounded-[10px] bg-primary px-7 font-semibold text-[15px] text-primary-foreground tracking-[0.02em] shadow-card transition-[transform,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:translate-y-[-3px] hover:scale-[1.03] hover:animate-none hover:shadow-card-hover active:translate-y-0 active:scale-[0.98] active:shadow-card active:duration-100 dark:animate-[fab-pulse-dark_2.8s_ease-in-out_infinite] dark:hover:animate-none"
      href="/transaction-new"
    >
      <CashRegisterIcon class="h-5 w-5" />
      Buat Transaksi
    </A>
  </div>
);
