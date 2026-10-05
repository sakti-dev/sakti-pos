import { A } from "@solidjs/router";
import dayjs from "dayjs";
import { FiArrowRight, FiMinus, FiPlus, FiRepeat } from "solid-icons/fi";
import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  getWalletLedger,
  getWalletsWithBalance,
  type WalletLedgerEntry,
  type WalletRow,
} from "~/db/wallets";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { cn, formatRupiah } from "~/lib/utils";
import { type MovementMode, MovementSheet } from "./components/movement-sheet";
import { TransferSheet } from "./components/transfer-sheet";
import { WALLET_TYPE_META } from "./components/wallet-picker";

const TYPE_LABEL: Record<WalletLedgerEntry["type"], string> = {
  cash_in: "Masuk",
  cash_out: "Keluar",
  reconciliation: "Opname",
  sale: "Penjualan",
  transfer_in: "Transfer Masuk",
  transfer_out: "Transfer Keluar",
};

const TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

function entryDirection(entry: WalletLedgerEntry): "in" | "out" {
  if (entry.type === "reconciliation") {
    return entry.amountMinorUnits < 0 ? "out" : "in";
  }
  return ["cash_in", "sale", "transfer_in"].includes(entry.type) ? "in" : "out";
}

export default function DompetPage() {
  const walletsQuery = useDrizzleQuery(["drizzle", "wallets", "list"], () =>
    getWalletsWithBalance()
  );
  const recentQuery = useDrizzleQuery(["drizzle", "wallets", "recent"], () =>
    getWalletLedger({ limit: 5 })
  );
  const wallets = (): WalletRow[] => walletsQuery.data() ?? [];
  const recent = (): WalletLedgerEntry[] => recentQuery.data()?.entries ?? [];
  const total = () =>
    wallets().reduce((sum, w) => sum + w.currentBalanceMinorUnits, 0);

  const [movementOpen, setMovementOpen] = createSignal(false);
  const [movementMode, setMovementMode] = createSignal<MovementMode>("cash_in");
  const [transferOpen, setTransferOpen] = createSignal(false);

  const openMovement = (mode: MovementMode) => {
    setMovementMode(mode);
    setMovementOpen(true);
  };

  return (
    <div
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-ssgoi-transition="/transactions/dompet"
    >
      <header class="shrink-0 px-4 pt-5 pb-3 lg:px-6">
        <h1 class="font-bold text-foreground text-heading-sm">Dompet</h1>
        <p class="mt-0.5 text-body-sm text-muted-foreground">
          Semua uang dan pergerakannya
        </p>
      </header>

      <div class="scrollbar-none flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-24">
        {/* Total */}
        <div class="rounded-2xl border border-border bg-card p-4">
          <p class="text-caption text-muted-foreground">Total</p>
          <p class="font-bold text-foreground text-heading-sm tabular-nums">
            {formatRupiah(total() / 100)}
          </p>
          <div class="mt-3 flex gap-2">
            <Button
              class="flex-1"
              look="outline"
              onClick={() => openMovement("cash_in")}
              size="sm"
              tone="primary"
            >
              <FiPlus class="h-4 w-4" /> Masuk
            </Button>
            <Button
              class="flex-1"
              look="outline"
              onClick={() => openMovement("cash_out")}
              size="sm"
              tone="danger"
            >
              <FiMinus class="h-4 w-4" /> Keluar
            </Button>
            <Button
              class="flex-1"
              look="outline"
              onClick={() => setTransferOpen(true)}
              size="sm"
              tone="neutral"
            >
              <FiRepeat class="h-4 w-4" /> Transfer
            </Button>
          </div>
        </div>

        {/* Wallet rows */}
        <div class="overflow-hidden rounded-xl border border-border">
          <For
            each={wallets()}
            fallback={
              <p class="p-4 text-center text-body-sm text-muted-foreground">
                {walletsQuery.loading()
                  ? "Memuat dompet…"
                  : "Belum ada dompet — pastikan perangkat tersinkron"}
              </p>
            }
          >
            {(wallet) => (
              <A
                class="flex items-center justify-between border-border border-b p-3 last:border-b-0 hover:bg-muted/40"
                href={`/transactions/dompet/riwayat?wallet=${wallet.id}`}
              >
                <span class="flex items-center gap-2.5">
                  <span aria-hidden="true" class="text-lg leading-none">
                    {WALLET_TYPE_META[wallet.type].emoji}
                  </span>
                  <span>
                    <span class="block font-semibold text-body-sm text-foreground">
                      {wallet.name}
                    </span>
                    <span class="block text-caption text-muted-foreground">
                      {WALLET_TYPE_META[wallet.type].label}
                    </span>
                  </span>
                </span>
                <span class="flex items-center gap-2">
                  <span class="font-semibold text-body-sm text-foreground tabular-nums">
                    {formatRupiah(wallet.currentBalanceMinorUnits / 100)}
                  </span>
                  <FiArrowRight class="h-4 w-4 text-muted-foreground" />
                </span>
              </A>
            )}
          </For>
        </div>

        {/* Aktivitas Terakhir — flat, no day headers */}
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <p class="font-semibold text-caption text-muted-foreground">
              Aktivitas Terakhir
            </p>
            <A
              class="flex items-center gap-1 font-medium text-caption text-primary"
              href="/transactions/dompet/riwayat"
            >
              Riwayat lengkap <FiArrowRight class="h-3 w-3" />
            </A>
          </div>
          <div class="overflow-hidden rounded-xl border border-border">
            <Show
              fallback={
                <p class="p-4 text-center text-body-sm text-muted-foreground">
                  Belum ada aktivitas
                </p>
              }
              when={recent().length > 0}
            >
              <For each={recent()}>
                {(entry) => {
                  const dir = entryDirection(entry);
                  return (
                    <div class="flex items-center justify-between border-border border-b p-3 last:border-b-0">
                      <div class="min-w-0">
                        <p class="truncate font-medium text-body-sm text-foreground">
                          {TYPE_LABEL[entry.type]}
                        </p>
                        <p class="truncate text-caption text-muted-foreground">
                          {entry.walletName} ·{" "}
                          {TIME_FMT.format(dayjs(entry.createdAt).toDate())}
                          <Show when={entry.notes}> · {entry.notes}</Show>
                        </p>
                      </div>
                      <span
                        class={cn(
                          "shrink-0 font-semibold text-body-sm tabular-nums",
                          dir === "in" ? "text-success" : "text-danger"
                        )}
                      >
                        {dir === "in" ? "+" : "−"}
                        {formatRupiah(Math.abs(entry.amountMinorUnits) / 100)}
                      </span>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>
      </div>

      <MovementSheet
        mode={movementMode()}
        onClose={() => setMovementOpen(false)}
        open={movementOpen()}
      />
      <TransferSheet
        onClose={() => setTransferOpen(false)}
        open={transferOpen()}
      />
    </div>
  );
}
