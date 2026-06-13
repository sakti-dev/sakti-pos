import Drawer from "@corvu/drawer";
import type { JSX } from "solid-js";
import { cn } from "~/lib/utils";

export type SheetSide = "bottom" | "top" | "left" | "right";

export interface SheetProps {
  readonly children: (props: { close: () => void }) => JSX.Element;
  readonly class?: string;
  readonly initialOpen?: boolean;
  readonly modal?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly side?: SheetSide;
  readonly trigger?: JSX.Element;
}

const sidePosition: Record<SheetSide, string> = {
  bottom: "inset-x-0 bottom-0 rounded-t-lg max-h-[85vh]",
  top: "inset-x-0 top-0 rounded-b-lg max-h-[85vh]",
  left: "inset-y-0 left-0 rounded-r-lg max-w-[85vw]",
  right: "inset-y-0 right-0 rounded-l-lg max-w-[85vw]",
};

export const Sheet = (props: SheetProps) => {
  const close = () => props.onOpenChange?.(false);

  return (
    <Drawer
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
          <Drawer.Portal>
            <Drawer.Overlay
              class="fixed inset-0 z-[200] data-transitioning:transition-colors data-transitioning:duration-300 data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{
                "background-color": `rgb(0 0 0 / ${0.4 * api.openPercentage})`,
              }}
            />
            <Drawer.Content
              class={cn(
                "fixed z-[200] flex flex-col bg-card shadow-card data-transitioning:transition-transform data-transitioning:duration-300 data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)]",
                sidePosition[props.side ?? "bottom"],
                props.class
              )}
            >
              {/* Drag handle */}
              <div class="mx-auto mt-2.5 h-1 w-9 shrink-0 cursor-grab rounded-full bg-border active:cursor-grabbing" />
              {props.children({ close })}
            </Drawer.Content>
          </Drawer.Portal>
        </>
      )}
    </Drawer>
  );
};

/* ── Compound sub-components ── */

export interface SheetHeaderProps {
  readonly children: JSX.Element;
  readonly class?: string;
}

export const SheetHeader = (props: SheetHeaderProps) => (
  <div
    class={cn(
      "border-border border-b px-5 pt-1.5 pb-3.5",
      props.class
    )}
  >
    {props.children}
  </div>
);

export interface SheetTitleProps {
  readonly children: JSX.Element;
  readonly class?: string;
}

export const SheetTitle = (props: SheetTitleProps) => (
  <span
    class={cn(
      "font-bold text-[16px] text-foreground",
      props.class
    )}
  >
    {props.children}
  </span>
);

export interface SheetBodyProps {
  readonly children: JSX.Element;
  readonly class?: string;
}

export const SheetBody = (props: SheetBodyProps) => (
  <div
    class={cn("scrollbar-none flex-1 overflow-y-auto px-5 py-3", props.class)}
  >
    {props.children}
  </div>
);

export interface SheetFooterProps {
  readonly children: JSX.Element;
  readonly class?: string;
}

export const SheetFooter = (props: SheetFooterProps) => (
  <div
    class={cn(
      "shrink-0 border-border border-t px-5 py-4",
      props.class
    )}
  >
    {props.children}
  </div>
);

/* ── Re-exported corvu primitives ── */

export const SheetTrigger = Drawer.Trigger;
export const SheetClose = Drawer.Close;
export const SheetLabel = Drawer.Label;
export const SheetDescription = Drawer.Description;
