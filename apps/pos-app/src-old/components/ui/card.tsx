import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

const cardVariants = cva(
  "rounded-xl border border-border/60 bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
  {
    variants: {
      size: {
        none: "",
        sm: "p-3",
        md: "p-4",
        lg: "p-6",
      },
      radius: {
        default: "rounded-xl",
        lg: "rounded-2xl",
      },
      interactive: {
        none: "",
        clickable:
          "cursor-pointer transition-all duration-200 active:bg-accent/50",
        pressable:
          "cursor-pointer transition-all duration-200 active:scale-[0.97] active:bg-accent/80",
        selectable:
          "cursor-pointer transition-all duration-200 hover:border-primary/50 hover:bg-primary/[0.03]",
      },
      selected: {
        true: "border-primary/50 bg-primary/[0.06]",
        false: "",
      },
    },
    defaultVariants: {
      size: "md",
      radius: "default",
      interactive: "none",
      selected: false,
    },
  }
);

type CardVariants = VariantProps<typeof cardVariants>;

type CardProps = ComponentProps<"div"> &
  CardVariants & {
    class?: string;
  };

const Card: Component<CardProps> = (props) => {
  const [local, others] = splitProps(props, [
    "class",
    "size",
    "radius",
    "interactive",
    "selected",
  ]);
  return (
    <div
      class={cn(
        cardVariants({
          size: local.size,
          radius: local.radius,
          interactive: local.interactive,
          selected: local.selected,
        }),
        local.class
      )}
      {...others}
    />
  );
};

const CardHeader: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div class={cn("flex flex-col space-y-1.5 p-6", local.class)} {...others} />
  );
};

const CardTitle: Component<ComponentProps<"h3">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <h3
      class={cn(
        "font-semibold text-lg leading-none tracking-tight",
        local.class
      )}
      {...others}
    />
  );
};

const CardDescription: Component<ComponentProps<"p">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <p class={cn("text-muted-foreground text-sm", local.class)} {...others} />
  );
};

const CardContent: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <div class={cn("p-6 pt-0", local.class)} {...others} />;
};

const CardFooter: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div class={cn("flex items-center p-6 pt-0", local.class)} {...others} />
  );
};

export type { CardProps };
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
};
