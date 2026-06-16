import { createEffect, createMemo, createSignal, For } from "solid-js";
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
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import type { Product } from "~/lib/data/catalog";
import { currentStock, recordMovement } from "~/lib/inventory/store";
import {
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentReason,
} from "~/lib/inventory/types";
import { cn, formatRupiah } from "~/lib/utils";

const REASONS = Object.keys(ADJUSTMENT_REASON_LABELS) as AdjustmentReason[];

export interface AdjustmentSheetProps {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly product: Product;
}

export function AdjustmentSheet(props: AdjustmentSheetProps) {
  const [direction, setDirection] = createSignal<"in" | "out">("out");
  const [note, setNote] = createSignal("");
  const [qty, setQty] = createSignal(1);
  const [reason, setReason] = createSignal<AdjustmentReason | undefined>(
    undefined
  );

  // Reset transient state whenever the sheet opens for a fresh entry.
  let lastOpen = false;
  createEffect(() => {
    if (props.open && !lastOpen) {
      setDirection("out");
      setQty(1);
      setReason(undefined);
      setNote("");
    }
    lastOpen = props.open;
  });

  const balance = () => currentStock(props.product.id);
  const delta = createMemo(() => (direction() === "in" ? qty() : -qty()));
  const after = createMemo(() => Math.max(0, balance() + delta()));
  const canSave = () => qty() > 0 && reason() !== undefined;

  const handleSave = () => {
    if (!canSave()) {
      return;
    }
    recordMovement({
      productId: props.product.id,
      type: "adjustment",
      delta: delta(),
      reason: reason(),
      note: note().trim() || undefined,
    });
    toast.success("Penyesuaian tersimpan");
    props.onOpenChange(false);
  };

  return (
    <AdaptiveDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AdaptiveDialogContent class="max-w-md">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{props.product.name}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            {props.product.sku} · {formatRupiah(props.product.price)} ·{" "}
            {props.product.unit}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        <div class="flex flex-col gap-4">
          <div class="rounded-lg border border-border bg-muted/40 p-3 text-center">
            <p class="text-caption-sm text-muted-foreground">Stok saat ini</p>
            <p class="font-bold text-foreground text-subheading tabular-nums">
              {balance()}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <Button
              look={direction() === "in" ? "solid" : "outline"}
              onClick={() => setDirection("in")}
              tone="primary"
              type="button"
            >
              ➕ Tambah
            </Button>
            <Button
              look={direction() === "out" ? "solid" : "outline"}
              onClick={() => setDirection("out")}
              tone={direction() === "out" ? "danger" : "neutral"}
              type="button"
            >
              ➖ Kurangi
            </Button>
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="font-medium text-body-sm text-foreground">Jumlah</span>
            <QuantityStepper
              ariaLabel={`Jumlah ${props.product.name}`}
              editable
              onDecrement={() => setQty((q) => Math.max(1, q - 1))}
              onIncrement={() => setQty((q) => q + 1)}
              onInput={(v) => setQty(Math.max(1, v))}
              value={qty()}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="font-medium text-body-sm text-foreground">Alasan</span>
            <div class="flex flex-wrap gap-2">
              <For each={REASONS}>
                {(r) => (
                  <button
                    class={cn(
                      "rounded-full border-2 px-3 py-1.5 font-semibold text-[13px] transition-colors",
                      reason() === r
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    )}
                    onClick={() => setReason(r)}
                    type="button"
                  >
                    {ADJUSTMENT_REASON_LABELS[r]}
                  </button>
                )}
              </For>
            </div>
          </div>

          <TextField class="gap-1.5" onChange={setNote} value={note()}>
            <TextFieldLabel>Catatan (opsional)</TextFieldLabel>
            <TextFieldInput placeholder="Contoh: ganti toples baru" />
          </TextField>

          <div class="rounded-lg border border-border p-3 text-center font-medium text-body-sm text-foreground tabular-nums">
            Pratinjau: {balance()} <span class="text-muted-foreground">→</span>{" "}
            {after()}{" "}
            <span class={delta() < 0 ? "text-danger" : "text-success"}>
              ({delta() > 0 ? "+" : ""}
              {delta()})
            </span>
          </div>
        </div>

        <AdaptiveDialogFooter>
          <Button
            look="outline"
            onClick={() => props.onOpenChange(false)}
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
            Simpan
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
