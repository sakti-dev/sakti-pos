import { useNavigate } from "@solidjs/router";
import { createSignal } from "solid-js";
import { CheckCircleIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import { samplePaymentCart } from "~/lib/data/transactions";
import { type OrderItem, OrderSummary } from "./components/order-summary";
import { PaymentExtras } from "./components/payment-extras";
import type { PayMethod } from "./components/payment-method";
import { PaymentMethod } from "./components/payment-method";
import { TotalBanner } from "./components/total-banner";

export default function PaymentPage() {
  const navigate = useNavigate();
  const [cart, setCart] = createSignal<OrderItem[]>(samplePaymentCart);
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
    navigate("/transactions/receipt", {
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
      backHref="/transactions/cash-register"
      data-ssgoi-transition="/transactions/payment"
      title="Pembayaran"
    >
      <div class="flex flex-1 overflow-hidden">
        <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-3 pb-24 sm:gap-4 sm:p-4 sm:pb-24 lg:flex-row lg:gap-5 lg:p-5">
          <OrderSummary
            items={cart()}
            onAdjustQty={adjustQty}
            subtotal={subtotal()}
            tax={tax()}
            total={total()}
            totalQty={totalQty()}
          />

          <div class="scrollbar-none order-1 flex flex-none flex-col gap-4 overflow-y-visible lg:order-2 lg:flex-1 lg:overflow-y-auto">
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
            <div class="hidden shrink-0 pt-1 lg:block">
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
      <div class="fixed inset-x-0 bottom-0 z-60 border-border border-t bg-card p-3 pb-3 sm:block lg:hidden lg:p-4 lg:pb-4">
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
