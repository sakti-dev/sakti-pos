import { A, useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { ArrowLeftIcon, WalletIcon } from "~/assets";
import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import { Button } from "~/components/ui/button";
import { openShift } from "~/db/cash-shifts";
import { createLogger, formatRupiah } from "~/lib/utils";

const logger = createLogger({ domain: "SHIFT", module: "shift-open" });

const MAX_DIGITS = 9;

/**
 * Sale-entry gate: the register redirects here while the outlet has no
 * open cash shift. Single action — open the drawer with a float.
 */
export default function ShiftOpenPage() {
  const navigate = useNavigate();
  const [floatRaw, setFloatRaw] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  onMount(() => {
    logger.info("GATE_BLOCKED", { reason: "no_open_shift" });
  });

  const floatAmount = () => Number.parseInt(floatRaw() || "0", 10) || 0;

  const handleInput = (e: InputEvent) => {
    const digits = (e.currentTarget as HTMLInputElement).value.replace(
      /\D/g,
      ""
    );
    setFloatRaw(digits.slice(0, MAX_DIGITS));
  };

  const submit = async () => {
    if (submitting()) {
      return;
    }
    setSubmitting(true);
    try {
      await openShift(floatAmount() * 100);
      toast.success("Shift dibuka — selamat bekerja!");
      navigate("/transactions/cash-register", { replace: true });
    } catch (error) {
      logger.error("OPEN_FAILED", String(error));
      toast.error("Gagal membuka shift");
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaShell
      class="bg-muted"
      data-ssgoi-transition="/transactions/cash-register/shift-open"
    >
      <div class="flex h-full flex-col">
        <div class="flex h-header shrink-0 items-center gap-3.5 border-border border-b bg-card px-3.5 lg:px-5">
          <A
            aria-label="Kembali"
            class="grid h-[38px] w-[38px] place-items-center rounded-xl border border-border bg-card text-foreground transition-colors duration-150 hover:border-primary/20 hover:bg-primary/5"
            href="/"
          >
            <ArrowLeftIcon class="size-5" />
          </A>
          <span class="font-bold font-display text-body-lg text-foreground">
            Buka Shift
          </span>
        </div>

        <div class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 lg:p-8">
          <div class="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-card">
            <div class="flex items-center gap-3.5">
              <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <WalletIcon class="size-6" />
              </span>
              <div>
                <h1 class="font-bold font-display text-body-lg text-foreground">
                  Buka Shift
                </h1>
                <p class="text-caption text-muted-foreground">
                  Kasir belum bisa transaksi sebelum laci dibuka
                </p>
              </div>
            </div>

            <label
              class="mt-5 block font-semibold text-caption text-muted-foreground tracking-wider"
              for="shift-float"
            >
              UANG KEMBALIAN AWAL (FLOAT)
            </label>
            <div class="mt-1.5 flex h-[52px] items-center gap-2 rounded-xl border border-border bg-background px-4 transition-colors focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10">
              <span class="font-semibold text-body text-muted-foreground">
                Rp
              </span>
              <input
                aria-label="Uang kembalian awal"
                autocomplete="off"
                class="w-full bg-transparent font-bold text-foreground text-heading-lg tabular-nums outline-none"
                id="shift-float"
                inputmode="numeric"
                onInput={handleInput}
                placeholder="0"
                value={
                  floatRaw()
                    ? Number.parseInt(floatRaw(), 10).toLocaleString("id-ID")
                    : ""
                }
              />
            </div>
            <Show when={floatAmount() > 0}>
              <p class="mt-1.5 text-caption text-muted-foreground">
                {formatRupiah(floatAmount())} akan tercatat sebagai float awal
              </p>
            </Show>

            <Button
              class="mt-5 h-12 w-full font-bold text-body-sm"
              disabled={submitting()}
              onClick={submit}
            >
              {submitting() ? "Membuka…" : "Buka Shift"}
            </Button>
          </div>
        </div>
      </div>
    </SafeAreaShell>
  );
}
