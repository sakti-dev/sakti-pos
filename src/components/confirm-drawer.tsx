import type { Component } from "solid-js";
import { Show } from "solid-js";

import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "~/components/ui/drawer";
import { cn } from "~/lib/utils";

interface ConfirmDrawerProps {
  class?: string;
  confirmLabel?: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  variant?: "destructive" | "default";
}

const ConfirmDrawer: Component<ConfirmDrawerProps> = (props) => (
  <Show when={props.open}>
    <Drawer
      closeOnEscapeKeyDown={false}
      closeOnOutsideFocus={false}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
      open={props.open}
      trapFocus={false}
    >
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent class={cn("px-4 pb-6", props.class)}>
          <DrawerTitle>{props.title}</DrawerTitle>
          <p class="mt-3 mb-6 text-muted-foreground text-sm">{props.message}</p>
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
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  </Show>
);

export { ConfirmDrawer };
