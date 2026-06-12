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
    <nav class="flex w-[220px] shrink-0 flex-col gap-0.5 max-[900px]:w-full max-[900px]:flex-row max-[900px]:gap-1">
      <For each={NAV_ITEMS}>
        {(item) => (
          <button
            aria-label={item.label}
            class={
              props.active === item.key
                ? "flex items-center gap-2.5 rounded-[10px] border-none bg-accent-2 px-3.5 py-2.5 text-left font-semibold text-[13px] text-primary tracking-[0.01em] max-[900px]:whitespace-nowrap max-[900px]:px-3 max-[900px]:py-2 max-[900px]:text-[12px] dark:bg-[rgba(60,208,112,0.15)] dark:text-accent"
                : "flex items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3.5 py-2.5 text-left font-medium text-[13px] text-text-secondary tracking-[0.01em] transition-[background,color] duration-150 hover:bg-[rgba(9,73,51,0.04)] hover:text-text max-[900px]:whitespace-nowrap max-[900px]:px-3 max-[900px]:py-2 max-[900px]:text-[12px] dark:text-[#a0a0a0] dark:hover:bg-[rgba(255,255,255,0.05)] dark:hover:text-[#ededed]"
            }
            onClick={() => props.onSelect(item.key)}
            type="button"
          >
            <item.Icon
              class={
                props.active === item.key
                  ? "h-[18px] w-[18px] shrink-0 text-primary dark:text-accent"
                  : "h-[18px] w-[18px] shrink-0 opacity-55 transition-[opacity] duration-150 hover:opacity-80 dark:opacity-40"
              }
            />
            {item.label}
          </button>
        )}
      </For>
    </nav>
  );
}
