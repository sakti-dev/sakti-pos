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
import { cn } from "~/lib/utils";

export type SectionKey =
  | "bisnis"
  | "umum"
  | "pajak"
  | "pembayaran"
  | "struk"
  | "tim"
  | "perangkat"
  | "tentang";

const NAV_ITEMS: readonly {
  readonly key: SectionKey;
  readonly label: string;
  readonly Icon: typeof StoreIcon;
}[] = [
  { key: "bisnis", label: "Bisnis", Icon: StoreIcon },
  { key: "umum", label: "Umum", Icon: SettingsIcon },
  { key: "pajak", label: "Pajak & Biaya", Icon: DollarSignIcon },
  { key: "pembayaran", label: "Pembayaran", Icon: CreditCardIcon },
  { key: "struk", label: "Struk", Icon: FileIcon },
  { key: "tim", label: "Kasir & Tim", Icon: UsersIcon },
  { key: "perangkat", label: "Perangkat", Icon: MonitorIcon },
  { key: "tentang", label: "Tentang", Icon: InfoIcon },
] as const;

interface SettingsNavProps {
  readonly active: SectionKey;
  readonly onSelect: (key: SectionKey) => void;
}

export function SettingsNav(props: SettingsNavProps) {
  return (
    <nav class="flex w-[220px] shrink-0 flex-col gap-0.5 gap-y-2 max-[900px]:w-full max-[900px]:flex-row max-[900px]:gap-1">
      <For each={NAV_ITEMS}>
        {(item) => {
          const isActive = () => props.active === item.key;
          return (
            <Button
              aria-label={item.label}
              class="flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-left font-semibold text-[13px] tracking-[0.01em] max-[900px]:whitespace-nowrap max-[900px]:px-3 max-[900px]:py-2 max-[900px]:text-[12px]"
              look={isActive() ? "soft" : "ghost"}
              onClick={() => props.onSelect(item.key)}
              size="none"
              tone="primary"
              type="button"
            >
              <item.Icon
                class={cn(
                  "h-[18px] w-[18px] shrink-0",
                  isActive()
                    ? "text-primary"
                    : "opacity-55 transition-[opacity] duration-150 hover:opacity-80 dark:opacity-40"
                )}
              />
              {item.label}
            </Button>
          );
        }}
      </For>
    </nav>
  );
}
