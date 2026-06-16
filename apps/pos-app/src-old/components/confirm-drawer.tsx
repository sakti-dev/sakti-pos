import type { Component } from "solid-js";
import { Show } from "solid-js";

import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "~/components/ui/drawer";

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

export const ConfirmDrawer: Component<ConfirmDrawerProps> = (props) => (
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
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{props.title}</DrawerTitle>
          </DrawerHeader>
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
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  </Show>
);
