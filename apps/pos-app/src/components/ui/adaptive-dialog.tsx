import CorvuDialog from "@corvu/dialog";
import Drawer from "@corvu/drawer";
import type { ComponentProps, JSX } from "solid-js";
import { Show, splitProps } from "solid-js";

import { XCloseIcon } from "~/assets";
import { useBreakpoints } from "~/lib/breakpoints";
import { cn } from "~/lib/utils";

// ── Root ─────────────────────────────────────────────────────────
// Swaps between corvu Dialog (tablet+) and Drawer (mobile).
// Drawer internally renders Dialog.Root, so Dialog.* sub-components
// work inside both.

interface AdaptiveDialogProps {
  breakPoints?: (number | null)[];
  children: JSX.Element;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  snapPoints?: number[];
}

function AdaptiveDialog(props: AdaptiveDialogProps) {
  const breakpoints = useBreakpoints();

  return (
    <Show
      fallback={
        <Drawer
          breakPoints={props.breakPoints}
          onOpenChange={props.onOpenChange}
          open={props.open}
          side="bottom"
          snapPoints={props.snapPoints ?? [0, 1]}
        >
          {props.children}
        </Drawer>
      }
      when={breakpoints.md}
    >
      <CorvuDialog onOpenChange={props.onOpenChange} open={props.open}>
        {props.children}
      </CorvuDialog>
    </Show>
  );
}

// ── Trigger ──────────────────────────────────────────────────────
// SHARED: Dialog.Trigger works inside both Dialog and Drawer
// (Drawer provides Dialog context internally).

function AdaptiveDialogTrigger(
  props: ComponentProps<typeof CorvuDialog.Trigger>
) {
  return <CorvuDialog.Trigger {...props} />;
}

// ── Content ──────────────────────────────────────────────────────
// SWAPS: Dialog.Content (centered) vs Drawer.Content (bottom sheet)

interface AdaptiveDialogContentProps {
  children?: JSX.Element;
  class?: string;
}

function AdaptiveDialogContent(props: AdaptiveDialogContentProps) {
  const breakpoints = useBreakpoints();
  const isTablet = () => breakpoints.md;

  return (
    <Show
      fallback={
        // ── Sheet mode (Drawer) ──
        <Drawer.Portal>
          <Drawer.Overlay class="fixed inset-0 z-70 bg-background/80 backdrop-blur-sm data-transitioning:transition-opacity data-transitioning:duration-standard data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)]" />
          <Drawer.Content class="safe-pb fixed inset-x-0 bottom-0 z-70 flex max-h-[85dvh] w-full flex-col gap-4 overflow-hidden rounded-t-lg border-2 border-border bg-card px-3 pt-1.5 pb-3 shadow-card data-transitioning:transition-transform data-transitioning:duration-standard data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)] sm:px-6 sm:pb-6">
            <div class="mx-auto h-1 w-9 shrink-0 cursor-grab rounded-full bg-border active:cursor-grabbing" />
            {props.children}
          </Drawer.Content>
        </Drawer.Portal>
      }
      when={isTablet()}
    >
      {/* ── Dialog mode (centered) ── */}
      <CorvuDialog.Portal>
        <CorvuDialog.Overlay class="fixed inset-0 z-70 bg-background/80 backdrop-blur-sm transition-opacity duration-standard ease-standard data-[closed]:opacity-0 data-[open]:opacity-100" />
        <CorvuDialog.Content
          class={cn(
            "fixed top-1/2 left-1/2 z-70 grid max-h-dvh w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border-2 border-border bg-background p-6 shadow-card transition-all duration-standard ease-standard data-[closed]:scale-95 data-[open]:scale-100 data-[closed]:opacity-0 data-[open]:opacity-100",
            props.class
          )}
        >
          {props.children}
          <CorvuDialog.Close
            aria-label="Close"
            class="absolute top-4 right-4 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <XCloseIcon class="size-4" />
            <span class="sr-only">Close</span>
          </CorvuDialog.Close>
        </CorvuDialog.Content>
      </CorvuDialog.Portal>
    </Show>
  );
}

// ── Header (plain div, same in both modes) ───────────────────────

function AdaptiveDialogHeader(props: ComponentProps<"div">) {
  const [, rest] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(
        "-mt-1.5 flex flex-col gap-1.5 text-center md:text-left",
        props.class
      )}
      {...rest}
    />
  );
}

// ── Footer (plain div, same in both modes) ───────────────────────

function AdaptiveDialogFooter(props: ComponentProps<"div">) {
  const [, rest] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(
        "flex flex-col-reverse gap-2 md:flex-row md:justify-end",
        props.class
      )}
      {...rest}
    />
  );
}

// ── Title ────────────────────────────────────────────────────────
// SHARED: Dialog.Label works inside both Dialog and Drawer.

function AdaptiveDialogTitle(
  props: ComponentProps<(typeof CorvuDialog)["Label"]>
) {
  const [, rest] = splitProps(props, ["class"]);
  return (
    <CorvuDialog.Label
      class={cn(
        "font-display font-semibold text-foreground text-subheading",
        props.class
      )}
      {...rest}
    />
  );
}

// ── Description ──────────────────────────────────────────────────
// SHARED: Dialog.Description works inside both Dialog and Drawer.

function AdaptiveDialogDescription(
  props: ComponentProps<(typeof CorvuDialog)["Description"]>
) {
  const [, rest] = splitProps(props, ["class"]);
  return (
    <CorvuDialog.Description
      class={cn("text-body-sm text-muted-foreground", props.class)}
      {...rest}
    />
  );
}

export {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
};
