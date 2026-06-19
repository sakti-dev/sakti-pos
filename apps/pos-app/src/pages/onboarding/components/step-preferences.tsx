import {
  NumberField,
  NumberFieldInput,
  NumberFieldLabel,
} from "~/components/ui/number-field";
import { cn } from "~/lib/utils";

interface StepPreferencesProps {
  readonly initialCash: number;
  readonly onInitialCashChange: (value: number) => void;
  readonly onTaxPercentageChange: (value: number) => void;
  readonly onUseTaxChange: (value: boolean) => void;
  readonly taxPercentage: number;
  readonly useTax: boolean;
}

export function StepPreferences(props: StepPreferencesProps) {
  return (
    <div class="flex flex-col gap-5">
      {/* ── Tax toggle ── */}
      <section class="rounded-lg border-2 border-input bg-background p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="font-semibold text-body-sm text-foreground">
              Gunakan Pajak Toko?
            </h2>
            <p class="mt-0.5 text-[13px] text-muted-foreground leading-snug">
              Pajak ditambahkan otomatis pada setiap transaksi.
            </p>
          </div>
          <TaxToggle
            ariaLabel="Aktifkan pajak toko"
            checked={props.useTax}
            onChange={props.onUseTaxChange}
          />
        </div>

        {/* Animated reveal — max-height + opacity, never gates visibility
            on render (open state renders the field immediately). */}
        <div
          aria-hidden={!props.useTax}
          class="grid transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          classList={{
            "grid-rows-[1fr] opacity-100 mt-4": props.useTax,
            "grid-rows-[0fr] opacity-0 mt-0": !props.useTax,
          }}
        >
          <div class="overflow-hidden">
            <NumberField>
              <NumberFieldLabel>Persentase Pajak (%)</NumberFieldLabel>
              <div class="relative">
                <NumberFieldInput
                  ariaLabel="Persentase pajak"
                  class="pr-10"
                  disabled={!props.useTax}
                  onChange={props.onTaxPercentageChange}
                  placeholder="11"
                  value={props.taxPercentage}
                />
                <span class="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 font-semibold text-body-sm text-muted-foreground">
                  %
                </span>
              </div>
            </NumberField>
          </div>
        </div>
      </section>

      {/* ── Initial cash float ── */}
      <NumberField>
        <NumberFieldLabel>Modal Awal Laci Kasir</NumberFieldLabel>
        <div class="relative">
          <NumberFieldInput
            ariaLabel="Modal awal kasir"
            class="pl-11"
            onChange={props.onInitialCashChange}
            placeholder="0"
            value={props.initialCash}
          />
          <span class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-body-sm text-muted-foreground">
            Rp
          </span>
        </div>
        <p class="mt-0.5 text-[13px] text-muted-foreground leading-snug">
          Jumlah uang awal di laci saat mulai berjualan.
        </p>
      </NumberField>
    </div>
  );
}

/** Canopy switch — pill track, lime knob when on. Own component so the
 *  toggle vocabulary stays in one place if reused elsewhere. */
function TaxToggle(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      aria-checked={props.checked}
      aria-label={props.ariaLabel}
      class={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-standard ease-standard focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        props.checked
          ? "border-primary bg-primary dark:border-accent dark:bg-accent"
          : "border-input bg-muted"
      )}
      onClick={() => props.onChange(!props.checked)}
      role="switch"
      type="button"
    >
      <span
        class={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-standard ease-[cubic-bezier(0.22,1,0.36,1)]",
          props.checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
