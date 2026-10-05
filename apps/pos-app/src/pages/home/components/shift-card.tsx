import { useNavigate } from "@solidjs/router";
import dayjs from "dayjs";
import { For, Show } from "solid-js";
import { WalletIcon } from "~/assets";
import { getDrawerSnapshot } from "~/db/cash-shifts";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { cn, formatRupiah } from "~/lib/utils";

/**
 * Toko open/close control on the home dashboard. Mirrors the cash-shift
 * state and routes to the register, which owns the open gate and the
 * setoran close flow (?closing=1) — one flow, two doorways.
 */
export const ShiftCard = () => {
  const navigate = useNavigate();
  const snapshotQuery = useDrizzleQuery(
    ["drizzle", "cash-shifts", "drawer"],
    () => getDrawerSnapshot()
  );
  const snapshot = () => snapshotQuery.data();
  const shift = () => snapshot()?.shift ?? null;
  const open = () => shift() != null;
  const drawerLabel = () =>
    formatRupiah((snapshot()?.expectedInDrawerMinorUnits ?? 0) / 100);
  const walletStrip = () => snapshot()?.wallets ?? [];
  const totalLabel = () =>
    formatRupiah(
      walletStrip().reduce((sum, w) => sum + w.balanceMinorUnits, 0) / 100
    );

  const openedSince = () => {
    const row = shift();
    if (!row) {
      return "";
    }
    return dayjs(row.openedAt).format("HH:mm");
  };

  return (
    <Show
      fallback={
        <div class="h-[88px] animate-pulse rounded-2xl border border-border bg-card" />
      }
      when={!snapshotQuery.loading() && snapshot() != null}
    >
      <div
        class={cn(
          "flex items-center gap-4 rounded-2xl border p-4 shadow-card transition duration-200 ease-standard",
          open()
            ? "border-success/25 bg-success/[0.04] hover:bg-success/[0.07]"
            : "border-border bg-card hover:border-primary/20 hover:bg-primary/[0.03]"
        )}
      >
        <span
          class={cn(
            "relative grid size-12 shrink-0 place-items-center rounded-full",
            open() ? "bg-success/12 text-success" : "bg-primary/10 text-primary"
          )}
        >
          <WalletIcon class="size-6" />
          <Show when={open()}>
            <span class="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-success" />
          </Show>
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="font-bold text-body text-foreground">
              {open() ? "Toko Buka" : "Toko Tutup"}
            </span>
            <Show when={open()}>
              <span class="truncate text-caption text-muted-foreground">
                sejak {openedSince()} · laci {drawerLabel()}
              </span>
            </Show>
          </div>
          <Show
            fallback={
              <p class="mt-0.5 truncate text-caption text-muted-foreground">
                {open()
                  ? "Setor dan tutup shift untuk mengakhiri hari"
                  : "Buka shift untuk mulai menerima transaksi"}
              </p>
            }
            when={open() && walletStrip().length > 0}
          >
            <p class="mt-0.5 truncate text-caption text-muted-foreground">
              <For each={walletStrip()}>
                {(wallet, i) => (
                  <>
                    <Show when={i() > 0}> · </Show>
                    {wallet.name} {formatRupiah(wallet.balanceMinorUnits / 100)}
                  </>
                )}
              </For>
              {" · Total "}
              {totalLabel()}
            </p>
          </Show>
        </div>

        <Show
          fallback={
            <button
              class="h-11 shrink-0 rounded-xl bg-primary px-5 font-bold text-body-sm text-primary-foreground shadow-card transition duration-200 ease-standard hover:bg-primary-hover active:scale-[0.98] active:bg-primary-active"
              onClick={() => navigate("/transactions/cash-register/shift-open")}
              type="button"
            >
              Buka Shift
            </button>
          }
          when={open()}
        >
          <button
            class="h-11 shrink-0 rounded-xl border border-success/40 bg-success/10 px-5 font-bold text-body-sm text-success transition duration-200 ease-standard hover:bg-success/20 active:scale-[0.98]"
            onClick={() => navigate("/transactions/cash-register/shift-close")}
            type="button"
          >
            Tutup Shift
          </button>
        </Show>
      </div>
    </Show>
  );
};
