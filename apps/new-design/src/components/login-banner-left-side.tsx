import { For } from "solid-js";
import { ChartIcon, FileIcon, GridIcon, WalletIcon } from "../assets";
import { cn } from "../lib/utils";

const decoCards = [
  { Icon: FileIcon, label: "Transaksi" },
  { Icon: GridIcon, label: "Katalog" },
  { Icon: ChartIcon, label: "Laporan" },
  { Icon: WalletIcon, label: "Dompet" },
] as const;

const decoBgs = [
  "bg-accent/10",
  "bg-accent/10",
  "bg-accent/10",
  "bg-accent/10",
];

export function LoginBannerLeftSide() {
  return (
    <div class="relative hidden flex-1 flex-col items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#0b5239,#063a28)] p-12 lg:flex">
      <div class="pointer-events-none absolute -top-[120px] -right-[120px] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(211,250,153,0.15)_0%,transparent_70%)]" />
      <div class="pointer-events-none absolute -bottom-[100px] -left-[80px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(211,250,153,0.10)_0%,transparent_70%)]" />

      <div class="relative z-[1] text-center">
        <div class="mx-auto mb-6 h-20 w-20 overflow-hidden rounded-md">
          <img
            alt="Nata POS"
            class="h-full w-full object-contain"
            height={80}
            src="/logo.png"
            width={80}
          />
        </div>
        <div class="mb-2 font-bold text-[28px] text-white tracking-[-0.01em] dark:text-foreground">
          Nata POS
        </div>
        <div class="mx-auto max-w-xs text-[15px] text-white/55 leading-relaxed">
          Sistem Point of Sale modern untuk mengelola transaksi, laporan, dan
          katalog bisnis Anda dalam satu platform.
        </div>

        <div class="mt-12 grid grid-cols-2 gap-3">
          <For each={decoCards}>
            {({ Icon, label }, i) => (
              <div
                class={cn(
                  "flex h-20 w-[120px] flex-col items-center justify-center gap-1.5 rounded-sm border border-white/10",
                  decoBgs[i()]
                )}
              >
                <Icon class="h-6 w-6 text-white/70" />
                <span class="font-medium text-[10px] text-white/45 uppercase tracking-[0.04em]">
                  {label}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
