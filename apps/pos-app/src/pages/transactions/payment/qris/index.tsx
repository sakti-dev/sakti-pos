import { useNavigate } from "@solidjs/router";
import {
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { BellIcon, CheckCircleIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import { getPaymentSettings } from "~/db/payment-settings";
import { toDynamic } from "~/lib/qris";
import {
  type EventMatch,
  endPaymentSession,
  evaluateEvents,
  eventKey,
  getSessionAnchor,
  isNotificationAccessGranted,
  newestMatch,
  paymentEvents,
  refreshPaymentEvents,
} from "~/lib/qris/detection";
import * as sale from "~/lib/sales/sale-session";
import { cn, createLogger, formatRupiah } from "~/lib/utils";
import type { PayMethod } from "../components/payment-method";
import { QRisQR } from "../components/qris-qr";

const logger = createLogger({ domain: "QRIS", module: "pay-screen" });

const EVENT_POLL_INTERVAL_MS = 1500;

const formatEventTime = (postTimeMillis: number): string =>
  new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(postTimeMillis));

export default function QrisPayScreen() {
  const navigate = useNavigate();
  const cart = sale.getCart;
  const total = () => sale.totals().total;
  const [settings] = createResource(getPaymentSettings);
  const [granted, setGranted] = createSignal<boolean | null>(null);
  const [selectedKey, setSelectedKey] = createSignal<string | null>(null);
  const [committing, setCommitting] = createSignal(false);
  const [commitError, setCommitError] = createSignal(false);

  const method = () => sale.getPayment().method as PayMethod;

  const payload = () => {
    const base = settings()?.qrisStaticPayload ?? null;
    if (!base) {
      return null;
    }
    if (method() === "qris_dynamic") {
      if (!Number.isInteger(total()) || total() <= 0) {
        return null;
      }
      return toDynamic(base, total());
    }
    return base;
  };

  onMount(() => {
    refreshPaymentEvents();
    isNotificationAccessGranted()
      .then(setGranted)
      .catch(() => setGranted(null));
    const timer = window.setInterval(() => {
      refreshPaymentEvents();
      isNotificationAccessGranted()
        .then(setGranted)
        .catch(() => undefined);
    }, EVENT_POLL_INTERVAL_MS);
    onCleanup(() => window.clearInterval(timer));
  });

  const matches = createMemo(() =>
    evaluateEvents(paymentEvents(), total(), getSessionAnchor())
  );
  const newest = createMemo(() => newestMatch(matches()));
  const selected = createMemo(() => {
    const newestEvent = newest();
    const key =
      selectedKey() ?? (newestEvent ? eventKey(newestEvent.event) : null);
    if (!key) {
      return null;
    }
    return matches().find((match) => eventKey(match.event) === key) ?? null;
  });
  const isSelected = (match: EventMatch) => {
    const current = selected();
    return (
      current !== null && eventKey(current.event) === eventKey(match.event)
    );
  };
  const armed = () => selected()?.status === "match";

  const confirmPayment = async (source: "detected" | "manual") => {
    if (committing() || cart().length === 0) {
      return;
    }
    setCommitting(true);
    setCommitError(false);
    try {
      const order = await sale.commit();
      logger.info("PAYMENT_CONFIRMED", { source, total: total() });
      endPaymentSession();
      navigate("/transactions/receipt", {
        replace: true,
        state: { orderId: order.id },
      });
    } catch (error) {
      logger.error("COMMIT_FAILED", String(error));
      setCommitError(true);
      setCommitting(false);
    }
  };

  return (
    <SubPageShell
      backHref="/transactions/payment"
      data-ssgoi-transition="/transactions/payment/qris"
      title="QRIS"
    >
      <div class="flex flex-1 flex-col items-center gap-5 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24">
        <div class="text-center">
          <p class="text-caption text-muted-foreground uppercase tracking-wider">
            Total tagihan
          </p>
          <p class="font-extrabold text-heading tabular-nums tracking-tight">
            {formatRupiah(total())}
          </p>
        </div>

        <div class="grid w-full max-w-sm place-items-center rounded-lg border-2 border-border bg-white p-4">
          <QRisQR payload={payload()} width={288} />
        </div>

        <p class="max-w-sm text-center text-body-sm text-faint-foreground">
          <Show
            fallback="Minta pelanggan pindai QRIS Anda, lalu konfirmasi setelah dibayar."
            when={method() === "qris_dynamic"}
          >
            Total sudah tersemat di QR — pelanggan cukup pindai dan bayar.
          </Show>
        </p>

        <Show
          fallback={
            <div class="flex w-full max-w-sm items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3">
              <BellIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p class="text-caption text-muted-foreground">
                Notifikasi tidak dipantau. Aktifkan di Pengaturan → Deteksi
                Pembayaran, atau konfirmasi manual di bawah.
              </p>
            </div>
          }
          when={granted() !== false}
        >
          <p class="flex items-center gap-2 text-caption text-muted-foreground">
            <span class="relative flex size-2">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span class="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Menunggu pembayaran…
          </p>
        </Show>

        <Show when={matches().length > 0}>
          <div class="w-full max-w-sm">
            <p class="mb-2 font-medium text-caption text-muted-foreground uppercase tracking-wider">
              Notifikasi masuk
            </p>
            <ul class="space-y-1.5">
              <For each={[...matches()].reverse()}>
                {(match) => (
                  <li>
                    <Show
                      fallback={
                        <div
                          class={cn(
                            "flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
                            match.status === "mismatch"
                              ? "border-status-warning/40 bg-status-warning/10"
                              : "border-border bg-muted/40"
                          )}
                        >
                          <div class="min-w-0">
                            <p class="truncate font-medium text-body-sm text-foreground">
                              {match.event.appLabel}
                            </p>
                            <p class="text-caption text-muted-foreground">
                              {formatEventTime(match.event.postTimeMillis)}
                            </p>
                          </div>
                          <div class="text-right">
                            <p class="font-semibold text-body-sm text-foreground tabular-nums">
                              {formatRupiah(match.event.amountRupiah)}
                            </p>
                            <p class="text-caption text-muted-foreground">
                              {match.status === "mismatch"
                                ? "tidak cocok"
                                : "sebelum sesi ini"}
                            </p>
                          </div>
                        </div>
                      }
                      when={match.status === "match"}
                    >
                      <button
                        class={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors",
                          isSelected(match)
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card"
                        )}
                        onClick={() => setSelectedKey(eventKey(match.event))}
                        type="button"
                      >
                        <div class="min-w-0">
                          <p class="truncate font-medium text-body-sm text-foreground">
                            {match.event.appLabel}
                          </p>
                          <p class="text-caption text-muted-foreground">
                            {formatEventTime(match.event.postTimeMillis)}
                          </p>
                        </div>
                        <span class="flex items-center gap-2">
                          <span class="font-semibold text-body-sm text-foreground tabular-nums">
                            {formatRupiah(match.event.amountRupiah)}
                          </span>
                          <CheckCircleIcon class="size-5 text-primary" />
                        </span>
                      </button>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>

        <Show when={commitError()}>
          <p class="text-body-sm text-danger">
            Gagal menyimpan transaksi. Coba lagi.
          </p>
        </Show>

        <div class="mt-auto flex w-full max-w-sm flex-col gap-2">
          <Button
            class="h-14 w-full rounded-md font-bold text-body"
            disabled={!armed() || committing()}
            onClick={() => confirmPayment("detected")}
            size="xl"
            type="button"
          >
            <Show
              fallback="Menunggu pembayaran terdeteksi…"
              keyed
              when={selected()}
            >
              {(sel) =>
                sel.status === "match"
                  ? `Konfirmasi — terdeteksi ${formatRupiah(sel.event.amountRupiah)}`
                  : "Menunggu pembayaran terdeteksi…"
              }
            </Show>
          </Button>
          <Button
            class="h-12 w-full rounded-md font-semibold text-body-sm"
            disabled={committing()}
            look="outline"
            onClick={() => confirmPayment("manual")}
            tone="neutral"
            type="button"
          >
            Sudah Dibayar
          </Button>
        </div>
      </div>
    </SubPageShell>
  );
}
