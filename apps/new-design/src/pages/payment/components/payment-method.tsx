import type { Component } from "solid-js";
import { createEffect, For, Show } from "solid-js";
import {
  BanknoteIcon,
  CreditCardIcon,
  QrCodeIcon,
  WalletCardIcon,
} from "~/assets";
import { Button } from "~/components/ui/button";
import { Numpad } from "~/components/ui/numpad";
import { cn, formatRupiah } from "~/lib/utils";

const RE_ANDROID = /android/i;
/** Round `val` up to the next multiple of `step`. */
const ceilTo = (val: number, step: number) => Math.ceil(val / step) * step;

/** Seed cash suggestion tiers from a clean base (rounded up to nearest Rp1.000). */
const seedTiers = (base: number, add: (n: number) => void) => {
  add(base);
  if (base <= 10_000) {
    add(10_000);
    add(20_000);
    add(50_000);
  } else if (base <= 20_000) {
    add(20_000);
    add(50_000);
    add(100_000);
  } else if (base <= 50_000) {
    add(ceilTo(base, 5000));
    add(ceilTo(base, 10_000));
    add(50_000);
    add(100_000);
  } else if (base <= 100_000) {
    add(ceilTo(base, 5000));
    add(ceilTo(base, 10_000));
    add(100_000);
  } else {
    add(ceilTo(base, 5000));
    add(ceilTo(base, 10_000));
    add(ceilTo(base, 50_000));
    add(ceilTo(base, 100_000));
  }
};

/**
 * Generate 4 smart cash suggestions for Indonesian Rupiah.
 * Slot 1 is always the nearest Rp1.000 ceiling — no sub-1k amounts.
 */
const getSmartCashSuggestions = (total: number): number[] => {
  if (total <= 0) {
    return [0, 0, 0, 0];
  }

  // Cash minimum: round up to nearest Rp1.000 (sub-1k coins are unrealistic)
  const baseCash = ceilTo(total, 1000);

  const seen: Record<number, true> = {};
  seedTiers(baseCash, (n) => {
    seen[n] = true;
  });

  let result = Object.keys(seen)
    .map(Number)
    .filter((a) => a >= baseCash)
    .sort((a, b) => a - b);

  if (result.length > 4) {
    result = result.slice(0, 4);
  }

  while (result.length < 4) {
    const last = result.at(-1) ?? baseCash;
    let step = 10_000;
    if (baseCash >= 40_000 && baseCash < 100_000) {
      step = 50_000;
    }
    if (baseCash >= 100_000) {
      step = 100_000;
    }
    result.push(ceilTo(last + 1, step));
  }

  return result;
};
export type PayMethod = "cash" | "qris" | "card" | "ewallet";

const methodOptions: readonly {
  key: PayMethod;
  Icon: Component<{ class?: string }>;
  label: string;
}[] = [
  { key: "cash", Icon: BanknoteIcon, label: "Tunai" },
  { key: "qris", Icon: QrCodeIcon, label: "QRIS" },
  { key: "card", Icon: CreditCardIcon, label: "Kartu" },
  { key: "ewallet", Icon: WalletCardIcon, label: "E-Wallet" },
] as const;

const ewallets = ["GoPay", "OVO", "DANA", "ShopeePay"] as const;

interface PaymentMethodProps {
  readonly cashRaw: string;
  readonly ewallet: string;
  readonly method: PayMethod;
  readonly onCashRawChange: (v: string) => void;
  readonly onEwalletChange: (v: string) => void;
  readonly onMethodChange: (m: PayMethod) => void;
  readonly onSelectedQuickChange: (v: number | null) => void;
  readonly selectedQuick: number | null;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

export const PaymentMethod = (props: PaymentMethodProps) => {
  let inputRef: HTMLInputElement | undefined;
  // Track desired raw cursor position for next DOM write (set by numpad/quick-select)
  let pendingRawCursor: number | undefined;

  const cashNum = () => Number.parseInt(props.cashRaw || "0", 10) || 0;
  const change = () => cashNum() - props.total;

  const quickAmounts = () => getSmartCashSuggestions(props.total);

  /** Map a cursor position in formatted text → position in raw digit string. */
  const formattedToRawPos = (
    formatted: string,
    formatRupiahPos: number
  ): number => {
    let digits = 0;
    for (let i = 0; i < formatRupiahPos && i < formatted.length; i++) {
      if (formatted[i] >= "0" && formatted[i] <= "9") {
        digits++;
      }
    }
    return digits;
  };

  /** Map a position in raw digit string → cursor position in formatted text. */
  const rawToFormattedPos = (formatted: string, rawPos: number): number => {
    let digits = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (formatted[i] >= "0" && formatted[i] <= "9") {
        digits++;
        if (digits === rawPos) {
          return i + 1;
        }
      }
    }
    return formatted.length;
  };

  const handleNumpad = (key: string) => {
    if (!inputRef) {
      return;
    }
    const prev = props.cashRaw;
    const formatRupiahCursor = inputRef.selectionStart ?? inputRef.value.length;
    const rawCursor = formattedToRawPos(inputRef.value, formatRupiahCursor);

    let next: string;
    let newRawCursor: number;

    if (key === "back") {
      if (rawCursor === 0) {
        return;
      }
      next = prev.slice(0, rawCursor - 1) + prev.slice(rawCursor);
      newRawCursor = rawCursor - 1;
    } else if (key === "000") {
      if (prev.length + 3 > 12) {
        return;
      }
      next = `${prev.slice(0, rawCursor)}000${prev.slice(rawCursor)}`;
      newRawCursor = rawCursor + 3;
    } else {
      if (prev.length >= 12) {
        return;
      }
      next = prev.slice(0, rawCursor) + key + prev.slice(rawCursor);
      newRawCursor = rawCursor + 1;
    }

    pendingRawCursor = newRawCursor;
    props.onCashRawChange(next);
    props.onSelectedQuickChange(null);
  };

  const selectQuick = (amt: number) => {
    pendingRawCursor = undefined;
    props.onCashRawChange(String(amt));
    props.onSelectedQuickChange(amt);
  };

  const amountVariant = (amt: number) => {
    if (props.selectedQuick === amt) {
      return "pill-selected" as const;
    }
    if (amt === props.total) {
      return "pill-highlight" as const;
    }
    return "pill" as const;
  };

  return (
    <div class="rounded-[18px] border border-border-light bg-surface px-6 py-5 dark:border-border-light dark:bg-surface">
      <div class="mb-4 font-semibold text-[13px] text-text-secondary uppercase tracking-[0.06em]">
        Metode Pembayaran
      </div>

      {/* Method grid */}
      <div class="grid grid-cols-4 gap-2.5 max-[600px]:grid-cols-2">
        <For each={methodOptions}>
          {(m) => (
            <Button
              aria-label={m.label}
              class="flex-col gap-2.5 rounded-[10px] py-[18px] pb-3.5 [&>span]:text-current [&>svg]:size-7 [&>svg]:text-current"
              onClick={() => props.onMethodChange(m.key)}
              size="none"
              variant={props.method === m.key ? "card-active" : "card"}
            >
              <m.Icon class="transition-colors duration-200" />
              <span class="font-medium text-[13px] transition-colors duration-200">
                {m.label}
              </span>
            </Button>
          )}
        </For>
      </div>

      {/* Cash */}
      <Show when={props.method === "cash"}>
        <div class="mt-5">
          <div class="mb-3 grid grid-cols-4 gap-2 max-[600px]:grid-cols-2">
            <For each={quickAmounts()}>
              {(amt) => (
                <Button
                  aria-label={`Jumlah ${formatRupiah(amt)}`}
                  class="rounded-[10px] py-2.5 font-semibold text-[12px]"
                  onClick={() => selectQuick(amt)}
                  onPointerDown={(e) => e.preventDefault()}
                  variant={amountVariant(amt)}
                >
                  {formatRupiah(amt)}
                </Button>
              )}
            </For>
          </div>

          <div
            class={cn(
              "flex h-[72px] items-center justify-center gap-2 rounded-[10px] border-2 border-border bg-surface-gray px-5 transition-[border-color,background] duration-150 dark:border-border dark:bg-surface",
              cashNum() > 0 &&
                "border-primary bg-surface dark:border-accent dark:bg-[#222]"
            )}
          >
            <span class="shrink-0 font-semibold text-[16px] text-text-secondary dark:text-text-muted">
              Rp
            </span>
            <input
              class="min-w-0 flex-1 bg-transparent text-center font-extrabold text-[28px] text-text tabular-nums tracking-[-0.02em] caret-color-primary placeholder:font-normal placeholder:text-[20px] placeholder:text-text-secondary focus:outline-none dark:text-text dark:caret-primary dark:placeholder:text-text-muted"
              maxLength={15}
              onBlur={() => {
                const raw = props.cashRaw.replace(/\D/g, "");
                if (raw !== props.cashRaw) {
                  props.onCashRawChange(raw);
                }
              }}
              onInput={(e) => {
                const raw = e.currentTarget.value.replace(/\D/g, "");
                props.onCashRawChange(raw);
                props.onSelectedQuickChange(null);
              }}
              placeholder="Masukkan jumlah"
              ref={(el) => {
                inputRef = el;
                // Suppress system keyboard on Tauri/Android only
                const isAndroid = RE_ANDROID.test(navigator.userAgent);
                if (isAndroid) {
                  el.inputMode = "none";
                  el.setAttribute("virtualKeyboardPolicy", "manual");
                  const vk = (
                    navigator as { virtualKeyboard?: { hide: () => void } }
                  ).virtualKeyboard;
                  el.addEventListener("focus", () => vk?.hide());
                }

                // Idempotent value sync: only write to DOM when formatted value actually changed.
                // This prevents Solid's reactive binding from resetting Chromium's caret blink timer.
                createEffect(() => {
                  const formatted =
                    cashNum() > 0 ? cashNum().toLocaleString("id-ID") : "";
                  const domValue = el.value;
                  if (domValue === formatted) {
                    return;
                  }
                  el.value = formatted;
                  if (pendingRawCursor === undefined) {
                    const len = formatted.length;
                    el.setSelectionRange(len, len);
                  } else {
                    const formatRupiahPos = rawToFormattedPos(
                      formatted,
                      pendingRawCursor
                    );
                    el.setSelectionRange(formatRupiahPos, formatRupiahPos);
                  }
                  pendingRawCursor = undefined;
                });
              }}
              type="text"
              value=""
            />
          </div>

          <Numpad class="mt-3" onKey={handleNumpad} />

          <Show when={cashNum() > 0 && change() >= 0}>
            <div class="mt-4 flex items-center justify-between rounded-[10px] border border-[rgba(9,73,51,0.08)] bg-accent-2 px-5 py-4 dark:border-[rgba(60,208,112,0.10)] dark:bg-[rgba(60,208,112,0.06)]">
              <span class="font-medium text-[14px] text-text">Kembalian</span>
              <span
                class={cn(
                  "font-extrabold text-[20px] tabular-nums",
                  change() > 0
                    ? "text-primary dark:text-accent"
                    : "text-text-muted"
                )}
              >
                {formatRupiah(change())}
              </span>
            </div>
          </Show>
        </div>
      </Show>

      {/* QRIS */}
      <Show when={props.method === "qris"}>
        <div class="mt-5 flex flex-col items-center py-6">
          <div class="relative mb-4 grid h-[200px] w-[200px] place-items-center overflow-hidden rounded-[10px] border-[1.5px] border-border bg-surface dark:border-border dark:bg-[#222]">
            <div class="absolute inset-0 opacity-10 [background:repeating-conic-gradient(currentColor_0%_25%,transparent_0%_50%)_0_0/16px_16px,repeating-conic-gradient(currentColor_0%_25%,transparent_0%_50%)_80px_80px/16px_16px]" />
            <QrCodeIcon class="relative z-[1] h-16 w-16 text-text-muted dark:text-text-muted" />
            <div class="absolute grid h-11 w-11 place-items-center rounded-lg border-2 border-border bg-surface dark:border-[rgba(255,255,255,0.10)] dark:bg-surface">
              <QrCodeIcon class="h-6 w-6 text-primary" />
            </div>
          </div>
          <div class="text-[13px] text-text-muted">
            Scan QR code dengan aplikasi e-wallet pelanggan
          </div>
        </div>
      </Show>

      {/* Card */}
      <Show when={props.method === "card"}>
        <div class="mt-5 flex flex-col items-center py-6">
          <div class="mb-3 grid h-[140px] w-full place-items-center rounded-[10px] border-2 border-border border-dashed bg-surface-gray dark:border-border dark:bg-[#222]">
            <CreditCardIcon class="h-12 w-12 text-text-muted" />
          </div>
          <div class="text-[13px] text-text-muted">
            Tap atau gesek kartu di mesin EDC
          </div>
        </div>
      </Show>

      {/* E-Wallet */}
      <Show when={props.method === "ewallet"}>
        <div class="mt-5">
          <div class="grid grid-cols-2 gap-2.5">
            <For each={ewallets}>
              {(name) => (
                <Button
                  aria-label={name}
                  class="rounded-[10px] py-3.5 font-semibold text-[14px]"
                  onClick={() => props.onEwalletChange(name)}
                  variant={
                    props.ewallet === name
                      ? "card-accent-active"
                      : "card-accent"
                  }
                >
                  {name}
                </Button>
              )}
            </For>
          </div>
          <div class="mt-3.5 text-center text-[13px] text-text-muted">
            Kirim notifikasi ke pelanggan via {props.ewallet}
          </div>
        </div>
      </Show>
    </div>
  );
};
