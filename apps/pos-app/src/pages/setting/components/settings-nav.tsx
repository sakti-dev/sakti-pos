import { useLocation, useNavigate } from "@solidjs/router";
import { For } from "solid-js";
import {
  CreditCardIcon,
  DollarSignIcon,
  FileIcon,
  InfoIcon,
  MonitorIcon,
  SettingsIcon,
  StoreIcon,
  UsersIcon,
} from "~/assets";
import { Button } from "~/components/ui/button";
import { useBreakpoints } from "~/lib/breakpoints";
import { cn } from "~/lib/utils";

export type SectionKey =
  | "business"
  | "general"
  | "tax"
  | "payment-methods"
  | "receipt"
  | "teams"
  | "devices"
  | "about";

export const NAV_ITEMS: readonly {
  readonly key: SectionKey;
  readonly label: string;
  readonly desc: string;
  readonly Icon: typeof StoreIcon;
}[] = [
  {
    key: "business",
    label: "Bisnis",
    desc: "Informasi dasar bisnis Anda",
    Icon: StoreIcon,
  },
  {
    key: "general",
    label: "Umum",
    desc: "Konfigurasi dasar aplikasi",
    Icon: SettingsIcon,
  },
  {
    key: "tax",
    label: "Pajak & Biaya",
    desc: "Atur tarif pajak dan biaya layanan",
    Icon: DollarSignIcon,
  },
  {
    key: "payment-methods",
    label: "Pembayaran",
    desc: "Kelola metode pembayaran",
    Icon: CreditCardIcon,
  },
  {
    key: "receipt",
    label: "Struk",
    desc: "Kustomisasi tampilan struk",
    Icon: FileIcon,
  },
  {
    key: "teams",
    label: "Kasir & Tim",
    desc: "Kelola anggota tim dan akses",
    Icon: UsersIcon,
  },
  {
    key: "devices",
    label: "Perangkat",
    desc: "Kelola printer dan perangkat keras",
    Icon: MonitorIcon,
  },
  {
    key: "about",
    label: "Tentang",
    desc: "Informasi aplikasi dan versi",
    Icon: InfoIcon,
  },
] as const;

export function SettingsNavigationMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const bp = useBreakpoints();
  const isWide = () => bp.lg;

  const sectionSeg = () => location.pathname.split("/")[2];

  // Desktop index route (/pengaturan) renders Bisnis by default, so it's
  // active. Below lg, the index has no active item — it's a menu screen.
  const activeKey = (): SectionKey | null => {
    const seg = sectionSeg();
    if (seg) {
      return seg as SectionKey;
    }
    return isWide() ? "business" : null;
  };
  return (
    <nav class="flex w-full shrink-0 flex-col lg:w-[220px] lg:gap-0.5">
      <For each={NAV_ITEMS}>
        {(item) => (
          <div class="border-border border-b lg:border-0">
            <Button
              aria-label={item.label}
              class="flex w-full items-center gap-3 whitespace-nowrap px-4 py-3.5 text-left font-semibold text-body-sm lg:rounded-xl lg:px-3.5 lg:py-2.5"
              look={activeKey() === item.key ? "soft" : "ghost"}
              onClick={() =>
                navigate(
                  // Below lg: every item (including business) drills into its
                  // own sub-route. Desktop: business uses the bare index route.
                  item.key === "business" && isWide()
                    ? "/setting"
                    : `/setting/${item.key}`
                )
              }
              size="none"
              tone="primary"
              type="button"
            >
              <item.Icon
                class={cn(
                  "size-5 shrink-0",
                  activeKey() === item.key
                    ? "text-primary"
                    : "opacity-55 transition-opacity duration-150 hover:opacity-80 dark:opacity-40"
                )}
              />
              <span class="flex min-w-0 flex-col gap-0.5">
                {item.label}
                <span class="font-normal text-caption text-muted-foreground lg:hidden">
                  {item.desc}
                </span>
              </span>
            </Button>
          </div>
        )}
      </For>
    </nav>
  );
}
