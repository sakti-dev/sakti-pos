import { useNavigate } from "@solidjs/router";
import { FiFileText, FiPackage, FiPlus, FiSearch } from "solid-icons/fi";
import { createSignal, For, Show } from "solid-js";
import { ChevronDownIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import { useOrientation } from "~/lib/use-orientation";
import { cn, formatRupiah } from "~/lib/utils";

// ── Dummy receipt data (UI-only) ──
interface ReceiptLine {
  readonly name: string;
  readonly qty: number;
  readonly unit: string;
}

interface Receipt {
  readonly createdAt: Date;
  readonly lines: readonly ReceiptLine[];
  readonly ref: string;
  readonly supplier: string;
  readonly totalCost: number;
  readonly totalQty: number;
}

const DUMMY_RECEIPTS: readonly Receipt[] = [
  {
    ref: "TRX-0002",
    createdAt: new Date(2026, 5, 17, 8, 30),
    supplier: "Toko Grosir Jaya",
    totalQty: 130,
    totalCost: 580_000,
    lines: [
      { name: "Bawang Putih", qty: 10, unit: "Kg" },
      { name: "Nutrisari Jeruk (Sachet)", qty: 120, unit: "Pcs" },
    ],
  },
  {
    ref: "TRX-0001",
    createdAt: new Date(2026, 5, 15, 6, 15),
    supplier: "Pasar Kranggan (Siti)",
    totalQty: 15,
    totalCost: 120_000,
    lines: [
      { name: "Cabai Rawit Merah", qty: 5, unit: "Kg" },
      { name: "Garam Dapur", qty: 10, unit: "Kg" },
    ],
  },
] as const;

const TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

function isToday(d: Date): boolean {
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export function TerimaTab() {
  const navigate = useNavigate();
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  const [receipts] = createSignal(DUMMY_RECEIPTS);
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const toggle = (ref: string) =>
    setExpanded((prev) => (prev === ref ? null : ref));

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 space-y-4 px-4 pt-4 pb-3 lg:px-6 lg:pb-4">
        {/* CTA */}
        <Button
          class="w-full rounded-xl"
          look="solid"
          onClick={() => navigate("/inventory/terima/new")}
          size="lg"
          tone="primary"
        >
          <FiPlus class="h-5 w-5" /> Terima Barang Baru
        </Button>
        <h2 class="flex items-center gap-1.5 text-muted-foreground">
          <FiPackage class="h-4 w-4 shrink-0" />
          <span class="font-semibold text-body-sm">
            Riwayat Nota Penerimaan
          </span>
        </h2>
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
        <Show
          fallback={
            <div class="flex flex-col items-center justify-center gap-1 py-20 text-center">
              <p class="text-body-sm text-muted-foreground">
                Belum ada penerimaan
              </p>
              <p class="text-caption text-faint-foreground">
                Ketuk tombol di atas untuk mulai mencatat kulakan
              </p>
            </div>
          }
          when={receipts().length > 0}
        >
          <div class="flex flex-col gap-3">
            <For each={receipts()}>
              {(receipt, i) => (
                <FadeIn
                  delay={0.1 + i() * 0.05}
                  duration={0.35}
                  enable={enable()}
                  y={12}
                >
                  <div class="rounded-xl border border-border bg-card">
                    {/* Accordion header */}
                    <button
                      aria-expanded={expanded() === receipt.ref}
                      class="flex w-full cursor-pointer items-start justify-between gap-4 p-4 text-left"
                      onClick={() => toggle(receipt.ref)}
                      type="button"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5">
                          <FiFileText class="h-4 w-4 shrink-0 text-muted-foreground" />
                          <p class="font-bold text-body text-foreground">
                            {receipt.ref}
                          </p>
                          <Show when={isToday(receipt.createdAt)}>
                            <span class="font-normal text-caption text-muted-foreground">
                              Hari ini
                            </span>
                          </Show>
                        </div>
                        <p class="mt-1 text-caption text-muted-foreground">
                          {TIME_FMT.format(receipt.createdAt)} ·{" "}
                          {receipt.supplier}
                        </p>
                      </div>
                      <div class="flex shrink-0 items-start gap-4">
                        <div class="text-right">
                          <p class="font-bold text-body text-foreground tabular-nums">
                            {formatRupiah(receipt.totalCost)}
                          </p>
                          <p class="text-caption text-faint-foreground">
                            +{receipt.totalQty} item
                          </p>
                        </div>
                        <ChevronDownIcon
                          class={cn(
                            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                            expanded() === receipt.ref && "rotate-180"
                          )}
                        />
                      </div>
                    </button>

                    {/* Accordion body */}
                    <Show when={expanded() === receipt.ref}>
                      <div class="border-border border-t px-4 py-4">
                        <p class="mb-2 font-medium text-caption text-muted-foreground">
                          Ringkasan Nota
                        </p>
                        <For each={receipt.lines}>
                          {(line) => (
                            <div class="flex items-center justify-between py-1">
                              <span class="text-body-sm text-foreground">
                                {line.name}
                              </span>
                              <span class="text-caption-sm text-faint-foreground tabular-nums">
                                {line.qty} {line.unit}
                              </span>
                            </div>
                          )}
                        </For>
                        <Button
                          class="mt-3 w-full"
                          look="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/inventory/terima/${receipt.ref}`);
                          }}
                          size="sm"
                          tone="primary"
                        >
                          <FiSearch class="h-3.5 w-3.5" /> Audit Detail /
                          Selengkapnya
                        </Button>
                      </div>
                    </Show>
                  </div>
                </FadeIn>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
