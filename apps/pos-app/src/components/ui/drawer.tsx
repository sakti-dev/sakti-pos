import CorvuDrawer from "@corvu/drawer";
import type { JSX } from "solid-js";
import { cn } from "~/lib/utils";

// ── Root ─────────────────────────────────────────────────────────

export type DrawerSide = "bottom" | "left" | "right" | "top";

export interface DrawerRootProps {
  readonly children: (props: { close: () => void }) => JSX.Element;
  readonly class?: string;
  readonly initialOpen?: boolean;
  readonly modal?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly side?: DrawerSide;
  readonly trigger?: JSX.Element;
}

const sidePosition: Record<DrawerSide, string> = {
  bottom: "inset-x-0 bottom-0 rounded-t-lg max-h-[85vh]",
  top: "inset-x-0 top-0 rounded-b-lg max-h-[85vh]",
  left: "inset-y-0 left-0 rounded-r-lg max-w-[85vw]",
  right: "inset-y-0 right-0 rounded-l-lg max-w-[85vw]",
};

export const DrawerRoot = (props: DrawerRootProps) => {
  const close = () => props.onOpenChange?.(false);

  return (
    <CorvuDrawer
      breakPoints={[0.5]}
      initialOpen={props.initialOpen}
      modal={props.modal ?? true}
      onOpenChange={props.onOpenChange}
      open={props.open}
      side={props.side ?? "bottom"}
      snapPoints={[0, 1]}
    >
      {(api) => (
        <>
          {props.trigger}
          <CorvuDrawer.Portal>
            <CorvuDrawer.Overlay
              class="fixed inset-0 z-70 data-transitioning:transition-colors data-transitioning:duration-300 data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{
                "background-color": `rgb(0 0 0 / ${0.4 * api.openPercentage})`,
              }}
            />
            <CorvuDrawer.Content
              class={cn(
                "fixed z-70 flex flex-col bg-card shadow-card data-transitioning:transition-transform data-transitioning:duration-300 data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)]",
                sidePosition[props.side ?? "bottom"],
                props.class
              )}
            >
              <div class="mx-auto mt-2.5 h-1 w-9 shrink-0 cursor-grab rounded-full bg-border active:cursor-grabbing" />
              {props.children({ close })}
            </CorvuDrawer.Content>
          </CorvuDrawer.Portal>
        </>
      )}
    </CorvuDrawer>
  );
};

// ── Trigger ──────────────────────────────────────────────────────

export const DrawerTrigger = CorvuDrawer.Trigger;
export const DrawerClose = CorvuDrawer.Close;

// ── Header ───────────────────────────────────────────────────────

export interface DrawerHeaderProps {
  readonly children: JSX.Element;
  readonly class?: string;
}

export const DrawerHeader = (props: DrawerHeaderProps) => (
  <div class={cn("border-border border-b px-5 pt-1.5 pb-3.5", props.class)}>
    {props.children}
  </div>
);

// ── Title ────────────────────────────────────────────────────────

export interface DrawerTitleProps {
  readonly children: JSX.Element;
  readonly class?: string;
}

export const DrawerTitle = (props: DrawerTitleProps) => (
  <span class={cn("font-bold text-[16px] text-foreground", props.class)}>
    {props.children}
  </span>
);

// ── Body ─────────────────────────────────────────────────────────

export interface DrawerBodyProps {
  readonly children: JSX.Element;
  readonly class?: string;
}

export const DrawerBody = (props: DrawerBodyProps) => (
  <div
    class={cn("scrollbar-none flex-1 overflow-y-auto px-5 py-3", props.class)}
  >
    {props.children}
  </div>
);

// ── Footer ───────────────────────────────────────────────────────

export interface DrawerFooterProps {
  readonly children: JSX.Element;
  readonly class?: string;
}

export const DrawerFooter = (props: DrawerFooterProps) => (
  <div class={cn("shrink-0 border-border border-t px-5 py-4", props.class)}>
    {props.children}
  </div>
);

// ── Re-exported corvu primitives ──

export const DrawerLabel = CorvuDrawer.Label;
export const DrawerDescription = CorvuDrawer.Description;
