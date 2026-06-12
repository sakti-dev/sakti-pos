import { A } from "@solidjs/router";
import { PlusIcon } from "~/assets";

export const Fab = () => (
  <div class="fixed right-7 bottom-7 z-[90] max-[900px]:hidden">
    <A
      aria-label="Buat Transaksi"
      class="relative flex h-14 animate-[fab-pulse_2.8s_ease-in-out_infinite] items-center gap-2.5 rounded-[14px] bg-primary px-7 font-semibold text-[15px] text-cream tracking-[0.02em] shadow-[0_6px_24px_rgba(26,51,0,0.35)] transition-[transform,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:translate-y-[-3px] hover:scale-[1.03] hover:animate-none hover:shadow-[0_10px_36px_rgba(26,51,0,0.40),0_0_0_4px_rgba(26,51,0,0.06)] active:translate-y-0 active:scale-[0.98] active:shadow-[0_2px_10px_rgba(26,51,0,0.30)] active:duration-100 dark:animate-[fab-pulse-dark_2.8s_ease-in-out_infinite] dark:bg-[#2d5a00] dark:shadow-[0_6px_24px_rgba(0,0,0,0.50)] dark:hover:animate-none dark:hover:shadow-[0_10px_36px_rgba(0,0,0,0.60),0_0_0_4px_rgba(168,229,229,0.08)]"
      href="/transaction-new"
    >
      <PlusIcon class="h-5 w-5" />
      Buat Transaksi
    </A>
  </div>
);
