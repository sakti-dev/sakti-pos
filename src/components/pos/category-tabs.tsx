import type { Component } from "solid-js";
import { For } from "solid-js";
import { cn } from "~/lib/utils";

interface CategoryTabsProps {
  categories: string[];
  onChange: (category: string | null) => void;
  selected: string | null;
}

const CategoryTabs: Component<CategoryTabsProps> = (props) => {
  const allTabs = () => [null, ...props.categories];

  return (
    <div class="scrollbar-none flex gap-1.5 overflow-x-auto px-4 py-2">
      <For each={allTabs()}>
        {(category) => {
          const isActive = () => props.selected === category;
          const label = () => category ?? "Semua";
          return (
            <button
              class={cn(
                "shrink-0 rounded-full px-4 py-2 font-medium text-sm transition-colors",
                isActive()
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
              onClick={() => props.onChange(category)}
              type="button"
            >
              {label()}
            </button>
          );
        }}
      </For>
    </div>
  );
};

export { CategoryTabs };
