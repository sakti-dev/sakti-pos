import { A } from "@solidjs/router";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

export const linkVariants = cva(
  "underline-o text-primary underline underline-offset-2 transition-all duration-standard ease-standard focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 dark:text-accent",
  {
    variants: {
      variant: {
        default: "font-medium text-[13px] hover:opacity-70",
        emphasis: "font-semibold no-underline hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type LinkProps = {
  class?: string | undefined;
  children?: JSX.Element;
} & VariantProps<typeof linkVariants> &
  Parameters<typeof A>[0];

export const Link = (props: LinkProps) => {
  const [local, others] = splitProps(props, ["variant", "class", "children"]);
  return (
    <A
      class={cn(linkVariants({ variant: local.variant }), local.class)}
      {...others}
    >
      {local.children}
    </A>
  );
};
