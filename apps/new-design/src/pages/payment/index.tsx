import { useNavigate } from "@solidjs/router";
import { createSignal } from "solid-js";
import { CheckCircleIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import { type OrderItem, OrderSummary } from "./components/order-summary";
import { PaymentExtras } from "./components/payment-extras";
import type { PayMethod } from "./components/payment-method";
import { PaymentMethod } from "./components/payment-method";
import { TotalBanner } from "./components/total-banner";

const sampleCart: OrderItem[] = [
  {
    id: 1,
    name: "Es Kopi Susu",
    desc: "Minuman",
    price: 18_000,
    qty: 2,
    img: 237,
  },
  {
    id: 4,
    name: "Cappuccino",
    desc: "Minuman",
    price: 25_000,
    qty: 1,
    img: 225,
  },
  {
    id: 9,
    name: "Nasi Goreng Spesial",
    desc: "Makanan",
    price: 32_000,
    qty: 1,
    img: 292,
  },
  {
    id: 16,
    name: "Kentang Goreng",
    desc: "Snack",
    price: 20_000,
    qty: 2,
    img: 312,
  },
  {
    id: 21,
    name: "Es Krim Vanilla",
    desc: "Dessert",
    price: 15_000,
    qty: 1,
    img: 291,
  },
];

export default function Payment() {
  const navigate = useNavigate();
  const [cart, setCart] = createSignal<OrderItem[]>(sampleCart);
  const [method, setMethod] = createSignal<PayMethod>("cash");
  const [cashRaw, setCashRaw] = createSignal("");
  const [selectedQuick, setSelectedQuick] = createSignal<number | null>(null);
  const [ewallet, setEwallet] = createSignal("GoPay");
  const [customer, setCustomer] = createSignal("");
  const [notes, setNotes] = createSignal("");

  const subtotal = () => cart().reduce((s, i) => s + i.price * i.qty, 0);
  const tax = () => Math.round(subtotal() * 0.11);
  const total = () => subtotal() + tax();
  const totalQty = () => cart().reduce((s, i) => s + i.qty, 0);
  const cashNum = () => Number.parseInt(cashRaw() || "0", 10) || 0;
  const canConfirm = () =>
    method() === "cash" ? cashNum() >= total() && cashNum() > 0 : true;

  const confirmPayment = () => {
    if (!canConfirm()) {
      return;
    }
    navigate("/receipt", {
      replace: true,
      state: {
        items: cart(),
        method: method(),
        paid: method() === "cash" ? cashNum() : total(),
        subtotal: subtotal(),
        tax: tax(),
        total: total(),
      },
    });
  };

  const adjustQty = (id: number, delta: number) =>
    setCart((prev) => {
      const updated = prev.map((i) =>
        i.id === id ? { ...i, qty: i.qty + delta } : i
      );
      return updated.filter((i) => i.qty > 0);
    });

  return (
    <SubPageShell
      backHref="/transaction-new"
      data-ssgoi-transition="/payment"
      title="Pembayaran"
    >
      <div class="flex flex-1 overflow-hidden">
        <div class="flex flex-1 gap-5 overflow-y-auto p-5 max-[900px]:flex-col max-[600px]:gap-3 max-[900px]:gap-4 max-[600px]:p-3 max-[900px]:p-4 max-[600px]:pb-24 max-[900px]:pb-24">
          <OrderSummary
            items={cart()}
            onAdjustQty={adjustQty}
            subtotal={subtotal()}
            tax={tax()}
            total={total()}
            totalQty={totalQty()}
          />

          <div class="scrollbar-none flex flex-1 flex-col gap-4 overflow-y-auto max-[900px]:order-1 max-[900px]:flex-none max-[900px]:overflow-y-visible">
            <TotalBanner subtotal={subtotal()} tax={tax()} total={total()} />
            <PaymentMethod
              cashRaw={cashRaw()}
              ewallet={ewallet()}
              method={method()}
              onCashRawChange={setCashRaw}
              onConfirm={confirmPayment}
              onEwalletChange={setEwallet}
              onMethodChange={setMethod}
              onSelectedQuickChange={setSelectedQuick}
              selectedQuick={selectedQuick()}
              subtotal={subtotal()}
              tax={tax()}
              total={total()}
            />

            <PaymentExtras
              customer={customer()}
              notes={notes()}
              onCustomerChange={setCustomer}
              onNotesChange={setNotes}
            />

            {/* Desktop: inline button */}
            <div class="shrink-0 pt-1 max-[900px]:hidden">
              <Button
                class="h-14 w-full rounded-md font-bold text-body shadow-card disabled:opacity-40 dark:disabled:shadow-none"
                disabled={!canConfirm()}
                onClick={confirmPayment}
                size="xl"
                type="button"
              >
                <CheckCircleIcon class="h-5 w-5" />
                Konfirmasi Pembayaran
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: fixed bottom button */}
      <div class="fixed inset-x-0 bottom-0 z-[100] hidden border-border border-t bg-card p-4 pb-4 max-[900px]:block max-[600px]:p-3 max-[600px]:pb-3">
        <Button
          class="h-14 w-full rounded-md font-bold text-body shadow-card disabled:opacity-40 dark:disabled:shadow-none"
          disabled={!canConfirm()}
          onClick={confirmPayment}
          size="xl"
          type="button"
        >
          <CheckCircleIcon class="h-5 w-5" />
          Konfirmasi Pembayaran
        </Button>
      </div>
    </SubPageShell>
  );
}
