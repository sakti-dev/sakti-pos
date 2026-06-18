import { Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { cn, formatRupiah } from "~/lib/utils";
import { diffColor } from "./delta";
import type { StocktakeState } from "./use-stocktake";

export function StocktakeFooter(props: {
  onCancel: () => void;
  onConfirm: () => void;
  state: StocktakeState;
}) {
  const s = () => props.state;

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
      <input
        class="h-10 w-full rounded-md border border-border bg-muted px-3 text-body-sm outline-none transition-colors duration-150 focus:border-primary"
        onInput={(e) => s().setReason(e.currentTarget.value)}
        placeholder="Alasan opname (wajib)..."
        type="text"
        value={s().reason()}
      />

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
          onClick={props.onConfirm}
          tone="primary"
          type="button"
        >
          Simpan
        </Button>
      </div>
    </div>
  );
}
