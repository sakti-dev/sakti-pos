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
import { formatRupiah } from "~/lib/utils";

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

/* ── sample data (matches reference) ─────────────────────────── */

const sampleItems = [
  { name: "Es Kopi Susu", desc: "Minuman", price: 18_000, qty: 2 },
  { name: "Cappuccino", desc: "Minuman", price: 25_000, qty: 1 },
  { name: "Nasi Goreng Spesial", desc: "Makanan", price: 32_000, qty: 1 },
  { name: "Kentang Goreng", desc: "Snack", price: 20_000, qty: 2 },
  { name: "Es Krim Vanilla", desc: "Dessert", price: 15_000, qty: 1 },
] as const;

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

const sampleSubtotal = sampleItems.reduce((s, i) => s + i.price * i.qty, 0);
const sampleTax = Math.round(sampleSubtotal * 0.11);
const sampleTotal = sampleSubtotal + sampleTax;

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

  const items = state?.items ?? sampleItems;
  const method = state?.method ?? "cash";
  const subtotal = state?.subtotal ?? sampleSubtotal;
  const tax = state?.tax ?? sampleTax;
  const total = state?.total ?? sampleTotal;
  const paid = state?.paid ?? total;
  const change = paid - total;

  const meta = METHOD_META[method] ?? METHOD_META.cash;
  return (
    <div class="flex min-h-screen flex-col bg-surface-gray font-sans text-text antialiased dark:bg-[#111]">
      {/* Scrollable receipt content */}
      <div class="scrollbar-none flex flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-5 pt-8 pb-44 max-[600px]:px-4 max-[600px]:pt-5 max-[600px]:pb-48">
        {/* Success banner */}
        <div class="mb-7 flex animate-[fadeDown_0.5s_cubic-bezier(0.34,1.56,0.64,1)] flex-col items-center gap-3">
          <div class="relative grid h-[72px] w-[72px] place-items-center rounded-full bg-accent-2 text-primary dark:bg-[rgba(60,208,112,0.12)] dark:text-[#3cd070]">
            <CheckCircleIcon class="h-9 w-9" />
            <div class="absolute inset-[-6px] rounded-full border-2 border-[rgba(9,73,51,0.08)]" />
          </div>
          <div class="font-extrabold text-[22px] text-text tracking-[-0.01em] dark:text-[#f0f0f0]">
            Pembayaran Berhasil!
          </div>
          <div class="text-[14px] text-text-secondary tracking-[0.02em] dark:text-[#a0a0a0]">
            {dateStr} · {timeStr}
          </div>
        </div>

        {/* Receipt card */}
        <div class="relative w-full max-w-[480px] animate-[fadeUp_0.6s_cubic-bezier(0.34,1.56,0.64,1)_0.15s_both] rounded-[18px] border border-border-light bg-surface dark:border-[#222] dark:bg-[#1a1a1a] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
          {/* Glow */}
          <div class="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-accent-2 opacity-25 blur-[50px] dark:bg-[rgba(60,208,112,0.08)]" />

          {/* Header */}
          <div class="flex items-center justify-between border-border border-b border-dashed px-6 pt-6 pb-5 max-[600px]:px-4 max-[600px]:pt-5 max-[600px]:pb-4">
            <div class="flex items-center gap-3">
              <div class="grid h-10 w-10 place-items-center overflow-hidden rounded-[10px] bg-[rgba(9,73,51,0.06)] dark:bg-[#2a2a2a]">
                <img
                  alt="Nata POS"
                  class="h-full w-full object-contain"
                  height={40}
                  src="/logo.png"
                  width={40}
                />
              </div>
              <div>
                <div class="font-bold text-[18px] text-text tracking-[-0.01em] dark:text-[#f0f0f0]">
                  Nata POS
                </div>
                <div class="mt-0.5 text-[12px] text-text-secondary tracking-[0.02em] dark:text-[#b0b0b0]">
                  Tantri Cafe
                </div>
              </div>
            </div>
            <div class="rounded-pill bg-surface-gray px-2.5 py-1 font-semibold text-[11px] text-text-muted uppercase tracking-[0.06em] dark:bg-[#222] dark:text-[#888]">
              {txNum}
            </div>
          </div>

          {/* Meta */}
          <div class="flex justify-between border-border-light border-b px-6 py-4 max-[600px]:px-4 max-[600px]:py-3">
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-[11px] text-text-muted uppercase tracking-[0.06em]">
                Tanggal
              </span>
              <span class="font-medium text-[13px] text-text tracking-[0.01em] dark:text-[#f0f0f0]">
                {dateStr}
              </span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-[11px] text-text-muted uppercase tracking-[0.06em]">
                Waktu
              </span>
              <span class="font-medium text-[13px] text-text tracking-[0.01em] dark:text-[#f0f0f0]">
                {timeStr}
              </span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-[11px] text-text-muted uppercase tracking-[0.06em]">
                Kasir
              </span>
              <span class="font-medium text-[13px] text-text tracking-[0.01em] dark:text-[#f0f0f0]">
                Yos Bb
              </span>
            </div>
          </div>

          {/* Items */}
          <div class="px-6 py-4 max-[600px]:px-4 max-[600px]:py-3">
            <For each={[...items]}>
              {(item, i) => (
                <div
                  class="flex justify-between py-2"
                  classList={{
                    "border-b border-border-light": i() < items.length - 1,
                  }}
                >
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-[14px] text-text tracking-[0.01em] dark:text-[#f0f0f0]">
                      {item.name}
                    </div>
                    <div class="mt-0.5 text-[12px] text-text-muted tracking-[0.02em] dark:text-[#737c77]">
                      {item.desc}
                    </div>
                  </div>
                  <div class="ml-4 shrink-0 text-right">
                    <div class="font-semibold text-[14px] text-text tabular-nums tracking-[-0.01em] dark:text-[#f0f0f0]">
                      {formatRupiah(item.price * item.qty)}
                    </div>
                    <div class="mt-px text-[11px] text-text-muted tracking-[0.02em] dark:text-[#737c77]">
                      {item.qty} × {formatRupiah(item.price)}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Totals */}
          <div class="border-border border-t border-dashed px-6 pt-4 pb-5 max-[600px]:px-4">
            <div class="flex justify-between py-1">
              <span class="text-[13px] text-text-secondary tracking-[0.02em] dark:text-[#a0a0a0]">
                Subtotal
              </span>
              <span class="font-medium text-[13px] text-text tabular-nums dark:text-[#f0f0f0]">
                {formatRupiah(subtotal)}
              </span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-[13px] text-text-secondary tracking-[0.02em] dark:text-[#a0a0a0]">
                Pajak (11%)
              </span>
              <span class="font-medium text-[13px] text-text tabular-nums dark:text-[#f0f0f0]">
                {formatRupiah(tax)}
              </span>
            </div>
            <div class="my-2.5 h-px bg-border dark:bg-[#2a2a2a]" />
            <div class="flex items-baseline justify-between">
              <span class="font-bold text-[16px] text-text dark:text-[#f0f0f0]">
                Total
              </span>
              <span class="font-extrabold text-[24px] text-primary tabular-nums tracking-[-0.02em] dark:text-primary">
                {formatRupiah(total)}
              </span>
            </div>
          </div>

          {/* Payment method */}
          <div class="flex justify-between border-border border-t border-dashed px-6 pt-4 pb-5 max-[600px]:px-4">
            <span class="text-[13px] text-text-secondary tracking-[0.02em] dark:text-[#a0a0a0]">
              Metode
            </span>
            <span class="inline-flex items-center gap-1.5 rounded-pill bg-accent-2 px-3 py-1 font-semibold text-[12px] text-primary tracking-[0.02em] dark:bg-[rgba(60,208,112,0.10)] dark:text-[#3cd070]">
              <meta.Icon class="h-3.5 w-3.5" />
              {meta.label}
            </span>
          </div>

          {/* Paid section */}
          <div class="px-6 pb-4 max-[600px]:px-4">
            <div class="w-full">
              <Show
                fallback={
                  <div class="flex w-full justify-between py-1">
                    <span class="text-[13px] text-text-secondary tracking-[0.02em] dark:text-[#a0a0a0]">
                      Dibayar
                    </span>
                    <span class="font-semibold text-[14px] text-text tabular-nums dark:text-[#f0f0f0]">
                      {formatRupiah(total)}
                    </span>
                  </div>
                }
                when={method === "cash"}
              >
                <div class="flex w-full justify-between py-1">
                  <span class="text-[13px] text-text-secondary tracking-[0.02em] dark:text-[#a0a0a0]">
                    Dibayar
                  </span>
                  <span class="font-semibold text-[14px] text-text tabular-nums dark:text-[#f0f0f0]">
                    {formatRupiah(paid)}
                  </span>
                </div>
                <div class="flex w-full justify-between py-1">
                  <span class="text-[13px] text-text-secondary tracking-[0.02em] dark:text-[#a0a0a0]">
                    Kembalian
                  </span>
                  <span class="font-semibold text-[14px] text-success tabular-nums dark:text-[#66bb6a]">
                    {formatRupiah(Math.max(0, change))}
                  </span>
                </div>
              </Show>
            </div>
          </div>

          {/* Footer */}
          <div class="border-border border-t border-dashed px-6 pt-4 pb-5 text-center max-[600px]:px-4">
            <div class="text-[12px] text-text-muted leading-relaxed tracking-[0.02em] dark:text-[#737c77]">
              Terima kasih atas kunjungan Anda!
              <br />
              Jl. Banda No.30, Citarum, Bandung
            </div>
            {/* Barcode */}
            <div class="mx-auto mt-3 flex w-fit justify-center gap-0.5">
              <For each={[...BARCODE_PATTERN]}>
                {(w) => (
                  <div
                    class="h-8 rounded-[1px] bg-text dark:bg-text dark:opacity-50"
                    classList={{ "w-[2px]": w > 1, "w-px": w === 1 }}
                  />
                )}
              </For>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom action bar */}
      <div class="fixed inset-x-0 bottom-0 z-[100] mx-auto flex max-w-[520px] animate-[fadeUp_0.5s_cubic-bezier(0.34,1.56,0.64,1)_0.4s_both] gap-2.5 border-border border-t bg-surface-gray p-3 max-[600px]:flex-col max-[600px]:gap-2.5 max-[600px]:p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
        <div class="flex gap-2.5 max-[600px]:grid max-[600px]:grid-cols-2">
          <Button
            class="h-[52px] rounded-[14px] border-2 border-border bg-surface font-semibold text-[15px] text-text tracking-[0.02em] hover:border-[rgba(9,73,51,0.20)] hover:bg-[rgba(9,73,51,0.06)] dark:border-[#333] dark:bg-[#1a1a1a] dark:text-[#ededed] dark:hover:border-[#444] dark:hover:bg-[#222]"
            onClick={() => toast.info("Mencetak struk\u2026")}
            type="button"
            variant="outline"
          >
            <PrinterIcon class="h-[18px] w-[18px]" />
            Cetak
          </Button>
          <Button
            class="h-[52px] rounded-[14px] border-2 border-border bg-surface font-semibold text-[15px] text-text tracking-[0.02em] hover:border-[rgba(9,73,51,0.20)] hover:bg-[rgba(9,73,51,0.06)] dark:border-[#333] dark:bg-[#1a1a1a] dark:text-[#ededed] dark:hover:border-[#444] dark:hover:bg-[#222]"
            onClick={() => toast.info("Membagikan struk\u2026")}
            type="button"
            variant="outline"
          >
            <ShareIcon class="h-[18px] w-[18px]" />
            Bagikan
          </Button>
        </div>
        <Button
          class="h-[52px] flex-1 rounded-[14px] font-bold text-[15px] tracking-[0.02em] shadow-[0_4px_16px_rgba(9,73,51,0.25),0_1px_3px_rgba(9,73,51,0.12)] max-[600px]:w-full dark:bg-[#e0e0e0] dark:text-[#1a1a1a] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.20)] dark:hover:bg-[#cccccc]"
          onClick={() => navigate("/")}
          type="button"
        >
          <HomeIcon class="h-[18px] w-[18px]" />
          Beranda
        </Button>
      </div>
    </div>
  );
}
