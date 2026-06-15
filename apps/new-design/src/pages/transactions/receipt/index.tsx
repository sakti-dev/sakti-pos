import { useLocation, useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { toast } from "solid-sonner";
import {
  BanknoteIcon,
  CheckCircleIcon,
  CreditCardIcon,
  HomeIcon,
  PrinterIcon,
  QrCodeIcon,
  ShareIcon,
  WalletIcon,
} from "~/assets";
import { Button } from "~/components/ui/button";
import { sampleReceiptItems } from "~/lib/data/transactions";
import { cn, formatRupiah } from "~/lib/utils";

const BARCODE_PATTERN = [
  2, 1, 3, 1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 2, 1, 1, 3, 2,
  1, 1, 2, 3, 1, 2, 1, 3, 1, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 3, 1,
] as const;

const METHOD_META: Record<
  string,
  { Icon: typeof BanknoteIcon; label: string }
> = {
  cash: { Icon: BanknoteIcon, label: "Tunai" },
  qris: { Icon: QrCodeIcon, label: "QRIS" },
  card: { Icon: CreditCardIcon, label: "Kartu" },
  ewallet: { Icon: WalletIcon, label: "E-Wallet" },
};

/* ── sample data ── */

const now = new Date();
const days = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;
const months = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
const txNum = `TX-${String(Math.floor(Math.random() * 900_000) + 100_000)}`;

const sampleSubtotal = sampleReceiptItems.reduce(
  (s, i) => s + i.price * i.qty,
  0
);
const sampleTax = Math.round(sampleSubtotal * 0.11);
const sampleTotal = sampleSubtotal + sampleTax;

const secondaryActionClass =
  "h-[52px] rounded-md border-2 border-border bg-card font-semibold text-body text-foreground tracking-wide hover:border-primary/20 hover:bg-primary/5";

/* ── component ───────────────────────────────────────────────── */

export default function Receipt() {
  const navigate = useNavigate();
  const loc = useLocation();

  const state = loc.state as
    | {
        items: readonly {
          name: string;
          desc: string;
          price: number;
          qty: number;
        }[];
        method: string;
        paid: number;
        subtotal: number;
        tax: number;
        total: number;
      }
    | undefined;

  const items = state?.items ?? sampleReceiptItems;
  const method = state?.method ?? "cash";
  const subtotal = state?.subtotal ?? sampleSubtotal;
  const tax = state?.tax ?? sampleTax;
  const total = state?.total ?? sampleTotal;
  const paid = state?.paid ?? total;
  const change = paid - total;

  const meta = METHOD_META[method] ?? METHOD_META.cash;
  return (
    <div
      class="flex min-h-screen flex-col bg-muted font-sans text-foreground antialiased"
      data-ssgoi-transition="/transactions/receipt"
    >
      {/* Scrollable receipt content */}
      <div class="scrollbar-none flex flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-4 pt-5 pb-48 sm:px-5 sm:pt-8 sm:pb-44">
        {/* Success banner */}
        <div class="mb-7 flex animate-[fadeDown_0.5s_cubic-bezier(0.34,1.56,0.64,1)] flex-col items-center gap-3">
          <div class="relative grid h-[72px] w-[72px] place-items-center rounded-full bg-accent-soft text-primary">
            <CheckCircleIcon class="h-9 w-9" />
            <div class="absolute inset-[-6px] rounded-full border-2 border-primary/10" />
          </div>
          <div class="font-display font-extrabold text-foreground text-heading-sm">
            Pembayaran Berhasil!
          </div>
          <div class="text-body-sm text-muted-foreground tracking-wide">
            {dateStr} · {timeStr}
          </div>
        </div>

        {/* Receipt card */}
        <div class="relative w-full max-w-[480px] animate-[fadeUp_0.6s_cubic-bezier(0.34,1.56,0.64,1)_0.15s_both] rounded-lg border border-border/50 bg-card">
          {/* Glow */}
          <div class="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-accent-soft opacity-25 blur-[50px]" />

          {/* Header */}
          <div class="flex items-center justify-between border-border border-b border-dashed px-4 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
            <div class="flex items-center gap-3">
              <div class="grid h-10 w-10 place-items-center overflow-hidden rounded-md bg-primary/5">
                <img
                  alt="Nata POS"
                  class="h-full w-full object-contain"
                  height={40}
                  src="/logo.png"
                  width={40}
                />
              </div>
              <div>
                <div class="font-bold font-display text-body-lg text-foreground">
                  Nata POS
                </div>
                <div class="mt-0.5 text-caption text-muted-foreground tracking-wide">
                  Tantri Cafe
                </div>
              </div>
            </div>
            <div class="rounded-full bg-muted px-2.5 py-1 font-semibold text-caption-sm text-muted-foreground uppercase tracking-wider">
              {txNum}
            </div>
          </div>

          {/* Meta */}
          <div class="flex justify-between border-border/50 border-b px-4 py-3 sm:px-6 sm:py-4">
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-caption-sm text-muted-foreground uppercase tracking-wider">
                Tanggal
              </span>
              <span class="font-medium text-body-sm text-foreground">
                {dateStr}
              </span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-caption-sm text-muted-foreground uppercase tracking-wider">
                Waktu
              </span>
              <span class="font-medium text-body-sm text-foreground">
                {timeStr}
              </span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-caption-sm text-muted-foreground uppercase tracking-wider">
                Kasir
              </span>
              <span class="font-medium text-body-sm text-foreground">
                Yos Bb
              </span>
            </div>
          </div>

          {/* Items */}
          <div class="px-4 py-3 sm:px-6 sm:py-4">
            <For each={[...items]}>
              {(item, i) => (
                <div
                  class={cn(
                    "flex justify-between py-2",
                    i() < items.length - 1 && "border-border/50 border-b"
                  )}
                >
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-body-sm text-foreground">
                      {item.name}
                    </div>
                    <div class="mt-0.5 text-caption text-muted-foreground tracking-wide">
                      {item.desc}
                    </div>
                  </div>
                  <div class="ml-4 shrink-0 text-right">
                    <div class="font-semibold text-body-sm text-foreground tabular-nums tracking-snug">
                      {formatRupiah(item.price * item.qty)}
                    </div>
                    <div class="mt-px text-caption-sm text-muted-foreground">
                      {item.qty} × {formatRupiah(item.price)}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Totals */}
          <div class="border-border border-t border-dashed px-4 pt-4 pb-5 sm:px-6">
            <div class="flex justify-between py-1">
              <span class="text-body-sm text-muted-foreground tracking-wide">
                Subtotal
              </span>
              <span class="font-medium text-body-sm text-foreground tabular-nums">
                {formatRupiah(subtotal)}
              </span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-body-sm text-muted-foreground tracking-wide">
                Pajak (11%)
              </span>
              <span class="font-medium text-body-sm text-foreground tabular-nums">
                {formatRupiah(tax)}
              </span>
            </div>
            <div class="my-2.5 h-px bg-border" />
            <div class="flex items-baseline justify-between">
              <span class="font-bold text-body text-foreground">Total</span>
              <span class="font-extrabold text-heading-sm text-primary tabular-nums tracking-tight dark:text-accent">
                {formatRupiah(total)}
              </span>
            </div>
          </div>

          {/* Payment method */}
          <div class="flex justify-between border-border border-t border-dashed px-4 pt-4 pb-5 sm:px-6">
            <span class="text-body-sm text-muted-foreground tracking-wide">
              Metode
            </span>
            <span class="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 font-semibold text-caption text-primary tracking-wide">
              <meta.Icon class="h-3.5 w-3.5" />
              {meta.label}
            </span>
          </div>

          {/* Paid section */}
          <div class="px-4 pb-4 sm:px-6">
            <div class="w-full">
              <Show
                fallback={
                  <div class="flex w-full justify-between py-1">
                    <span class="text-body-sm text-muted-foreground tracking-wide">
                      Dibayar
                    </span>
                    <span class="font-semibold text-body-sm text-foreground tabular-nums">
                      {formatRupiah(total)}
                    </span>
                  </div>
                }
                when={method === "cash"}
              >
                <div class="flex w-full justify-between py-1">
                  <span class="text-body-sm text-muted-foreground tracking-wide">
                    Dibayar
                  </span>
                  <span class="font-semibold text-body-sm text-foreground tabular-nums">
                    {formatRupiah(paid)}
                  </span>
                </div>
                <div class="flex w-full justify-between py-1">
                  <span class="text-body-sm text-muted-foreground tracking-wide">
                    Kembalian
                  </span>
                  <span class="font-semibold text-body-sm text-status-success tabular-nums">
                    {formatRupiah(Math.max(0, change))}
                  </span>
                </div>
              </Show>
            </div>
          </div>

          {/* Footer */}
          <div class="border-border border-t border-dashed px-4 pt-4 pb-5 text-center sm:px-6">
            <div class="text-caption text-muted-foreground leading-relaxed tracking-wide">
              Terima kasih atas kunjungan Anda!
              <br />
              Jl. Banda No.30, Citarum, Bandung
            </div>
            {/* Barcode */}
            <div class="mx-auto mt-3 flex w-fit justify-center gap-0.5">
              <For each={[...BARCODE_PATTERN]}>
                {(w) => (
                  <div
                    class={cn(
                      "h-8 rounded-[1px] bg-foreground dark:bg-foreground dark:opacity-50",
                      w > 1 ? "w-[2px]" : "w-px"
                    )}
                  />
                )}
              </For>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom action bar */}
      <div class="fixed inset-x-0 bottom-0 z-[100] mx-auto flex max-w-[520px] animate-[fadeUp_0.5s_cubic-bezier(0.34,1.56,0.64,1)_0.4s_both] flex-col gap-2.5 border-border border-t bg-muted p-4 sm:flex-row sm:gap-2.5 sm:p-3">
        <div class="grid grid-cols-2 gap-2.5 sm:flex">
          <Button
            class={secondaryActionClass}
            look="outline"
            onClick={() => toast.info("Mencetak struk\u2026")}
            tone="neutral"
            type="button"
          >
            <PrinterIcon class="h-[18px] w-[18px]" />
            Cetak
          </Button>
          <Button
            class={secondaryActionClass}
            look="outline"
            onClick={() => toast.info("Membagikan struk\u2026")}
            tone="neutral"
            type="button"
          >
            <ShareIcon class="h-[18px] w-[18px]" />
            Bagikan
          </Button>
        </div>
        <Button
          class="h-[52px] w-full flex-1 rounded-md font-bold text-body tracking-wide shadow-card"
          onClick={() => navigate("/", { replace: true })}
          type="button"
        >
          <HomeIcon class="h-[18px] w-[18px]" />
          Beranda
        </Button>
      </div>
    </div>
  );
}
