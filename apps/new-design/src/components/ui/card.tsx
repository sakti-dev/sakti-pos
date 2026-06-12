import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

export const cardVariants = cva(
  "bg-card text-card-foreground transition-[box-shadow,transform,border-color] duration-standard ease-standard",
  {
    variants: {
      variant: {
        default: "border border-border-light",
        elevated: "border border-border-light shadow-sm",
        interactive:
          "border border-border-light hover:-translate-y-px hover:border-[rgba(26,51,0,0.15)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] active:translate-y-0",
        outline: "border border-border",
        ghost: "border-none shadow-none",
      },
      radius: {
        sm: "rounded-sm",
        md: "rounded-md",
        lg: "rounded-lg",
        xl: "rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      radius: "lg",
    },
  }
);

export type CardProps = {
  class?: string | undefined;
  children?: JSX.Element;
} & VariantProps<typeof cardVariants>;

export const Card = (props: CardProps) => {
  const [local, others] = splitProps(props, [
    "variant",
    "radius",
    "class",
    "children",
  ]);
  return (
    <div
      class={cn(
        cardVariants({ variant: local.variant, radius: local.radius }),
        local.class
      )}
      {...others}
    >
      {local.children}
    </div>
  );
};

export const CardHeader = (props: {
  class?: string;
  children?: JSX.Element;
}) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("flex flex-col gap-1.5 p-6", local.class)} {...others}>
      {local.children}
    </div>
  );
};

export const CardTitle = (props: {
  class?: string;
  children?: JSX.Element;
}) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <h3
      class={cn("font-semibold text-foreground leading-none", local.class)}
      {...others}
    >
      {local.children}
    </h3>
  );
};

export const CardDescription = (props: {
  class?: string;
  children?: JSX.Element;
}) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <p class={cn("text-muted-foreground text-sm", local.class)} {...others}>
      {local.children}
    </p>
  );
};

export const CardContent = (props: {
  class?: string;
  children?: JSX.Element;
}) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("p-6 pt-0", local.class)} {...others}>
      {local.children}
    </div>
  );
};

export const CardFooter = (props: {
  class?: string;
  children?: JSX.Element;
}) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("flex items-center p-6 pt-0", local.class)} {...others}>
      {local.children}
    </div>
  );
};
