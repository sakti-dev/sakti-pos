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
import { useIsWide } from "~/lib/use-is-wide";
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
  readonly Icon: typeof StoreIcon;
}[] = [
  { key: "business", label: "Bisnis", Icon: StoreIcon },
  { key: "general", label: "Umum", Icon: SettingsIcon },
  { key: "tax", label: "Pajak & Biaya", Icon: DollarSignIcon },
  { key: "payment-methods", label: "Pembayaran", Icon: CreditCardIcon },
  { key: "receipt", label: "Struk", Icon: FileIcon },
  { key: "teams", label: "Kasir & Tim", Icon: UsersIcon },
  { key: "devices", label: "Perangkat", Icon: MonitorIcon },
  { key: "about", label: "Tentang", Icon: InfoIcon },
] as const;

export function SettingsNavigationMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const isWide = useIsWide();

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
    <nav class="flex w-full shrink-0 flex-col gap-0.5 lg:w-[220px]">
      <For each={NAV_ITEMS}>
        {(item) => (
          <Button
            aria-label={item.label}
            class="flex w-full items-center gap-2.5 whitespace-nowrap rounded-[10px] px-4 py-3 text-left font-semibold text-body-sm lg:w-auto lg:px-3.5 lg:py-2.5"
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
                "h-[18px] w-[18px] shrink-0",
                activeKey() === item.key
                  ? "text-primary"
                  : "opacity-55 transition-[opacity] duration-150 hover:opacity-80 dark:opacity-40"
              )}
            />
            {item.label}
          </Button>
        )}
      </For>
    </nav>
  );
}
