import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { cn } from "~/lib/utils";

import { Button } from "./button";

interface BottomSheetProps {
  children: JSX.Element;
  class?: string;
  onClose: () => void;
  open: boolean;
}

export function BottomSheet(props: BottomSheetProps) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-end justify-center">
        <button
          class="fixed inset-0 bg-black/50"
          onClick={props.onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              props.onClose();
            }
          }}
          type="button"
        />
        <div
          class={cn(
            "relative w-full max-w-lg animate-content-show rounded-t-2xl border-border border-t bg-card p-6",
            props.class
          )}
          role="dialog"
        >
          {props.children}
        </div>
      </div>
    </Show>
  );
}

interface ConfirmBottomSheetProps {
  confirmLabel?: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  variant?: "destructive" | "default";
}

export function ConfirmBottomSheet(props: ConfirmBottomSheetProps) {
  return (
    <BottomSheet onClose={props.onClose} open={props.open}>
      <h3 class="mb-2 font-semibold text-base">{props.title}</h3>
      <p class="mb-6 text-muted-foreground text-sm">{props.message}</p>
      <div class="flex gap-2">
        <Button class="flex-1" onClick={props.onClose} variant="outline">
          Batal
        </Button>
        <Button
          class="flex-1"
          onClick={() => {
            props.onConfirm();
            props.onClose();
          }}
          variant={props.variant ?? "destructive"}
        >
          {props.confirmLabel ?? "Hapus"}
        </Button>
      </div>
    </BottomSheet>
  );
}
