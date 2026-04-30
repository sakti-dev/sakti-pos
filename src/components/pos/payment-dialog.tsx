import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/ui/drawer";
import { cartItems, cartTotal } from "~/lib/cart";
import { cn, formatIDR } from "~/lib/utils";

type PaymentMethod = "cash" | "qris";

interface PaymentDialogProps {
  onClose: () => void;
  onConfirm: (data: {
    amountPaid: number | null;
    changeAmount: number | null;
    paymentMethod: PaymentMethod;
  }) => void;
  open: boolean;
}

const PaymentDialog: Component<PaymentDialogProps> = (props) => {
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
    "00",
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
        <DrawerContent class="max-h-[95vh]">
          <DrawerTitle>Pembayaran</DrawerTitle>
          <div class="flex-1 overflow-y-auto px-4">
            <div class="space-y-1 py-2">
              <For each={cartItems()}>
                {(item) => (
                  <div class="flex justify-between text-sm">
                    <span class="truncate">
                      {item.product.name} ×{item.quantity}
                    </span>
                    <span class="shrink-0 font-medium">
                      {formatIDR(item.product.price * item.quantity)}
                    </span>
                  </div>
                )}
              </For>
            </div>

            <div class="border-border border-t py-3">
              <div class="flex justify-between font-bold">
                <span>Total</span>
                <span class="text-primary">{formatIDR(cartTotal())}</span>
              </div>
            </div>

            <div class="flex gap-2 py-3">
              <button
                class={cn(
                  "flex-1 rounded-lg py-2.5 font-medium text-sm transition-colors",
                  paymentMethod() === "cash"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
                onClick={() => setPaymentMethod("cash")}
                type="button"
              >
                Tunai
              </button>
              <button
                class={cn(
                  "flex-1 rounded-lg py-2.5 font-medium text-sm transition-colors",
                  paymentMethod() === "qris"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
                onClick={() => setPaymentMethod("qris")}
                type="button"
              >
                QRIS
              </button>
            </div>

            <Show when={paymentMethod() === "cash"}>
              <div class="space-y-2 pb-3">
                <div class="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2">
                  <span class="text-muted-foreground text-sm">Dibayar</span>
                  <span class="font-bold text-lg">
                    {amountInput() ? formatIDR(Number(amountInput())) : "Rp 0"}
                  </span>
                </div>
                <div class="grid grid-cols-3 gap-1.5">
                  <For each={numpadKeys}>
                    {(key) => (
                      <button
                        class="flex h-12 items-center justify-center rounded-lg bg-card font-mono text-lg active:bg-accent"
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
                <Show when={changeAmount() >= 0}>
                  <div class="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                    <span class="text-sm">Kembalian</span>
                    <span class="font-bold text-primary">
                      {formatIDR(changeAmount())}
                    </span>
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          <div class="flex gap-2 border-border border-t p-4">
            <Button class="flex-1" onClick={props.onClose} variant="outline">
              Batal
            </Button>
            <Button
              class="flex-1"
              disabled={!isValid()}
              onClick={handleConfirm}
            >
              Konfirmasi
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </Show>
  );
};

export type { PaymentMethod };
export { PaymentDialog };
