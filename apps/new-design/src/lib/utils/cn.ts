import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "primary",
        "primary-foreground",
        "primary-hover",
        "primary-active",
        "primary-light",
        "accent",
        "accent-2",
        "accent-foreground",
        "surface",
        "surface-gray",
        "cream",
        "border",
        "border-light",
        "text",
        "text-secondary",
        "text-muted",
      ],
      radius: ["xs", "sm", "lg", "xl"],
      // tailwind-merge's font-size text validator reads from theme key 'text'
      // (not 'font-size'). Registering our semantic tokens here so they're
      // classified as font-sizes, not text-colors — otherwise text-body-sm
      // conflicts with text-primary and one gets stripped.
      text: [
        "caption-sm",
        "caption",
        "body-sm",
        "body",
        "body-lg",
        "subheading",
        "heading-sm",
        "heading",
        "heading-lg",
        "display",
      ],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
