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
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
