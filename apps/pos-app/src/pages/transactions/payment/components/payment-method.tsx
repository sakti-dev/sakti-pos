import type { Component } from "solid-js";
import { createEffect, For, Show } from "solid-js";
import { BanknoteIcon, QrCodeIcon, ScannerIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import { Numpad } from "~/components/ui/numpad";
import { TabButton } from "~/components/ui/tabs";
import { toDynamic } from "~/lib/qris";
import type { PayMethod } from "~/lib/sales/types";
import { cn, formatRupiah } from "~/lib/utils";
import { QRisQR } from "./qris-qr";

export type { PayMethod };

const RE_ANDROID = /android/i;
const RE_SINGLE_DIGIT = /^\d$/;
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
const methodOptions: readonly {
  key: PayMethod;
  Icon: Component<{ class?: string }>;
  label: string;
}[] = [
  { key: "cash", Icon: BanknoteIcon, label: "Tunai" },
  { key: "qris_static", Icon: QrCodeIcon, label: "QRIS Statis" },
  { key: "qris_dynamic", Icon: ScannerIcon, label: "QRIS Dinamis" },
] as const;

interface PaymentMethodProps {
  readonly availableMethods: readonly PayMethod[];
  readonly cashRaw: string;
  readonly method: PayMethod;
  readonly onCashRawChange: (v: string) => void;
  readonly onConfirm: () => void;
  readonly onMethodChange: (m: PayMethod) => void;
  readonly onSelectedQuickChange: (v: number | null) => void;
  readonly qrisPayload: string | null;
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
  const formatted = () =>
    cashNum() > 0 ? cashNum().toLocaleString("id-ID") : "";
  const change = () => cashNum() - props.total;

  const quickAmounts = () => getSmartCashSuggestions(props.total);

  const qrisRenderPayload = () => {
    const payload = props.qrisPayload;
    if (!payload) {
      return null;
    }
    if (props.method === "qris_static") {
      return payload;
    }
    return toDynamic(payload, props.total);
  };

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

  return (
    <div class="rounded-lg border border-border/50 bg-card px-6 py-5">
      <div class="mb-4 font-semibold text-body-sm text-muted-foreground uppercase tracking-wider">
        Metode Pembayaran
      </div>

      {/* Method grid */}
      <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <For
          each={methodOptions.filter((m) =>
            props.availableMethods.includes(m.key)
          )}
        >
          {(m) => (
            <TabButton
              active={props.method === m.key}
              aria-label={m.label}
              class="flex-col gap-2.5 py-[18px] pb-3.5 [&>svg]:size-7"
              onClick={() => props.onMethodChange(m.key)}
              tone="accent"
            >
              <m.Icon class="transition-colors duration-200" />
              <span class="font-medium text-body-sm transition-colors duration-200">
                {m.label}
              </span>
            </TabButton>
          )}
        </For>
      </div>

      {/* Cash */}
      <Show when={props.method === "cash"}>
        <div class="mt-5">
          <div class="mb-1.5 flex items-center justify-between">
            <span class="font-medium text-caption text-muted-foreground">
              Jumlah cepat
            </span>
          </div>
          <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <For each={quickAmounts()}>
              {(amt) => (
                <Button
                  aria-label={`Jumlah ${formatRupiah(amt)}`}
                  class="!border-border h-9 w-full justify-center rounded-sm border font-semibold text-caption text-muted-foreground tabular-nums transition-colors hover:bg-muted hover:text-foreground"
                  look="outline"
                  onClick={() => selectQuick(amt)}
                  onPointerDown={(e) => e.preventDefault()}
                  size="none"
                  tone="primary"
                >
                  {formatRupiah(amt)}
                </Button>
              )}
            </For>
          </div>

          <div
            class={cn(
              "flex h-[72px] items-center justify-center gap-2 rounded-lg border-2 border-border bg-muted px-5 transition-colors duration-150",
              cashNum() > 0 && "border-primary bg-card dark:border-accent"
            )}
          >
            <span class="shrink-0 font-semibold text-body text-muted-foreground dark:text-faint-foreground">
              Rp
            </span>
            <input
              class="min-w-0 flex-1 bg-transparent text-center font-extrabold text-foreground text-heading tabular-nums tracking-tight caret-color-primary placeholder:font-normal placeholder:text-muted-foreground placeholder:text-subheading focus:outline-none dark:text-foreground dark:caret-primary dark:placeholder:text-faint-foreground"
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
              onKeyDown={(e) => {
                if (
                  e.key === "Backspace" ||
                  e.key === "Delete" ||
                  e.key === "Tab" ||
                  e.key === "Escape" ||
                  e.key === "Enter"
                ) {
                  if (
                    e.key === "Enter" &&
                    cashNum() >= props.total &&
                    cashNum() > 0
                  ) {
                    props.onConfirm();
                  }
                  return;
                }
                if (!RE_SINGLE_DIGIT.test(e.key)) {
                  e.preventDefault();
                }
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

                // Auto-focus on mount so cashier can type immediately.
                // preventScroll: focusing during the ssgoi entrance would otherwise
                // trigger a scroll-into-view (root is translated off-screen) and
                // jitter the content mid-transition.
                requestAnimationFrame(() => el.focus({ preventScroll: true }));
                // Idempotent value sync: only write to DOM when formatted value actually changed.
                // This prevents Solid's reactive binding from resetting Chromium's caret blink timer.
                createEffect(() => {
                  const fmt = formatted();
                  if (el.value === fmt) {
                    return;
                  }
                  el.value = fmt;
                  if (pendingRawCursor === undefined) {
                    el.setSelectionRange(fmt.length, fmt.length);
                  } else {
                    const pos = rawToFormattedPos(fmt, pendingRawCursor);
                    el.setSelectionRange(pos, pos);
                  }
                  pendingRawCursor = undefined;
                });
              }}
              type="text"
              value={formatted()}
            />
          </div>

          <Numpad class="mt-3" onKey={handleNumpad} />

          <Show when={cashNum() > 0}>
            <div
              class={cn(
                "mt-3 flex items-center justify-between rounded-lg border px-4 py-3",
                change() >= 0
                  ? "border-border bg-muted/40"
                  : "border-danger/20 bg-danger/5"
              )}
            >
              <span class="flex items-center gap-2 font-medium text-body-sm text-muted-foreground">
                <span
                  class={cn(
                    "size-1.5 rounded-full",
                    change() >= 0 ? "bg-accent" : "bg-danger"
                  )}
                />
                {change() >= 0 ? "Kembalian" : "Kurang"}
              </span>
              <span
                class={cn(
                  "font-bold text-body-lg tabular-nums",
                  change() >= 0 ? "text-foreground" : "text-danger"
                )}
              >
                {formatRupiah(Math.abs(change()))}
              </span>
            </div>
          </Show>
        </div>
      </Show>

      {/* QRIS Statis / Dinamis */}
      <Show
        when={props.method === "qris_static" || props.method === "qris_dynamic"}
      >
        <div class="mt-5 flex flex-col items-center py-6">
          <div class="mb-4 grid place-items-center rounded-md border-2 border-border bg-white p-3">
            <QRisQR payload={qrisRenderPayload()} />
          </div>
          <div class="text-center text-body-sm text-faint-foreground">
            <Show
              fallback="Minta pelanggan pindai QRIS Anda, lalu tekan Sudah Dibayar."
              when={props.method === "qris_dynamic"}
            >
              Total {formatRupiah(props.total)} sudah tersemat di QR — pelanggan
              cukup pindai dan bayar.
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};
