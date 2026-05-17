import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { cn, formatIDR } from "~/lib/utils";
import { cartItems, cartTotal } from "~/store/cart";

type PaymentMethod = "cash" | "qris";

interface PaymentDialogProps {
  loading?: boolean;
  onClose: () => void;
  onConfirm: (data: {
    amountPaid: number | null;
    changeAmount: number | null;
    paymentMethod: PaymentMethod;
  }) => void;
  open: boolean;
}

const PaymentDrawer: Component<PaymentDialogProps> = (props) => {
  const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod>("cash");
  const [amountInput, setAmountInput] = createSignal("");

  const changeAmount = createMemo(() => {
    const paid = Number(amountInput());
    const total = cartTotal();
    if (Number.isNaN(paid) || paid < total) {
      return -1;
    }
    return paid - total;
  });

  const isValid = createMemo(() => {
    if (paymentMethod() === "qris") {
      return true;
    }
    const paid = Number(amountInput());
    return !Number.isNaN(paid) && paid >= cartTotal();
  });

  const handleConfirm = () => {
    const method = paymentMethod();
    if (method === "cash") {
      const paid = Number(amountInput());
      props.onConfirm({
        amountPaid: paid,
        changeAmount: paid - cartTotal(),
        paymentMethod: "cash",
      });
    } else {
      props.onConfirm({
        amountPaid: cartTotal(),
        changeAmount: 0,
        paymentMethod: "qris",
      });
    }
  };

  const appendDigit = (d: string) => {
    const current = amountInput();
    if (current === "0") {
      setAmountInput(d);
    } else {
      setAmountInput(current + d);
    }
  };

  const deleteLast = () => {
    const current = amountInput();
    if (current.length <= 1) {
      setAmountInput("");
    } else {
      setAmountInput(current.slice(0, -1));
    }
  };

  const numpadKeys = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "000",
    "0",
    "del",
  ];

  return (
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
        <DrawerContent class="max-h-[80dvh] px-4">
          <DrawerHeader>
            <DrawerTitle class="landscape:py-1">Pembayaran</DrawerTitle>
          </DrawerHeader>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <div class="mt-2 space-y-1 border-y py-2 landscape:hidden">
              <For each={cartItems()}>
                {(item) => (
                  <div class="flex justify-between text-sm">
                    <span class="truncate">
                      {item.product.name} ×{item.quantity}
                    </span>
                    <span class="shrink-0 font-medium">
                      {formatIDR(item.product.priceMinorUnits * item.quantity)}
                    </span>
                  </div>
                )}
              </For>
            </div>

            <div class="py-1 landscape:py-0.5">
              <div class="flex justify-between font-bold landscape:text-sm">
                <span>Total</span>
                <span class="text-primary">{formatIDR(cartTotal())}</span>
              </div>
            </div>

            <div class="flex gap-3 py-2 landscape:gap-2 landscape:py-1">
              <button
                class={cn(
                  "flex flex-1 items-center justify-center rounded-xl py-3 font-semibold transition-colors landscape:py-1.5 landscape:text-sm",
                  paymentMethod() === "cash"
                    ? "bg-primary text-primary-foreground"
                    : "border bg-card text-muted-foreground"
                )}
                onClick={() => setPaymentMethod("cash")}
                type="button"
              >
                Tunai
              </button>
              <button
                class={cn(
                  "flex flex-1 items-center justify-center rounded-xl py-3 font-semibold transition-colors landscape:py-1.5 landscape:text-sm",
                  paymentMethod() === "qris"
                    ? "bg-primary text-primary-foreground"
                    : "border bg-card text-muted-foreground"
                )}
                onClick={() => setPaymentMethod("qris")}
                type="button"
              >
                QRIS
              </button>
            </div>

            <Show when={paymentMethod() === "cash"}>
              <div class="space-y-1 pb-2 landscape:pb-1">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground text-sm landscape:text-xs">
                      Dibayar
                    </span>
                    <span class="font-bold text-lg text-primary landscape:text-sm">
                      {amountInput()
                        ? formatIDR(Number(amountInput()))
                        : "Rp 0"}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-sm landscape:text-xs">Kembalian</span>
                    <span
                      class={cn(
                        "font-bold text-lg landscape:text-sm",
                        changeAmount() >= 0 && "text-destructive"
                      )}
                    >
                      {changeAmount() >= 0 ? formatIDR(changeAmount()) : "-"}
                    </span>
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-1.5 pt-1 landscape:gap-1">
                  <For each={numpadKeys}>
                    {(key) => (
                      <button
                        class="flex h-12 items-center justify-center rounded-lg border bg-card font-mono text-lg active:bg-accent landscape:h-9 landscape:text-base"
                        onClick={() =>
                          key === "del" ? deleteLast() : appendDigit(key)
                        }
                        type="button"
                      >
                        {key === "del" ? "⌫" : key}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>

          <div class="flex shrink-0 gap-2 border-t p-4 landscape:p-2">
            <Button class="flex-1" onClick={props.onClose} variant="outline">
              Batal
            </Button>
            <Button
              class="flex-1"
              disabled={!isValid() || (props.loading ?? false)}
              onClick={handleConfirm}
            >
              {props.loading ? "Memproses..." : "Konfirmasi"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </Show>
  );
};

export type { PaymentMethod };
export { PaymentDrawer as PaymentDialog };
