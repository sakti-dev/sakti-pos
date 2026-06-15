import { For } from "solid-js";
import { PrinterIcon, ScannerIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import { CardDesc, CardTitle, SectionCard } from "./primitives";

const DEVICES = [
  {
    name: "Thermal Printer — EPSON TM-T82X",
    status: "Terhubung via USB",
    connected: true,
    Icon: PrinterIcon,
    kind: "printer" as const,
  },
  {
    name: "Barcode Scanner — Honeywell 1900g",
    status: "Terhubung via USB",
    connected: true,
    Icon: ScannerIcon,
    kind: "scanner" as const,
  },
  {
    name: "Kitchen Printer — EPSON TM-U220",
    status: "Tidak terhubung",
    connected: false,
    Icon: PrinterIcon,
    kind: "printer" as const,
  },
] as const;

export function SectionDevices() {
  return (
    <SectionCard>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Perangkat Terhubung</CardTitle>
          <CardDesc>
            Kelola printer, scanner, dan perangkat keras lainnya.
          </CardDesc>
        </div>
        <Button look="outline" tone="neutral" type="button">
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Tambah Perangkat
        </Button>
      </div>
      <div class="flex flex-col gap-2">
        <For each={DEVICES}>
          {(d) => (
            <div class="flex items-center gap-3.5 rounded-[10px] border border-border bg-muted p-4">
              <div
                class={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] ${
                  d.kind === "printer"
                    ? "bg-accent/10 text-primary dark:text-accent"
                    : "bg-status-warning/15 text-status-warning dark:bg-status-warning dark:text-status-warning-foreground"
                }`}
              >
                <d.Icon class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-body-sm text-foreground">
                  {d.name}
                </div>
                <div class="mt-0.5 text-caption text-muted-foreground">
                  <span
                    class={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                      d.connected
                        ? "bg-status-success dark:bg-accent"
                        : "bg-faint-foreground"
                    }`}
                  />
                  {d.status}
                </div>
              </div>
              <label class="relative h-6 w-11 shrink-0">
                <input
                  checked={d.connected}
                  class="absolute h-0 w-0 opacity-0"
                  type="checkbox"
                />
                <span class="absolute top-0 right-0 bottom-0 left-0 cursor-pointer rounded-full bg-border transition-[background] duration-250 before:absolute before:bottom-[3px] before:left-[3px] before:h-[18px] before:w-[18px] before:rounded-full before:bg-white before:shadow-card before:transition-[transform] before:duration-250 before:content-[''] checked:bg-primary dark:checked:bg-accent" />
              </label>
            </div>
          )}
        </For>
      </div>
    </SectionCard>
  );
}
