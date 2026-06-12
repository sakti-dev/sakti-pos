import * as ButtonPrimitive from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium font-sans text-sm transition-[background,border-color,box-shadow,transform] duration-standard ease-standard focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_4px_16px_rgba(26,51,0,0.20)] active:translate-y-0 active:bg-primary-active active:shadow-none dark:hover:shadow-[0_4px_16px_rgba(26,51,0,0.40)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border-[1.5px] border-input bg-background text-foreground hover:border-muted-foreground hover:bg-muted hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] active:bg-border-light",
        "outline-primary":
          "border-[1.5px] border-primary bg-transparent font-semibold text-primary hover:bg-primary-light active:scale-[0.98] dark:border-[rgba(168,229,229,0.30)] dark:text-accent dark:hover:bg-[rgba(168,229,229,0.08)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-8",
        xl: "h-[50px] px-8 font-semibold text-[15px] tracking-[0.02em]",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-xs": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonProps<T extends ValidComponent = "button"> =
  ButtonPrimitive.ButtonRootProps<T> &
    VariantProps<typeof buttonVariants> & {
      class?: string | undefined;
      children?: JSX.Element;
    };

export const Button = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ButtonProps<T>>
) => {
  const [local, others] = splitProps(props as ButtonProps, [
    "variant",
    "size",
    "class",
  ]);
  return (
    <ButtonPrimitive.Root
      class={cn(
        buttonVariants({ variant: local.variant, size: local.size }),
        local.class
      )}
      {...others}
    />
  );
};
