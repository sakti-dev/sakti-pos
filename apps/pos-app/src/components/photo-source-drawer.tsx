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

interface PhotoSourceDrawerProps {
  onOpenChange: (open: boolean) => void;
  onPickCamera: () => void;
  onPickGallery: () => void;
  open: boolean;
}

export const PhotoSourceDrawer: Component<PhotoSourceDrawerProps> = (props) => (
  <Show when={props.open}>
    <Drawer
      closeOnEscapeKeyDown={false}
      closeOnOutsideFocus={false}
      modal={false}
      onOpenChange={(open) => {
        props.onOpenChange(open);
      }}
      open={props.open}
      trapFocus={false}
    >
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Pilih Foto</DrawerTitle>
          </DrawerHeader>
          <p class="mb-4 text-muted-foreground text-sm">
            Ambil foto baru atau pilih dari galeri.
          </p>
          <div class="flex flex-col gap-2">
            <Button
              class="justify-start"
              onClick={() => {
                props.onOpenChange(false);
                props.onPickCamera();
              }}
              variant="outline"
            >
              Ambil Foto
            </Button>
            <Button
              class="justify-start"
              onClick={() => {
                props.onOpenChange(false);
                props.onPickGallery();
              }}
              variant="outline"
            >
              Pilih dari Galeri
            </Button>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  </Show>
);
