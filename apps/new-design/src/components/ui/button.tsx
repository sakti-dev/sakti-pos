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
 * │ tone     │ primary | destructive | neutral                     │
 * │ size     │ xs | sm | md | lg | xl | icon | icon-sm | icon-xs   │
 * │          │ | none                                              │
 * └──────────┴──────────────────────────────────────────────────────┘
 *
 * Migration from old variants:
 *   default           → look="solid"  tone="primary"
 *   destructive       → look="solid"  tone="destructive"
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
  "inline-flex items-center gap-2 whitespace-nowrap rounded-sm font-medium font-sans text-sm transition-[background,border-color,box-shadow,transform] duration-standard ease-standard focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-50",
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
        destructive: "",
        neutral: "",
      },
      size: {
        xs: "h-8 justify-center px-2.5 text-xs",
        sm: "h-9 justify-center px-3 text-xs",
        md: "h-10 justify-center px-4 py-2",
        lg: "h-12 justify-center px-8",
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
          "bg-primary text-primary-foreground hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_4px_12px_rgba(9,73,51,0.25),0_1px_3px_rgba(9,73,51,0.10)] active:translate-y-0 active:bg-primary-active active:shadow-none dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.45)]",
      },
      {
        look: "solid",
        tone: "destructive",
        class:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },

      /* ── soft ───────────────────────────────────────────────────── */
      {
        look: "soft",
        tone: "primary",
        class:
          "bg-accent-2 text-primary dark:bg-[rgba(60,208,112,0.10)] dark:text-accent",
      },
      {
        look: "soft",
        tone: "neutral",
        class: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
      {
        look: "soft",
        tone: "destructive",
        class:
          "bg-[rgba(176,80,80,0.10)] text-[#b05050] hover:bg-[rgba(176,80,80,0.15)] dark:bg-[rgba(212,112,112,0.10)] dark:text-[#d47070] dark:hover:bg-[rgba(212,112,112,0.15)]",
      },

      /* ── outline ────────────────────────────────────────────────── */
      {
        look: "outline",
        tone: "primary",
        class:
          "border-primary bg-transparent font-semibold text-primary hover:bg-primary-light active:scale-[0.98] dark:border-accent dark:text-accent dark:hover:bg-[rgba(60,208,112,0.10)]",
      },
      {
        look: "outline",
        tone: "neutral",
        class:
          "border-input bg-background text-foreground hover:border-muted-foreground hover:bg-muted hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] active:bg-border-light",
      },
      {
        look: "outline",
        tone: "destructive",
        class:
          "border-destructive/50 bg-transparent text-destructive hover:bg-destructive/10",
      },

      /* ── ghost ──────────────────────────────────────────────────── */
      {
        look: "ghost",
        tone: "primary",
        class:
          "text-primary hover:bg-accent-2 dark:text-accent dark:hover:bg-[rgba(60,208,112,0.10)]",
      },
      {
        look: "ghost",
        tone: "neutral",
        class:
          "text-text-secondary hover:bg-[rgba(9,73,51,0.04)] hover:text-text dark:text-[#a0a0a0] dark:hover:bg-[rgba(255,255,255,0.05)] dark:hover:text-[#ededed]",
      },
      {
        look: "ghost",
        tone: "destructive",
        class:
          "text-[#b05050] hover:bg-[rgba(176,80,80,0.08)] hover:text-[#8b3030] dark:text-[#d47070] dark:hover:bg-[rgba(212,112,112,0.10)] dark:hover:text-[#e08080]",
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
