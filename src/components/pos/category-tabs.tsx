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
      props.active
        ? "border border-primary bg-primary/10"
        : "border border-border bg-card"
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
      <svg
        aria-hidden="true"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    </div>
    <span class="truncate font-medium text-sm">{props.label}</span>
  </button>
);

export { CategoryTabs };
