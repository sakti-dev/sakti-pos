import { A } from "@solidjs/router";
import type { Component } from "solid-js";
import { For } from "solid-js";
import { Dynamic } from "solid-js/web";
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
  readonly href?: string;
  readonly Icon: Component<{ class?: string }>;
  readonly label: string;
}

const actions: readonly QuickAction[] = [
  { Icon: ChartIcon, label: "Laporan" },
  { Icon: WalletIcon, label: "Dompet" },
  { Icon: GridDetailIcon, href: "/catalog", label: "Katalog" },
  { Icon: TruckIcon, label: "Tipe Pengantaran" },
  { Icon: ClipboardIcon, label: "Tipe Order" },
  { Icon: QrCodeIcon, label: "QR Menu" },
  { Icon: PeopleIcon, label: "Pelanggan" },
  { Icon: MoreHorizontalIcon, label: "Lainnya" },
] as const;

export const QuickActions = () => (
  <section>
    <div class="grid grid-cols-3 gap-4 sm:grid-cols-[repeat(4,1fr)] lg:grid-cols-[repeat(8,1fr)]">
      <For each={actions}>
        {(qa) => (
          <Dynamic
            aria-label={qa.label}
            class="group flex min-h-[96px] cursor-pointer flex-col items-center gap-2.5 rounded-lg px-1 pt-[18px] pb-4 text-muted-foreground no-underline transition duration-200 hover:bg-foreground/5 hover:text-foreground sm:border sm:border-border sm:bg-card sm:shadow-card sm:hover:-translate-y-0.5 sm:hover:border-accent/30 sm:hover:bg-transparent sm:hover:shadow-card-hover dark:sm:shadow-none dark:sm:hover:shadow-none"
            component={qa.href ? A : "button"}
            href={qa.href}
            type={qa.href ? undefined : "button"}
          >
            <div class="grid h-12 w-12 place-items-center rounded-full border border-border bg-muted text-muted-foreground transition-colors duration-200 group-hover:border-accent/50 group-hover:bg-accent/10 group-hover:text-foreground">
              <qa.Icon class="h-5 w-5" />
            </div>
            <span class="max-w-[80px] text-center font-medium text-caption-sm text-muted-foreground leading-tight">
              {qa.label}
            </span>
          </Dynamic>
        )}
      </For>
    </div>
  </section>
);
