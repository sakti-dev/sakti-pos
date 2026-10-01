import { FiSliders } from "solid-icons/fi";
import { createMemo, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "~/components/ui/adaptive-dialog";
import { Button } from "~/components/ui/button";
import {
  type AdjustmentReason,
  createStockAdjustment,
  getTrackedItems,
} from "~/db/inventory";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";

const REASONS: readonly AdjustmentReason[] = [
  "rusak",
  "hilang",
  "expired",
  "hadiah",
  "sample",
  "lainnya",
];

/** Human labels for adjustment reasons, used in the reason chips. */
const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  expired: "Expired",
  hadiah: "Hadiah",
  hilang: "Hilang",
  lainnya: "Lainnya",
  rusak: "Rusak",
  sample: "Sample",
};

interface AdjustmentDialogProps {
  readonly onDone: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function AdjustmentDialog(props: AdjustmentDialogProps) {
  const [targetId, setTargetId] = createSignal<string | null>(null);
  const [amount, setAmount] = createSignal("");
  const [direction, setDirection] = createSignal<"out" | "in">("out");
  const [reason, setReason] = createSignal<AdjustmentReason>("rusak");
  const [note, setNote] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const itemsQuery = useDrizzleQuery(
    ["drizzle", "inventory", "tracked-items"],
    () => getTrackedItems()
  );
  const items = () => itemsQuery.data() ?? [];

  const filteredItems = createMemo(() => {
    const q = search().toLowerCase().trim();
    if (!q) {
      return items();
    }
    return items().filter((i) => i.name.toLowerCase().includes(q));
  });

  const selected = () => items().find((i) => i.id === targetId());

  const parsedAmount = (): number => {
    const n = Number.parseFloat(amount().replace(",", "."));
    return Number.isFinite(n) ? n : Number.NaN;
  };

  const canSave = () =>
    targetId() !== null &&
    Number.isFinite(parsedAmount()) &&
    parsedAmount() > 0 &&
    !saving();

  const handleSave = () => {
    const item = selected();
    if (!item || saving()) {
      return;
    }
    const magnitude = parsedAmount();
    const delta = direction() === "out" ? -magnitude : magnitude;
    setSaving(true);
    createStockAdjustment({
      note: note().trim() || undefined,
      qtyDelta: delta,
      reason: reason(),
      targetId: item.id,
      targetType: item.targetType,
    })
      .then(() => {
        toast.success(
          `Stok ${item.name} ${direction() === "out" ? "dikurangi" : "ditambah"} ${magnitude}`
        );
        reset();
        props.onDone();
        props.onOpenChange(false);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Gagal menyimpan penyesuaian"
        );
      })
      .finally(() => setSaving(false));
  };

  const reset = () => {
    setTargetId(null);
    setAmount("");
    setDirection("out");
    setReason("rusak");
    setNote("");
    setSearch("");
  };

  return (
    <AdaptiveDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AdaptiveDialogContent>
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>Penyesuaian Stok</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            Catat stok rusak, hilang, atau penemuan tanpa supplier.
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <div class="space-y-4">
          <Show
            fallback={
              <div class="space-y-2">
                <input
                  class="h-10 w-full rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                  onInput={(e) => setSearch(e.currentTarget.value)}
                  placeholder="Cari item yang dipantau..."
                  type="text"
                  value={search()}
                />
                <div class="max-h-64 space-y-1 overflow-y-auto">
                  <For
                    each={filteredItems()}
                    fallback={
                      <p class="py-6 text-center text-caption text-faint-foreground">
                        Belum ada item yang dipantau
                      </p>
                    }
                  >
                    {(item) => (
                      <button
                        class="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40"
                        onClick={() => setTargetId(item.id)}
                        type="button"
                      >
                        <span class="min-w-0">
                          <span class="block truncate font-medium text-body-sm text-foreground">
                            {item.name}
                          </span>
                          <span class="text-caption-sm text-faint-foreground">
                            Sisa: {item.onHandQty} {item.unit}
                          </span>
                        </span>
                        <span class="text-caption text-faint-foreground">
                          pilih
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            }
            when={selected()}
          >
            {(item) => (
              <div class="space-y-4">
                <div class="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
                  <div>
                    <p class="font-medium text-body-sm text-foreground">
                      {item().name}
                    </p>
                    <p class="text-caption-sm text-faint-foreground">
                      Sisa saat ini: {item().onHandQty} {item().unit}
                    </p>
                  </div>
                  <Button
                    look="ghost"
                    onClick={() => setTargetId(null)}
                    size="xs"
                    tone="neutral"
                  >
                    Ganti
                  </Button>
                </div>

                <div class="flex flex-col gap-1">
                  <span class="font-medium text-caption text-muted-foreground">
                    Arah
                  </span>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      class={`rounded-lg px-3 py-2 font-medium text-caption transition-colors ${
                        direction() === "out"
                          ? "bg-status-danger text-status-danger-foreground"
                          : "border border-border text-muted-foreground"
                      }`}
                      onClick={() => setDirection("out")}
                      type="button"
                    >
                      − Berkurang
                    </button>
                    <button
                      class={`rounded-lg px-3 py-2 font-medium text-caption transition-colors ${
                        direction() === "in"
                          ? "bg-status-success text-status-success-foreground"
                          : "border border-border text-muted-foreground"
                      }`}
                      onClick={() => setDirection("in")}
                      type="button"
                    >
                      + Bertambah
                    </button>
                  </div>
                </div>

                <label class="flex flex-col gap-1">
                  <span class="font-medium text-caption text-muted-foreground">
                    Jumlah ({item().unit})
                  </span>
                  <input
                    class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                    inputMode="decimal"
                    onInput={(e) => setAmount(e.currentTarget.value)}
                    placeholder="Contoh: 2"
                    type="text"
                    value={amount()}
                  />
                </label>

                <div class="flex flex-col gap-1">
                  <span class="font-medium text-caption text-muted-foreground">
                    Alasan <span class="text-danger">*</span>
                  </span>
                  <div class="flex flex-wrap gap-2">
                    <For each={REASONS}>
                      {(r) => (
                        <button
                          class={`rounded-full px-3 py-1.5 font-medium text-caption transition-colors ${
                            reason() === r
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-muted-foreground hover:border-primary/50"
                          }`}
                          onClick={() => setReason(r)}
                          type="button"
                        >
                          {ADJUSTMENT_REASON_LABELS[r]}
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <label class="flex flex-col gap-1">
                  <span class="font-medium text-caption text-muted-foreground">
                    Catatan (opsional)
                  </span>
                  <input
                    class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                    onInput={(e) => setNote(e.currentTarget.value)}
                    placeholder="Contoh: botol pecah saat pengiriman"
                    type="text"
                    value={note()}
                  />
                </label>
              </div>
            )}
          </Show>
        </div>
        <AdaptiveDialogFooter>
          <Button
            look="ghost"
            onClick={() => {
              reset();
              props.onOpenChange(false);
            }}
            tone="neutral"
            type="button"
          >
            Batal
          </Button>
          <Button
            disabled={!canSave()}
            look="solid"
            onClick={handleSave}
            tone="primary"
            type="button"
          >
            <FiSliders class="h-4 w-4" /> Simpan
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
