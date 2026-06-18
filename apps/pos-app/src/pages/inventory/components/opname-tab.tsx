import { useNavigate } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { listOpnames } from "~/lib/inventory/opname";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

export function OpnameTab() {
  const navigate = useNavigate();
  const opnames = createMemo(() => listOpnames());

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 px-4 pt-4 pb-3 lg:px-6 lg:pb-4">
        <Button
          class="w-full"
          look="solid"
          onClick={() => navigate("/inventory/opname/new")}
          tone="primary"
          type="button"
        >
          📋 Mulai Opname Baru
        </Button>
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
        <p class="mb-2 font-semibold text-caption-sm text-muted-foreground">
          Riwayat Opname
        </p>
        <Show
          fallback={
            <p class="py-16 text-center text-body-sm text-muted-foreground">
              Belum ada opname
            </p>
          }
          when={opnames().length > 0}
        >
          <div class="overflow-hidden rounded-xl border border-border">
            <For each={opnames()}>
              {(o) => (
                <div class="flex items-center gap-3 border-border border-b p-3 last:border-b-0">
                  <span class="text-lg">📋</span>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-body-sm text-foreground">
                      {o.ref}
                    </p>
                    <p class="text-caption-sm text-muted-foreground">
                      {o.itemCount} item dihitung ·{" "}
                      {DATE_FMT.format(new Date(o.createdAt))}
                    </p>
                  </div>
                  <div class="text-right">
                    <p
                      class={`font-semibold text-body-sm tabular-nums ${o.netDelta < 0 ? "text-danger" : "text-foreground"}`}
                    >
                      {o.netDelta > 0 ? "+" : ""}
                      {o.netDelta} item
                    </p>
                    <p class="text-caption-sm text-faint-foreground">
                      ✓ Selesai
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
