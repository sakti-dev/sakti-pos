import type { Component } from "solid-js";
import { For } from "solid-js";
import {
  BoxPackageIcon,
  CoffeeIcon,
  LayersIcon,
  SmileIcon,
  UtensilsIcon,
} from "~/assets";
import { Tab } from "~/components/ui/tab";

export type CategoryKey = "minuman" | "makanan" | "snack" | "dessert" | "paket";

interface CatTab {
  readonly Icon: Component<{ class?: string }>;
  readonly key: CategoryKey;
  readonly label: string;
}

export const categoryTabs: readonly CatTab[] = [
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
  <div class="scrollbar-none flex shrink-0 gap-2.5 overflow-x-auto pb-1">
    <For each={categoryTabs}>
      {(tab) => (
        <Tab
          active={props.active === tab.key}
          aria-label={tab.label}
          class="gap-3 px-8 py-4 text-body"
          onClick={() => props.onSelect(tab.key)}
        >
          <tab.Icon class="h-5 w-5 shrink-0" />
          {tab.label}
        </Tab>
      )}
    </For>
  </div>
);
