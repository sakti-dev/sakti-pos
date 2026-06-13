import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full font-semibold text-[11px] uppercase tracking-[0.06em]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-border text-foreground",
        success: "bg-success/10 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/10 text-danger",
        accent: "bg-primary/10 text-primary",
        processing: "bg-[rgba(255,233,92,0.25)] text-[#7a5f00]",
      },
      size: {
        default: "px-2.5 py-0.5",
        sm: "h-[18px] min-w-[18px] px-1 text-[10px]",
        lg: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type BadgeProps = {
  class?: string | undefined;
  children?: JSX.Element;
} & VariantProps<typeof badgeVariants>;

export const Badge = (props: BadgeProps) => {
  const [local, others] = splitProps(props, [
    "variant",
    "size",
    "class",
    "children",
  ]);
  return (
    <div
      class={cn(
        badgeVariants({ variant: local.variant, size: local.size }),
        local.class
      )}
      {...others}
    >
      {local.children}
    </div>
  );
};
