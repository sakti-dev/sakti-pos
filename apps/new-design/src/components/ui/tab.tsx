import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "~/lib/utils";

/**
 * Tab — a segmented-control button with a STABLE border box.
 *
 * Both `active` and `inactive` share the same border width from `shape`, so
 * toggling a tab never causes layout shift. The active state swaps fill/border
 * color + adds elevation; inactive is a bordered card chip.
 *
 * Active uses the selected-on-lime treatment (`bg-accent-soft text-primary`),
 * consistent with the settings nav — canopy-on-lime ≈ 10.76:1 in both themes,
 * so no dark override is needed.
 */
export const tabVariants = cva(
  "flex shrink-0 items-center font-semibold text-[13px] transition-[background,border-color,color,box-shadow] duration-150",
  {
    variants: {
      variant: {
        inactive:
          "border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground",
        active: "border-primary bg-accent-soft text-primary shadow-card",
      },
      shape: {
        rounded:
          "gap-2 whitespace-nowrap rounded-[14px] border-[1.5px] px-[18px] py-2.5",
        pill: "rounded-full border px-4 py-[7px]",
      },
    },
    defaultVariants: {
      variant: "inactive",
      shape: "rounded",
    },
  }
);

export interface TabProps {
  readonly active?: boolean;
  readonly "aria-label"?: string;
  readonly children: JSX.Element;
  readonly class?: string;
  readonly onClick: () => void;
  readonly shape?: VariantProps<typeof tabVariants>["shape"];
}

export const Tab = (props: TabProps) => {
  const [local, others] = splitProps(props, [
    "active",
    "shape",
    "class",
    "children",
  ]);
  return (
    <button
      class={cn(
        tabVariants({
          variant: local.active ? "active" : "inactive",
          shape: local.shape,
        }),
        local.class
      )}
      type="button"
      {...others}
    >
      {local.children}
    </button>
  );
};
