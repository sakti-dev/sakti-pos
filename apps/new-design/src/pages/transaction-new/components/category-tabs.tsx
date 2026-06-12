import type { Component } from "solid-js";
import { For } from "solid-js";
import {
  BoxPackageIcon,
  CoffeeIcon,
  GridDetailIcon,
  LayersIcon,
  SmileIcon,
  UtensilsIcon,
} from "~/assets";
import { cn } from "~/lib/utils";

export type CategoryKey =
  | "all"
  | "minuman"
  | "makanan"
  | "snack"
  | "dessert"
  | "paket";

interface CatTab {
  readonly Icon: Component<{ class?: string }>;
  readonly key: CategoryKey;
  readonly label: string;
}

export const categoryTabs: readonly CatTab[] = [
  { key: "all", Icon: GridDetailIcon, label: "Semua" },
  { key: "minuman", Icon: CoffeeIcon, label: "Minuman" },
  { key: "makanan", Icon: UtensilsIcon, label: "Makanan" },
  { key: "snack", Icon: SmileIcon, label: "Snack" },
  { key: "dessert", Icon: LayersIcon, label: "Dessert" },
  { key: "paket", Icon: BoxPackageIcon, label: "Paket" },
] as const;

interface CategoryTabsProps {
  readonly active: CategoryKey;
  readonly onSelect: (key: CategoryKey) => void;
}

export const CategoryTabs = (props: CategoryTabsProps) => (
  <div class="scrollbar-none flex shrink-0 gap-2 overflow-x-auto pb-1">
    <For each={categoryTabs}>
      {(tab) => (
        <button
          aria-label={tab.label}
          class={cn(
            "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[14px] border-[1.5px] bg-surface px-[18px] py-2.5 font-medium text-[13px] text-text-secondary transition-all duration-200 dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1e1e1e] dark:text-[#a0a0a0]",
            props.active === tab.key
              ? "border-primary bg-primary text-cream shadow-[0_2px_8px_rgba(26,51,0,0.25)] dark:border-primary dark:bg-primary dark:text-accent-2"
              : "border-border hover:border-[rgba(26,51,0,0.20)] hover:text-text hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:hover:border-[rgba(255,255,255,0.15)] dark:hover:text-[#f0f0f0]"
          )}
          onClick={() => props.onSelect(tab.key)}
          type="button"
        >
          <tab.Icon class="h-4 w-4 shrink-0" />
          {tab.label}
        </button>
      )}
    </For>
  </div>
);
