import { useNavigate } from "@solidjs/router";
import dayjs from "dayjs";
import { createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { ArrowLeftIcon } from "~/assets";
import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import { Button } from "~/components/ui/button";
import type { CashShiftRow } from "~/db/cash-shifts";
import {
  closeShift,
  getOpenShift,
  getShiftWindowTotals,
} from "~/db/cash-shifts";
import { getWalletsWithBalance, type WalletRow } from "~/db/wallets";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import * as sale from "~/lib/sales/sale-session";
import { createLogger, formatRupiah } from "~/lib/utils";
import { WalletPicker } from "../dompet/components/wallet-picker";

const logger = createLogger({ domain: "SHIFT", module: "shift-close" });

const MAX_DIGITS = 9;

interface SummaryRow {
  readonly label: string;
  readonly value: string;
}

interface SubmittedSetoran {
  readonly amountMinorUnits: number;
  readonly toWalletName: string;
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
export default function ShiftClosePage() {
  const navigate = useNavigate();
  const shiftQuery = useDrizzleQuery(["drizzle", "cash-shifts", "open"], () =>
    getOpenShift()
  );
  const shift = () => shiftQuery.data() ?? null;

  // TanStack: key tracks the shift id, so the window refetches when the
  // open shift resolves (or changes) — the bug was createResource never
  // re-running its dependent fetcher.
  const totalsQuery = useDrizzleQuery(
    () => shift()?.id ?? "none",
    async () => {
      const open = shift();
      if (!open) {
        return {
          cashMinorUnits: 0,
          expectedInDrawerMinorUnits: 0,
          qrisMinorUnits: 0,
        };
      }
      return await getShiftWindowTotals(open);
    }
  );
  const totals = () => totalsQuery.data();
  const [countRaw, setCountRaw] = createSignal("");
  const [note, setNote] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [closedRow, setClosedRow] = createSignal<CashShiftRow | null>(null);
  const [closedSetoran, setClosedSetoran] =
    createSignal<SubmittedSetoran | null>(null);

  /* Setoran (optional, default off): move counted money to another wallet. */
  const walletsQuery = useDrizzleQuery(["drizzle", "wallets", "list"], () =>
    getWalletsWithBalance()
  );
  const wallets = (): WalletRow[] => walletsQuery.data() ?? [];
  const cashWallet = () => wallets().find((w) => w.type === "cash");
  const setoranTargets = () =>
    wallets().filter((w) => w.id !== cashWallet()?.id);
  const [setoranOn, setSetoranOn] = createSignal(false);
  const [setoranRaw, setSetoranRaw] = createSignal("");
  const [setoranToId, setSetoranToId] = createSignal<string | undefined>(
    undefined
  );

  const toRegister = () =>
    navigate("/transactions/cash-register", { replace: true });

  const expected = () => totals()?.expectedInDrawerMinorUnits ?? 0;
  const countAmount = () => Number.parseInt(countRaw() || "0", 10) || 0;
  const countMinor = () => countAmount() * 100;
  const difference = () => countMinor() - expected();
  const hasCart = () => sale.getCart().length > 0;
  const setoranAmount = () =>
    (Number.parseInt(setoranRaw() || "0", 10) || 0) * 100;
  const setoranOver = () => setoranAmount() > countMinor();
  const afterSetoranLabel = () =>
    formatRupiah((countMinor() - setoranAmount()) / 100);

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
      return `KURANG ${formatRupiah(-difference() / 100)}`;
    }
    return `LEBIH ${formatRupiah(difference() / 100)}`;
  };

  const differenceClass = () =>
    difference() === 0 ? "text-success" : "font-bold text-danger";

  const submit = async () => {
    const open = shift();
    if (!open || submitting()) {
      return;
    }
    if (setoranOn() && setoranOver()) {
      toast.error("Setoran tidak boleh melebihi hitungan kasir");
      return;
    }
    if (setoranOn() && setoranAmount() > 0 && !setoranToId()) {
      toast.error("Pilih dompet tujuan setoran");
      return;
    }
    const setoranTo = wallets().find((w) => w.id === setoranToId());
    setSubmitting(true);
    try {
      const row = await closeShift({
        actualCashMinorUnits: countMinor(),
        note: note(),
        setoran:
          setoranOn() && setoranAmount() > 0 && setoranTo
            ? {
                amountMinorUnits: setoranAmount(),
                toWalletId: setoranTo.id,
              }
            : undefined,
        shiftId: open.id,
      });
      if (hasCart()) {
        sale.clearCart();
      }
      setClosedSetoran(
        setoranOn() && setoranAmount() > 0 && setoranTo
          ? {
              amountMinorUnits: setoranAmount(),
              toWalletName: setoranTo.name,
            }
          : null
      );
      setClosedRow(row);
      shiftQuery.refetch();
      toast.success("Shift ditutup");
    } catch (error) {
      logger.error("CLOSE_FAILED", String(error));
      toast.error("Gagal menutup shift");
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaShell
      class="bg-muted"
      data-ssgoi-transition="/transactions/cash-register/shift-close"
    >
      <div class="flex h-full flex-col">
        <div class="flex h-header shrink-0 items-center gap-3.5 border-border border-b bg-card px-3.5 lg:px-5">
          <button
            aria-label="Kembali"
            class="grid h-[38px] w-[38px] place-items-center rounded-xl border border-border bg-card text-foreground transition-colors duration-150 hover:border-primary/20 hover:bg-primary/5"
            onClick={toRegister}
            type="button"
          >
            <ArrowLeftIcon class="size-5" />
          </button>
          <span class="font-bold font-display text-body-lg text-foreground">
            Tutup Shift
          </span>
        </div>

        <div class="scrollbar-none min-h-0 flex-1 overflow-y-auto p-4 lg:p-8">
          <div class="mx-auto flex w-full max-w-md flex-col gap-4">
            <Show
              fallback={
                <Show
                  fallback={
                    <div class="py-16 text-center text-body-sm text-muted-foreground">
                      Tidak ada shift yang terbuka.
                    </div>
                  }
                  keyed
                  when={shift()}
                >
                  {(open) => (
                    <>
                      <p class="text-caption text-muted-foreground">
                        Dibuka {dayjs(open.openedAt).format("HH:mm")} · float{" "}
                        {formatRupiah(open.initialFloatMinorUnits / 100)}
                      </p>

                      <div class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                        <h2 class="font-semibold text-caption text-muted-foreground tracking-wider">
                          SETORAN DIHARAPKAN
                        </h2>
                        <SummaryLine
                          rows={[
                            {
                              label: "Float awal",
                              value: formatRupiah(
                                open.initialFloatMinorUnits / 100
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
                                ? Number.parseInt(
                                    countRaw(),
                                    10
                                  ).toLocaleString("id-ID")
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

                        {/* Setoran (opsional) — money moved out at close. */}
                        <button
                          class="flex items-center justify-between rounded-xl border border-border bg-background px-3.5 py-3 text-left"
                          onClick={() => setSetoranOn(!setoranOn())}
                          type="button"
                        >
                          <span class="font-semibold text-body-sm text-foreground">
                            Setor uang ke dompet lain
                          </span>
                          <span
                            class={`font-bold text-caption ${
                              setoranOn()
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`}
                          >
                            {setoranOn() ? "AKTIF" : "OFF"}
                          </span>
                        </button>
                        <Show when={setoranOn()}>
                          <div class="flex flex-col gap-3 rounded-xl border border-border bg-background p-3">
                            <div class="flex h-[48px] items-center gap-2 rounded-lg border border-border bg-card px-3.5 transition-colors focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10">
                              <span class="font-semibold text-body-sm text-muted-foreground">
                                Rp
                              </span>
                              <input
                                aria-label="Jumlah setoran"
                                autocomplete="off"
                                class="w-full bg-transparent font-bold text-body-lg text-foreground tabular-nums outline-none"
                                inputmode="numeric"
                                onInput={(e) => {
                                  const digits = (
                                    e.currentTarget as HTMLInputElement
                                  ).value.replace(/\D/g, "");
                                  setSetoranRaw(digits.slice(0, MAX_DIGITS));
                                }}
                                placeholder="0"
                                value={
                                  setoranRaw()
                                    ? Number.parseInt(
                                        setoranRaw(),
                                        10
                                      ).toLocaleString("id-ID")
                                    : ""
                                }
                              />
                            </div>
                            <Show when={setoranOver() && countRaw()}>
                              <p class="text-caption text-danger">
                                Setoran melebihi hitungan kasir
                              </p>
                            </Show>
                            <WalletPicker
                              label="Ke Dompet"
                              onChange={setSetoranToId}
                              value={setoranToId()}
                              wallets={setoranTargets()}
                            />
                            <Show
                              when={
                                setoranToId() == null &&
                                setoranTargets().length === 0
                              }
                            >
                              <p class="text-caption text-muted-foreground">
                                Belum ada dompet lain — tambahkan di Pengaturan
                                → Dompet.
                              </p>
                            </Show>
                            <Show when={countRaw()}>
                              <p class="text-caption text-muted-foreground tabular-nums">
                                Tersisa di laci: {afterSetoranLabel()}
                              </p>
                            </Show>
                          </div>
                        </Show>

                        <Show when={hasCart()}>
                          <p class="rounded-lg bg-warning/10 px-3 py-2 text-caption text-warning">
                            Ada keranjang belum dibayar — keranjang akan dibuang
                            saat shift ditutup.
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
                  )}
                </Show>
              }
              keyed
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
                        value: formatRupiah(row.initialFloatMinorUnits / 100),
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
                      {
                        label: "Diharapkan",
                        value: formatRupiah(
                          (row.expectedCashMinorUnits ?? 0) / 100
                        ),
                      },
                      {
                        label: "Hitungan kasir",
                        value: formatRupiah(
                          (row.actualCashMinorUnits ?? 0) / 100
                        ),
                      },
                      {
                        label: "Selisih",
                        value: formatDifference(row.differenceMinorUnits ?? 0),
                      },
                      ...(closedSetoran()
                        ? [
                            {
                              label: "Setoran",
                              value: formatRupiah(
                                (closedSetoran()?.amountMinorUnits ?? 0) / 100
                              ),
                            },
                            {
                              label: "Tujuan setoran",
                              value: closedSetoran()?.toWalletName ?? "",
                            },
                          ]
                        : []),
                    ]}
                  />
                  <Button
                    class="mt-1 h-12 w-full font-bold text-body-sm"
                    onClick={() => navigate("/", { replace: true })}
                  >
                    Selesai
                  </Button>
                </div>
              )}
            </Show>
          </div>
        </div>
      </div>
    </SafeAreaShell>
  );
}
