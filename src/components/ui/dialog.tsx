import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { cn } from "~/lib/utils";

import { Button } from "./button";

interface DialogProps {
  children: JSX.Element;
  class?: string;
  onClose: () => void;
  open: boolean;
  title: string;
}

export function Dialog(props: DialogProps) {
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      props.onClose();
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        role="none"
      >
        <div
          class={cn(
            "w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg",
            props.class
          )}
        >
          <h2 class="mb-4 font-semibold text-lg">{props.title}</h2>
          {props.children}
        </div>
      </div>
    </Show>
  );
}

interface DialogFooterProps {
  children: JSX.Element;
}

export function DialogFooter(props: DialogFooterProps) {
  return <div class="mt-6 flex justify-end gap-2">{props.children}</div>;
}

interface ConfirmDialogProps {
  confirmLabel?: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  variant?: "destructive" | "default";
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Dialog onClose={props.onClose} open={props.open} title={props.title}>
      <p class="text-muted-foreground text-sm">{props.message}</p>
      <DialogFooter>
        <Button onClick={props.onClose} variant="outline">
          Batal
        </Button>
        <Button
          onClick={() => {
            props.onConfirm();
            props.onClose();
          }}
          variant={props.variant ?? "destructive"}
        >
          {props.confirmLabel ?? "Hapus"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
