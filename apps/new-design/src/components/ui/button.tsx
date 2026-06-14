import * as ButtonPrimitive from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

/**
 * Composable button system.
 *
 *   look × tone × size  →  5 × 3 × 9 = 135 combinations from 17 definitions.
 *
 * ┌──────────┬──────────────────────────────────────────────────────┐
 * │ look     │ solid | soft | outline | ghost | link                │
 * │ tone     │ primary | danger | neutral                     │
 * │ size     │ xs | sm | md | lg | xl | icon | icon-sm | icon-xs   │
 * │          │ | none                                              │
 * └──────────┴──────────────────────────────────────────────────────┘
 *
 * Migration from old variants:
 *   default           → look="solid"  tone="primary"
 *   danger       → look="solid"  tone="danger"
 *   outline           → look="outline" tone="neutral"
 *   outline-primary   → look="outline" tone="primary"
 *   secondary         → look="soft"   tone="neutral"
 *   ghost             → look="ghost"  tone="neutral"
 *   link              → look="link"   tone="primary"
 *   card / card-active           → outline/soft + tone="primary" + class
 *   pill / pill-highlight / ...  → outline/soft/solid + tone="primary" + class
 *   card-accent / card-accent-active → outline/soft + tone="primary" + class
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-sm font-medium font-sans text-sm transition-[background,border-color,box-shadow,transform,color] duration-standard ease-standard focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      look: {
        solid: "border-none",
        soft: "border-none",
        outline: "border-[1.5px]",
        ghost: "border-none bg-transparent",
        link: "border-none bg-transparent",
      },
      tone: {
        primary: "",
        danger: "",
        neutral: "",
      },
      size: {
        xs: "h-8 justify-center px-2.5 text-xs",
        sm: "h-9 justify-center px-3 text-xs",
        md: "h-10 justify-center px-4 py-2",
        lg: "h-12 justify-center px-8 font-semibold",
        xl: "h-[50px] justify-center px-8 font-semibold text-[15px] tracking-[0.02em]",
        icon: "size-10 justify-center",
        "icon-sm": "size-9 justify-center",
        "icon-xs": "size-8 justify-center",
        none: "",
      },
    },
    compoundVariants: [
      /* ── solid ──────────────────────────────────────────────────── */
      {
        look: "solid",
        tone: "primary",
        class:
          "bg-primary text-primary-foreground hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_4px_12px_rgba(28,58,19,0.25),0_1px_3px_rgba(28,58,19,0.10)] active:translate-y-0 active:bg-primary-active active:shadow-none dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.45)]",
      },
      {
        look: "solid",
        tone: "danger",
        class: "bg-danger text-danger-foreground hover:bg-danger/90",
      },

      /* ── soft ───────────────────────────────────────────────────── */
      {
        look: "soft",
        tone: "primary",
        class: "bg-accent-soft text-primary",
      },
      {
        look: "soft",
        tone: "neutral",
        class: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
      {
        look: "soft",
        tone: "danger",
        class: "bg-danger/10 text-danger hover:bg-danger/15",
      },

      /* ── outline ────────────────────────────────────────────────── */
      {
        look: "outline",
        tone: "primary",
        class:
          "border-primary bg-transparent font-semibold text-primary hover:bg-primary/5 active:scale-[0.98] dark:border-accent dark:text-accent dark:hover:bg-accent/10",
      },
      {
        look: "outline",
        tone: "neutral",
        class:
          "border-input bg-background text-foreground hover:border-muted-foreground hover:bg-muted hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] active:bg-border/50",
      },
      {
        look: "outline",
        tone: "danger",
        class: "border-danger/50 bg-transparent text-danger hover:bg-danger/10",
      },

      /* ── ghost ──────────────────────────────────────────────────── */
      {
        look: "ghost",
        tone: "primary",
        class: "text-primary hover:bg-foreground/5 dark:text-accent",
      },
      {
        look: "ghost",
        tone: "neutral",
        class:
          "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      },
      {
        look: "ghost",
        tone: "danger",
        class: "text-danger hover:bg-danger/10",
      },

      /* ── link ───────────────────────────────────────────────────── */
      {
        look: "link",
        tone: "primary",
        class: "text-primary underline-offset-4 hover:underline",
      },
    ],
    defaultVariants: {
      look: "solid",
      tone: "primary",
      size: "md",
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
    "look",
    "tone",
    "size",
    "class",
  ]);
  return (
    <ButtonPrimitive.Root
      class={cn(
        buttonVariants({
          look: local.look,
          tone: local.tone,
          size: local.size,
        }),
        local.class
      )}
      {...others}
    />
  );
};
