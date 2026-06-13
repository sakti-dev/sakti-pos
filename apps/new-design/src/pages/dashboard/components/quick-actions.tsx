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
            class="flex min-h-[96px] flex-col items-center gap-2.5 rounded-lg border border-border bg-card px-1 pt-[18px] pb-4 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-card-hover dark:shadow-none dark:hover:shadow-none"
            type="button"
          >
            <div class="grid h-12 w-12 place-items-center rounded-full border border-border bg-muted text-muted-foreground transition-colors duration-200 hover:border-accent/50 hover:bg-accent/10 hover:text-foreground">
              <qa.Icon class="h-5 w-5" />
            </div>
            <span class="max-w-[80px] text-center font-medium text-[11px] text-muted-foreground leading-tight tracking-[0.02em]">
              {qa.label}
            </span>
          </button>
        )}
      </For>
    </div>
  </section>
);
