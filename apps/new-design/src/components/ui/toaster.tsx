import type { Component, ComponentProps } from "solid-js";

import { Toaster as Sonner } from "solid-sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

export const Toaster: Component<ToasterProps> = (props) => (
  <Sonner
    class="toaster group"
    duration={3000}
    offset="24px"
    position="bottom-right"
    toastOptions={{
      classes: {
        toast:
          "group toast group-[.toaster]:font-medium group-[.toaster]:text-[13px] group-[.toaster]:tracking-[0.01em] group-[.toaster]:rounded-sm group-[.toaster]:border-none group-[.toaster]:text-white group-[.toaster]:bg-primary group-[.toaster]:shadow-[0_8px_24px_rgba(0,0,0,0.15)]",
        error: "group-[.toaster]:!bg-destructive",
        description: "group-[.toast]:text-white/80",
        actionButton:
          "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
        cancelButton:
          "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
      },
    }}
    {...props}
  />
);
