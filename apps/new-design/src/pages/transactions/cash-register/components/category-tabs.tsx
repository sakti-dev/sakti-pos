import { For } from "solid-js";
import { Tab } from "~/components/ui/tab";

export type CategoryKey = "minuman" | "makanan" | "snack" | "dessert" | "paket";

interface CatTab {
  readonly key: CategoryKey;
  readonly label: string;
}

export const categoryTabs: readonly CatTab[] = [
  { key: "minuman", label: "Minuman" },
  { key: "makanan", label: "Makanan" },
  { key: "snack", label: "Snack" },
  { key: "dessert", label: "Dessert" },
  { key: "paket", label: "Paket" },
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
          class="px-8 py-4 text-body"
          onClick={() => props.onSelect(tab.key)}
        >
          {tab.label}
        </Tab>
      )}
    </For>
  </div>
);
