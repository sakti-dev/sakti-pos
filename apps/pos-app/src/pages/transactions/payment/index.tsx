import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createResource,
  createSignal,
  onMount,
  Show,
} from "solid-js";
import { CheckCircleIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import { getPaymentSettings } from "~/db/payment-settings";
import { beginPaymentSession } from "~/lib/qris/detection";
import * as sale from "~/lib/sales/sale-session";
import { createLogger } from "~/lib/utils";
import { OrderSummary } from "./components/order-summary";
import { PaymentExtras } from "./components/payment-extras";
import type { PayMethod } from "./components/payment-method";
import { PaymentMethod } from "./components/payment-method";
import { TotalBanner } from "./components/total-banner";

const paymentLogger = createLogger({ domain: "POS", module: "payment" });

export default function PaymentPage() {
  const navigate = useNavigate();
  const cart = sale.getCart;
  const [method, setMethod] = createSignal<PayMethod>("cash");
  const [cashRaw, setCashRaw] = createSignal("");
  const [selectedQuick, setSelectedQuick] = createSignal<number | null>(null);
  const [customer, setCustomer] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [settings] = createResource(getPaymentSettings);

  onMount(() => {
    beginPaymentSession();
  });

  const totals = sale.totals;
  const subtotal = () => totals().subtotal;
  const serviceCharge = () => totals().serviceCharge;
  const servicePercent = () => Math.round(totals().serviceChargeRate * 100);
  const tax = () => totals().tax;
  const taxPercent = () => Math.round(totals().taxRate * 100);
  const total = () => totals().total;
  const totalQty = () => cart().reduce((s, i) => s + i.qty, 0);
  const cashNum = () => Number.parseInt(cashRaw() || "0", 10) || 0;

  const qrisPayload = () => settings()?.qrisStaticPayload ?? null;
  const availableMethods = (): readonly PayMethod[] => {
    const methods: PayMethod[] = ["cash"];
    const payload = qrisPayload();
    if (payload && settings()?.qrisStatisEnabled) {
      methods.push("qris_static");
    }
    if (payload && settings()?.qrisDinamisEnabled) {
      methods.push("qris_dynamic");
    }
    return methods;
  };

  createEffect(() => {
    if (!availableMethods().includes(method())) {
      setMethod("cash");
    }
  });

  const canConfirm = () =>
    cart().length > 0 &&
    (method() === "cash" ? cashNum() >= total() && cashNum() > 0 : true);

  const isQris = () =>
    method() === "qris_static" || method() === "qris_dynamic";
  const confirmLabel = () =>
    method() === "cash" ? "Konfirmasi Pembayaran" : "Tampilkan QR";

  const [committing, setCommitting] = createSignal(false);
  const [commitError, setCommitError] = createSignal(false);

  const confirmPayment = async () => {
    if (!canConfirm() || committing()) {
      return;
    }
    sale.setPayment({
      method: method(),
      cashTendered: method() === "cash" ? cashNum() : undefined,
      customerName: customer() || undefined,
      notes: notes() || undefined,
    });
    if (isQris()) {
      paymentLogger.info("QRIS_FLOW_OPEN_PAY_SCREEN", { method: method() });
      navigate("/transactions/payment/qris");
      return;
    }
    setCommitting(true);
    setCommitError(false);
    try {
      const order = await sale.commit();
      navigate("/transactions/receipt", {
        replace: true,
        state: { orderId: order.id },
      });
    } catch (error) {
      paymentLogger.error("COMMIT_FAILED", { error: String(error) });
      setCommitError(true);
      setCommitting(false);
    }
  };

  const adjustQty = (productId: string, delta: number) => {
    if (delta >= 0) {
      sale.increment(productId);
    } else {
      sale.decrement(productId);
    }
  };

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
            serviceCharge={serviceCharge()}
            servicePercent={servicePercent()}
            subtotal={subtotal()}
            tax={tax()}
            taxPercent={taxPercent()}
            total={total()}
            totalQty={totalQty()}
          />

          <div class="order-1 flex flex-none flex-col gap-4 overflow-y-visible lg:order-2 lg:flex-1">
            <TotalBanner
              subtotal={subtotal()}
              tax={tax()}
              taxPercent={taxPercent()}
              total={total()}
            />
            <div class="scrollbar-none flex flex-col gap-4 lg:flex-1 lg:overflow-y-auto">
              <PaymentMethod
                availableMethods={availableMethods()}
                cashRaw={cashRaw()}
                method={method()}
                onCashRawChange={setCashRaw}
                onConfirm={confirmPayment}
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

              <Show when={commitError()}>
                <p class="text-body-sm text-danger">
                  Gagal menyimpan transaksi. Coba lagi.
                </p>
              </Show>
            </div>

            {/* Landscape: button pinned to the column bottom, always visible */}
            <div class="hidden shrink-0 lg:block">
              <Button
                class="h-14 w-full rounded-md font-bold text-body shadow-card disabled:opacity-40 dark:disabled:shadow-none"
                disabled={!canConfirm() || committing()}
                onClick={confirmPayment}
                size="xl"
                type="button"
              >
                <CheckCircleIcon class="h-5 w-5" />
                {confirmLabel()}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: fixed bottom button */}
      <div class="fixed inset-x-0 bottom-0 z-60 border-border border-t bg-card p-3 pb-3 sm:block lg:hidden lg:p-4 lg:pb-4">
        <Button
          class="h-14 w-full rounded-md font-bold text-body shadow-card disabled:opacity-40 dark:disabled:shadow-none"
          disabled={!canConfirm() || committing()}
          onClick={confirmPayment}
          size="xl"
          type="button"
        >
          <CheckCircleIcon class="h-5 w-5" />
          {confirmLabel()}
        </Button>
      </div>
    </SubPageShell>
  );
}
