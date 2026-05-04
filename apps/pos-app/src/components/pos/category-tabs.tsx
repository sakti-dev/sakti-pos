import { TbOutlinePencil } from "solid-icons/tb";
import type { Component } from "solid-js";
import { For } from "solid-js";
import { cn } from "~/lib/utils";

interface CategoryTabsProps {
  categories: string[];
  onChange: (category: string | null) => void;
  selected: string | null;
}

const CategoryTabs: Component<CategoryTabsProps> = (props) => (
  <div class="scrollbar-none flex gap-3 overflow-x-auto px-4 py-3">
    <CategoryCard
      active={props.selected === null}
      label="Semua"
      onClick={() => props.onChange(null)}
    />
    <For each={props.categories}>
      {(cat) => (
        <CategoryCard
          active={props.selected === cat}
          label={cat}
          onClick={() => props.onChange(cat)}
        />
      )}
    </For>
  </div>
);

interface CategoryCardProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

const CategoryCard: Component<CategoryCardProps> = (props) => (
  <button
    class={cn(
      "flex w-[100px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl p-3 transition-colors",
      props.active ? "border border-primary bg-primary/10" : "border bg-card"
    )}
    onClick={props.onClick}
    type="button"
  >
    <div
      class={cn(
        "flex size-10 items-center justify-center rounded-full",
        props.active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      )}
    >
      <TbOutlinePencil class="size-5" />
    </div>
    <span class="truncate font-medium text-sm">{props.label}</span>
  </button>
);

export { CategoryTabs };
