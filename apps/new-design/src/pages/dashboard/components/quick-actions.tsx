import type { Component } from "solid-js";
import { For } from "solid-js";
import {
  ChartIcon,
  ClipboardIcon,
  GridDetailIcon,
  MoreHorizontalIcon,
  PeopleIcon,
  QrCodeIcon,
  TruckIcon,
  WalletIcon,
} from "~/assets";

interface QuickAction {
  readonly Icon: Component<{ class?: string }>;
  readonly label: string;
}

const actions: readonly QuickAction[] = [
  { Icon: ChartIcon, label: "Laporan" },
  { Icon: WalletIcon, label: "Dompet" },
  { Icon: GridDetailIcon, label: "Katalog" },
  { Icon: TruckIcon, label: "Tipe Pengantaran" },
  { Icon: ClipboardIcon, label: "Tipe Order" },
  { Icon: QrCodeIcon, label: "QR Menu" },
  { Icon: PeopleIcon, label: "Pelanggan" },
  { Icon: MoreHorizontalIcon, label: "Lainnya" },
] as const;

export const QuickActions = () => (
  <section>
    <div class="grid grid-cols-[repeat(8,1fr)] gap-4 max-[1100px]:grid-cols-[repeat(4,1fr)] max-[600px]:grid-cols-[repeat(4,1fr)]">
      <For each={actions}>
        {(qa) => (
          <button
            aria-label={qa.label}
            class="flex min-h-[100px] flex-col items-center gap-2.5 rounded-[18px] border border-border bg-surface px-1 pt-[18px] pb-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-medium active:translate-y-0 active:scale-[0.96] dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1a1a1a] dark:hover:border-[rgba(255,255,255,0.12)]"
            type="button"
          >
            <div class="grid h-12 w-12 place-items-center rounded-full border border-border bg-surface-gray text-primary transition-[border-color,background,transform] duration-200 hover:scale-106 hover:border-[#3cd070] hover:bg-accent-2 dark:border-[rgba(255,255,255,0.10)] dark:bg-[rgba(255,255,255,0.04)] dark:text-[#d4d4d4] dark:hover:border-[rgba(255,255,255,0.20)] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <qa.Icon class="h-5 w-5" />
            </div>
            <span class="max-w-[80px] text-center font-semibold text-[11px] text-text-secondary leading-tight tracking-[0.02em] dark:text-[#a0a0a0]">
              {qa.label}
            </span>
          </button>
        )}
      </For>
    </div>
  </section>
);
