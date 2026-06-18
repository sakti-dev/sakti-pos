import { A } from "@solidjs/router";
import { CashRegisterIcon } from "~/assets";

/**
 * The visual anchor of the home page. The sale is the hero — the most
 * important thing a cashier does, made the biggest, most thumb-reachable
 * affordance on the screen. Canopy fill + confident tactile lift.
 */
export const StartSale = () => {
  return (
    <A
      class="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-card transition duration-200 ease-standard hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-card-hover active:translate-y-0 active:bg-primary-active active:shadow-none dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
      href="/transactions/cash-register"
    >
      {/* Lime seal — the single lime moment on this surface */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -top-10 -right-8 size-40 rounded-full bg-accent/10 blur-2xl"
      />

      <span class="relative grid size-14 shrink-0 place-items-center rounded-full bg-primary-foreground/10 ring-1 ring-primary-foreground/15 transition-transform duration-200 ease-standard group-hover:scale-105">
        <CashRegisterIcon class="size-7" />
      </span>

      <span class="relative flex min-w-0 flex-1 flex-col">
        <span class="font-bold font-display text-[22px] leading-tight tracking-[-0.01em]">
          Mulai Transaksi
        </span>
        <span class="mt-0.5 text-caption text-primary-foreground/65">
          Buat penjualan baru
        </span>
      </span>

      <span class="relative grid size-9 shrink-0 place-items-center rounded-full bg-primary-foreground/10 transition-transform duration-200 ease-standard group-hover:translate-x-0.5">
        <svg
          aria-hidden="true"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
        >
          <path d="M5 12h14" />
          <path d="m13 5 7 7-7 7" />
        </svg>
      </span>
    </A>
  );
};
