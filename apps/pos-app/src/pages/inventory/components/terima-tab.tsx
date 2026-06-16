import { useNavigate } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { listReceipts } from "~/lib/inventory/terima";
import { formatRupiah } from "~/lib/utils";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

export function TerimaTab() {
  const navigate = useNavigate();
  const receipts = createMemo(() => listReceipts());

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 px-4 pt-4 lg:px-6">
        <Button
          class="w-full"
          look="solid"
          onClick={() => navigate("/inventory/terima/new")}
          tone="primary"
          type="button"
        >
          ➕ Terima Barang Baru
        </Button>
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
        <p class="mb-2 font-semibold text-caption-sm text-muted-foreground">
          Riwayat Penerimaan
        </p>
        <Show
          fallback={
            <p class="py-16 text-center text-body-sm text-muted-foreground">
              Belum ada penerimaan
            </p>
          }
          when={receipts().length > 0}
        >
          <div class="overflow-hidden rounded-xl border border-border">
            <For each={receipts()}>
              {(r) => (
                <div class="flex items-center gap-3 border-border border-b p-3 last:border-b-0">
                  <span class="text-lg">📦</span>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-body-sm text-foreground">
                      {r.ref}
                    </p>
                    <p class="text-caption-sm text-muted-foreground">
                      {r.supplier ?? "Tanpa supplier"} · {r.itemCount} item ·{" "}
                      {DATE_FMT.format(new Date(r.createdAt))}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="font-semibold text-body-sm text-foreground tabular-nums">
                      +{r.totalQty}
                    </p>
                    <p class="text-caption-sm text-faint-foreground">
                      {formatRupiah(r.totalCost)}
                    </p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
