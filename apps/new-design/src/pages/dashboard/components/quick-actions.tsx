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
    <div class="grid grid-cols-[repeat(8,1fr)] gap-2.5 max-[1100px]:grid-cols-[repeat(4,1fr)] max-[600px]:grid-cols-[repeat(4,1fr)]">
      <For each={actions}>
        {(qa) => (
          <button
            aria-label={qa.label}
            class="flex min-h-[100px] flex-col items-center gap-2.5 rounded-[14px] border border-border bg-surface px-1 pt-[18px] pb-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[rgba(26,51,0,0.15)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] active:translate-y-0 active:scale-[0.96] dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1e1e1e] dark:hover:border-[rgba(255,255,255,0.12)] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.30)]"
            type="button"
          >
            <div class="grid h-12 w-12 place-items-center rounded-full border-[1.5px] border-border text-primary transition-[border-color,background,transform] duration-200 group-hover:scale-106 group-hover:border-primary group-hover:bg-[rgba(26,51,0,0.04)] dark:border-[rgba(255,255,255,0.10)] dark:text-[#c0c0c0]">
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
