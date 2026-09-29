import { createSignal, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { WalletIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import { openShift } from "~/db/cash-shifts";
import { createLogger, formatRupiah } from "~/lib/utils";

const logger = createLogger({ domain: "SHIFT", module: "shift-gate" });

const MAX_DIGITS = 9;

interface ShiftGateProps {
  readonly onOpened: () => void;
}

/**
 * Sale-entry gate: rendered in place of the register while the outlet has
 * no open cash shift. Single action — open the drawer with a float.
 */
export const ShiftGate = (props: ShiftGateProps) => {
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
      props.onOpened();
    } catch (error) {
      logger.error("OPEN_FAILED", String(error));
      toast.error("Gagal membuka shift");
      setSubmitting(false);
    }
  };

  return (
    <div class="flex min-h-dvh items-center justify-center bg-muted p-6">
      <FadeIn
        class="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-card"
        duration={0.4}
        y={16}
      >
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
          <span class="font-semibold text-body text-muted-foreground">Rp</span>
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
      </FadeIn>
    </div>
  );
};
