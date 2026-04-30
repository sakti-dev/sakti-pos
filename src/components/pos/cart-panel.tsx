import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "~/components/ui/drawer";
import {
  addToCart,
  cartCount,
  cartItems,
  cartTotal,
  clearCart,
  removeFromCart,
  updateQuantity,
} from "~/lib/cart";
import { formatIDR } from "~/lib/utils";

interface CartPanelProps {
  onPay: () => void;
}

const CartPanel: Component<CartPanelProps> = (props) => {
  const [showClearConfirm, setShowClearConfirm] = createSignal(false);
  const [drawerOpen, setDrawerOpen] = createSignal(false);

  return (
    <>
      <div class="border-border border-t bg-card">
        <Show
          fallback={
            <div class="flex items-center justify-center py-4 text-muted-foreground text-sm">
              Keranjang kosong
            </div>
          }
          when={cartCount() > 0}
        >
          <button
            class="flex w-full items-center justify-between px-4 py-3 active:bg-accent/80"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <span class="font-medium text-sm">{cartCount()} item</span>
            <span class="font-bold text-primary">{formatIDR(cartTotal())}</span>
          </button>
          <div class="flex gap-2 px-4 pb-4">
            <Button
              class="flex-1"
              onClick={() => setShowClearConfirm(true)}
              variant="outline"
            >
              Kosongkan
            </Button>
            <Button class="flex-1" onClick={props.onPay}>
              Bayar
            </Button>
          </div>
        </Show>
      </div>

      <Show when={drawerOpen()}>
        <Drawer
          closeOnEscapeKeyDown={false}
          closeOnOutsideFocus={false}
          modal={false}
          onOpenChange={(open) => {
            if (!open) {
              setDrawerOpen(false);
            }
          }}
          open={drawerOpen()}
          trapFocus={false}
        >
          <DrawerPortal>
            <DrawerOverlay />
            <DrawerContent class="max-h-[70vh]">
              <DrawerTitle>Keranjang</DrawerTitle>
              <div class="flex-1 overflow-y-auto px-4 pb-2">
                <For each={cartItems()}>
                  {(item) => (
                    <div class="flex items-center gap-3 border-border border-b py-3">
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-medium text-sm">
                          {item.product.name}
                        </p>
                        <p class="text-muted-foreground text-xs">
                          {formatIDR(item.product.price)} × {item.quantity} ={" "}
                          {formatIDR(item.product.price * item.quantity)}
                        </p>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <button
                          class="flex size-8 items-center justify-center rounded-lg bg-muted font-mono text-lg active:bg-accent"
                          onClick={() =>
                            item.quantity === 1
                              ? removeFromCart(item.product.id)
                              : updateQuantity(
                                  item.product.id,
                                  item.quantity - 1
                                )
                          }
                          type="button"
                        >
                          −
                        </button>
                        <span class="w-8 text-center font-medium text-sm">
                          {item.quantity}
                        </span>
                        <button
                          class="flex size-8 items-center justify-center rounded-lg bg-muted font-mono text-lg active:bg-accent"
                          onClick={() => addToCart(item.product)}
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
              <div class="border-border border-t px-4 py-3">
                <div class="flex items-center justify-between">
                  <span class="font-medium">Total</span>
                  <span class="font-bold text-lg text-primary">
                    {formatIDR(cartTotal())}
                  </span>
                </div>
              </div>
            </DrawerContent>
          </DrawerPortal>
        </Drawer>
      </Show>

      <ConfirmDrawer
        confirmLabel="Kosongkan"
        message="Semua item di keranjang akan dihapus."
        onClose={() => setShowClearConfirm(false)}
        onConfirm={clearCart}
        open={showClearConfirm()}
        title="Kosongkan Keranjang"
      />
    </>
  );
};

export { CartPanel };
