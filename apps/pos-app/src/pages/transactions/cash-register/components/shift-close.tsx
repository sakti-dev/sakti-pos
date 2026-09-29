import { createResource, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import type { CashShiftRow } from "~/db/cash-shifts";
import { closeShift, getShiftWindowTotals } from "~/db/cash-shifts";
import * as sale from "~/lib/sales/sale-session";
import { createLogger, formatRupiah } from "~/lib/utils";

const logger = createLogger({ domain: "SHIFT", module: "shift-close" });

const MAX_DIGITS = 9;

interface ShiftCloseProps {
  readonly onCancel: () => void;
  readonly onClosed: () => void;
  readonly shift: CashShiftRow;
}

interface SummaryRow {
  readonly label: string;
  readonly value: string;
}

function formatDifference(minorUnits: number): string {
  if (minorUnits === 0) {
    return "Pas";
  }
  const word = minorUnits < 0 ? "Kurang" : "Lebih";
  return `${word} ${formatRupiah(Math.abs(minorUnits) / 100)}`;
}

const SummaryLine = (props: { readonly rows: readonly SummaryRow[] }) => (
  <div class="flex flex-col gap-2.5 rounded-xl bg-background px-4 py-3.5">
    <For each={props.rows}>
      {(row) => (
        <div class="flex items-baseline justify-between gap-4">
          <span class="text-body-sm text-muted-foreground">{row.label}</span>
          <span class="font-semibold text-body-sm text-foreground tabular-nums">
            {row.value}
          </span>
        </div>
      )}
    </For>
  </div>
);

/**
 * Setoran: reconcile and close the open shift. Expected = float + cash
 * sales in the shift window; QRIS shown informationally; the physical
 * count yields the signed difference persisted with the closer identity.
 */
export const ShiftClose = (props: ShiftCloseProps) => {
  const [totals] = createResource(() => getShiftWindowTotals(props.shift));
  const [countRaw, setCountRaw] = createSignal("");
  const [note, setNote] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [closedRow, setClosedRow] = createSignal<CashShiftRow | null>(null);

  const expected = () => totals()?.expectedInDrawerMinorUnits ?? 0;
  const countAmount = () => Number.parseInt(countRaw() || "0", 10) || 0;
  const countMinor = () => countAmount() * 100;
  const difference = () => countMinor() - expected();
  const hasCart = () => sale.getCart().length > 0;

  const handleInput = (e: InputEvent) => {
    const digits = (e.currentTarget as HTMLInputElement).value.replace(
      /\D/g,
      ""
    );
    setCountRaw(digits.slice(0, MAX_DIGITS));
  };

  const differenceLabel = () => {
    if (difference() === 0) {
      return "PAS";
    }
    if (difference() < 0) {
      return `KURANG ${formatRupiah(-difference())}`;
    }
    return `LEBIH ${formatRupiah(difference())}`;
  };

  const differenceClass = () =>
    difference() === 0 ? "text-success" : "font-bold text-danger";

  const submit = async () => {
    if (submitting()) {
      return;
    }
    setSubmitting(true);
    try {
      const row = await closeShift({
        actualCashMinorUnits: countMinor(),
        note: note(),
        shiftId: props.shift.id,
      });
      if (hasCart()) {
        sale.clearCart();
      }
      setClosedRow(row);
      toast.success("Shift ditutup");
    } catch (error) {
      logger.error("CLOSE_FAILED", String(error));
      toast.error("Gagal menutup shift");
      setSubmitting(false);
    }
  };

  const openedLabel = () =>
    new Date(props.shift.openedAt).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div class="min-h-dvh bg-muted p-4 lg:p-8">
      <FadeIn
        class="mx-auto flex w-full max-w-md flex-col gap-4"
        duration={0.4}
        y={16}
      >
        <Show
          fallback={
            <>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h1 class="font-bold font-display text-body-lg text-foreground">
                    Tutup Shift
                  </h1>
                  <p class="text-caption text-muted-foreground">
                    Dibuka {openedLabel()} · float{" "}
                    {formatRupiah(props.shift.initialFloatMinorUnits / 100)}
                  </p>
                </div>
                <Button look="ghost" onClick={props.onCancel} size="sm">
                  Batal
                </Button>
              </div>

              <div class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                <h2 class="font-semibold text-caption text-muted-foreground tracking-wider">
                  SETORAN DIHARAPKAN
                </h2>
                <SummaryLine
                  rows={[
                    {
                      label: "Float awal",
                      value: formatRupiah(
                        props.shift.initialFloatMinorUnits / 100
                      ),
                    },
                    {
                      label: "Penjualan tunai",
                      value: formatRupiah(
                        (totals()?.cashMinorUnits ?? 0) / 100
                      ),
                    },
                    {
                      label: "QRIS (non-laci)",
                      value: formatRupiah(
                        (totals()?.qrisMinorUnits ?? 0) / 100
                      ),
                    },
                  ]}
                />
                <div class="flex items-baseline justify-between gap-4 border-border border-t pt-3">
                  <span class="font-semibold text-body-sm text-foreground">
                    Diharapkan di laci
                  </span>
                  <span class="font-display font-extrabold text-foreground text-heading tabular-nums">
                    {formatRupiah(expected() / 100)}
                  </span>
                </div>
              </div>

              <div class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                <label
                  class="font-semibold text-caption text-muted-foreground tracking-wider"
                  for="shift-count"
                >
                  HITUNGAN KASIR
                </label>
                <div class="flex h-[52px] items-center gap-2 rounded-xl border border-border bg-background px-4 transition-colors focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10">
                  <span class="font-semibold text-body text-muted-foreground">
                    Rp
                  </span>
                  <input
                    aria-label="Hitungan kasir"
                    autocomplete="off"
                    class="w-full bg-transparent font-bold text-foreground text-heading-lg tabular-nums outline-none"
                    id="shift-count"
                    inputmode="numeric"
                    onInput={handleInput}
                    placeholder="0"
                    value={
                      countRaw()
                        ? Number.parseInt(countRaw(), 10).toLocaleString(
                            "id-ID"
                          )
                        : ""
                    }
                  />
                </div>
                <Show when={countRaw()}>
                  <p
                    class={`text-body-sm tabular-nums ${differenceClass()}`}
                    role="status"
                  >
                    {differenceLabel()}
                  </p>
                </Show>
                <textarea
                  aria-label="Catatan shift"
                  class="min-h-[64px] resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 font-[inherit] text-body-sm text-foreground outline-none transition-colors focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                  onInput={(e) => setNote(e.currentTarget.value)}
                  placeholder="Catatan (opsional)"
                  value={note()}
                />
                <Show when={hasCart()}>
                  <p class="rounded-lg bg-warning/10 px-3 py-2 text-caption text-warning">
                    Ada keranjang belum dibayar — keranjang akan dibuang saat
                    shift ditutup.
                  </p>
                </Show>
                <Button
                  class="h-12 w-full font-bold text-body-sm"
                  disabled={submitting()}
                  onClick={submit}
                >
                  {submitting() ? "Menutup…" : "Konfirmasi Tutup Shift"}
                </Button>
              </div>
            </>
          }
          when={closedRow()}
        >
          {(row) => (
            <div class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-card">
              <div class="flex items-center gap-3">
                <span class="grid size-10 place-items-center rounded-full bg-success/15 font-bold text-body-lg text-success">
                  ✓
                </span>
                <div>
                  <h1 class="font-bold font-display text-body-lg text-foreground">
                    Shift Ditutup
                  </h1>
                  <p class="text-caption text-muted-foreground">
                    Setoran tercatat dan tersinkron
                  </p>
                </div>
              </div>
              <SummaryLine
                rows={[
                  {
                    label: "Float awal",
                    value: formatRupiah(
                      props.shift.initialFloatMinorUnits / 100
                    ),
                  },
                  {
                    label: "Penjualan tunai",
                    value: formatRupiah((totals()?.cashMinorUnits ?? 0) / 100),
                  },
                  {
                    label: "QRIS (non-laci)",
                    value: formatRupiah((totals()?.qrisMinorUnits ?? 0) / 100),
                  },
                  {
                    label: "Diharapkan",
                    value: formatRupiah(
                      (row().expectedCashMinorUnits ?? 0) / 100
                    ),
                  },
                  {
                    label: "Hitungan kasir",
                    value: formatRupiah(
                      (row().actualCashMinorUnits ?? 0) / 100
                    ),
                  },
                  {
                    label: "Selisih",
                    value: formatDifference(row().differenceMinorUnits ?? 0),
                  },
                ]}
              />
              <Button
                class="mt-1 h-12 w-full font-bold text-body-sm"
                onClick={props.onClosed}
              >
                Selesai
              </Button>
            </div>
          )}
        </Show>
      </FadeIn>
    </div>
  );
};
