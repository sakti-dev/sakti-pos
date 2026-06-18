import CorvuDialog from "@corvu/dialog";
import type { ComponentProps, JSX } from "solid-js";
import { createMemo, splitProps } from "solid-js";

import { XCloseIcon } from "~/assets";
import { useDismissibleVisibility } from "~/lib/dismissible-stack";
import { cn } from "~/lib/utils";

// ── Root ─────────────────────────────────────────────────────────

interface DialogProps {
  children: JSX.Element;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

function Dialog(props: DialogProps) {
  return (
    <CorvuDialog onOpenChange={props.onOpenChange} open={props.open}>
      {props.children}
    </CorvuDialog>
  );
}

// ── Trigger ──────────────────────────────────────────────────────

function DialogTrigger(props: ComponentProps<typeof CorvuDialog.Trigger>) {
  return <CorvuDialog.Trigger {...props} />;
}

// ── Content ──────────────────────────────────────────────────────

interface DialogContentProps {
  children?: JSX.Element;
  class?: string;
}

function DialogContent(props: DialogContentProps) {
  const dialogCtx = CorvuDialog.useContext();
  const dialogId = () => dialogCtx.dialogId();
  const { isTopmost, show, hide } = useDismissibleVisibility(dialogId());

  createMemo(() => {
    if (dialogCtx.open()) {
      show();
    } else {
      hide();
    }
  });

  const overlayDimmed = () =>
    isTopmost() ? "" : "bg-transparent backdrop-blur-none";

  const contentDimmed = () =>
    isTopmost()
      ? ""
      : "opacity-0 pointer-events-none transition-opacity duration-200";

  return (
    <CorvuDialog.Portal>
      <CorvuDialog.Overlay
        class={cn(
          "fixed inset-0 z-70 bg-background/80 backdrop-blur-sm transition-opacity duration-standard ease-standard data-[closed]:opacity-0 data-[open]:opacity-100",
          overlayDimmed()
        )}
      />
      <CorvuDialog.Content
        class={cn(
          "fixed top-1/2 left-1/2 z-70 grid max-h-dvh w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border-2 border-border bg-background p-6 shadow-card transition-all duration-standard ease-standard data-[closed]:scale-95 data-[open]:scale-100 data-[closed]:opacity-0 data-[open]:opacity-100",
          props.class,
          contentDimmed()
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
  );
}

// ── Header ───────────────────────────────────────────────────────

function DialogHeader(props: ComponentProps<"div">) {
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

// ── Footer ───────────────────────────────────────────────────────

function DialogFooter(props: ComponentProps<"div">) {
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

function DialogTitle(props: ComponentProps<(typeof CorvuDialog)["Label"]>) {
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

function DialogDescription(
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
