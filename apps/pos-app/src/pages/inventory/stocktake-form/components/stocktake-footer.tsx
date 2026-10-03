import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { cn, formatRupiah } from "~/lib/utils";
import { diffColor } from "./delta";
import type { StocktakeState } from "./use-stocktake";

/** Reason chips — merged adjustment/opname vocabulary. */
const REASONS: readonly string[] = [
  "Hitung fisik",
  "Rusak",
  "Hilang",
  "Expired",
  "Lainnya",
];

export function StocktakeFooter(props: {
  onCancel: () => void;
  onConfirm: () => void;
  state: StocktakeState;
}) {
  const s = () => props.state;
  const [detail, setDetail] = createSignal("");

  /** Compose the stored reason: "Lainnya — tertumpah saat masak". */
  const composedReason = () => {
    const base = s().reason().trim();
    const extra = detail().trim();
    if (!extra) {
      return base;
    }
    return `${base} — ${extra}`;
  };

  return (
    <div class="shrink-0 space-y-2.5 border-border border-t bg-card px-4 py-3 lg:px-6">
      {/* Progress */}
      <div class="flex items-center justify-between text-caption-sm text-muted-foreground">
        <span>
          {s().adjustedCount()} dari {s().scopeItems().length} disesuaikan
        </span>
        <Show when={s().adjustedCount() > 0}>
          <span>
            <span
              class={cn(
                "font-semibold tabular-nums",
                diffColor(s().totalDiff())
              )}
            >
              {formatRupiah(s().totalValue())}
            </span>
          </span>
        </Show>
      </div>

      {/* Reason */}
      <div class="flex flex-col gap-1.5">
        <span class="font-medium text-caption text-muted-foreground">
          Alasan <span class="text-danger">*</span>
        </span>
        <div class="flex flex-wrap gap-1.5">
          <For each={REASONS}>
            {(r) => (
              <button
                class={`rounded-full px-3 py-1.5 font-medium text-caption transition-colors ${
                  s().reason() === r
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:border-primary/50"
                }`}
                onClick={() => s().setReason(r)}
                type="button"
              >
                {r}
              </button>
            )}
          </For>
        </div>
        <Show when={s().reason() === "Lainnya"}>
          <input
            class="h-10 w-full rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            onInput={(e) => setDetail(e.currentTarget.value)}
            placeholder="Tulis alasan lainnya (opsional)..."
            type="text"
            value={detail()}
          />
        </Show>
      </div>

      {/* Warning */}
      <p class="text-caption-sm text-faint-foreground">
        Stok akan disesuaikan berdasarkan hasil hitung fisik. Tindakan ini tidak
        bisa dibatalkan.
      </p>

      {/* Actions */}
      <div class="flex justify-end gap-2">
        <Button
          look="ghost"
          onClick={props.onCancel}
          tone="neutral"
          type="button"
        >
          Batal
        </Button>
        <Button
          disabled={!s().canConfirm()}
          look="solid"
          onClick={() => {
            s().setReason(composedReason());
            props.onConfirm();
          }}
          tone="primary"
          type="button"
        >
          Simpan
        </Button>
      </div>
    </div>
  );
}
