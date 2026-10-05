import { useSearchParams } from "@solidjs/router";
import dayjs from "dayjs";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { TabButton } from "~/components/ui/tabs";
import {
  getTransferCounterparties,
  getWalletLedger,
  getWalletsWithBalance,
  type WalletLedgerCursor,
  type WalletLedgerEntry,
} from "~/db/wallets";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { cn, formatRupiah } from "~/lib/utils";
import { WALLET_TYPE_META } from "./components/wallet-picker";

const TYPE_META: Record<
  WalletLedgerEntry["type"],
  { emoji: string; label: string }
> = {
  cash_in: { emoji: "➕", label: "MASUK" },
  cash_out: { emoji: "➖", label: "KELUAR" },
  reconciliation: { emoji: "📋", label: "OPNAME" },
  sale: { emoji: "🛒", label: "PENJUALAN" },
  transfer_in: { emoji: "↘️", label: "TRANSFER" },
  transfer_out: { emoji: "↗️", label: "TRANSFER" },
};

const DAY_LABEL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});
const TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

function dayLabel(isoDate: string): string {
  const today = dayjs().format("YYYY-MM-DD");
  if (isoDate === today) {
    return "Hari ini";
  }
  if (isoDate === dayjs().subtract(1, "day").format("YYYY-MM-DD")) {
    return "Kemarin";
  }
  return DAY_LABEL.format(dayjs(isoDate).toDate());
}

interface DayGroup {
  readonly entries: WalletLedgerEntry[];
  readonly key: string;
  readonly label: string;
}

function groupByDay(entries: readonly WalletLedgerEntry[]): DayGroup[] {
  const map = new Map<string, WalletLedgerEntry[]>();
  for (const entry of entries) {
    const key = entry.createdAt.slice(0, 10);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      entries: [...items].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
      key,
      label: dayLabel(key),
    }));
}

function entryDirection(entry: WalletLedgerEntry): "in" | "out" {
  if (entry.type === "reconciliation") {
    return entry.amountMinorUnits < 0 ? "out" : "in";
  }
  const inflow = ["cash_in", "sale", "transfer_in"].includes(entry.type);
  return inflow ? "in" : "out";
}

export default function WalletRiwayatPage() {
  const [params, setParams] = useSearchParams();
  const walletFilter = () =>
    typeof params.wallet === "string" && params.wallet ? params.wallet : null;

  const walletsQuery = useDrizzleQuery(["drizzle", "wallets", "list"], () =>
    getWalletsWithBalance()
  );
  const wallets = () => walletsQuery.data() ?? [];

  const [entries, setEntries] = createSignal<WalletLedgerEntry[]>([]);
  const [cursor, setCursor] = createSignal<WalletLedgerCursor | null>(null);
  const [loading, setLoading] = createSignal(false);

  const fetchPage = async (
    walletId: string | null,
    after: WalletLedgerCursor | null
  ) => {
    const page = await getWalletLedger({
      cursor: after ?? undefined,
      walletId: walletId ?? undefined,
    });
    return page;
  };

  const loadFirstPage = async (filter: string | null): Promise<void> => {
    setLoading(true);
    try {
      const page = await fetchPage(filter, null);
      setEntries(page.entries);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  };

  /* Initial + filter-change load — page 1 on every filter change. */
  createEffect(() => {
    const filter = walletFilter();
    loadFirstPage(filter).catch(() => {});
  });

  const loadMore = async () => {
    const next = cursor();
    if (!next || loading()) {
      return;
    }
    setLoading(true);
    try {
      const page = await fetchPage(walletFilter(), next);
      setEntries((prev) => [...prev, ...page.entries]);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  };

  /* Transfer counterparties for the loaded entries. */
  const counterpartiesQuery = useDrizzleQuery(
    ["drizzle", "wallets", "counterparties", () => entries().length],
    () =>
      getTransferCounterparties(
        entries()
          .filter((e) => e.referenceId && e.type.startsWith("transfer"))
          .map((e) => ({ referenceId: e.referenceId!, walletId: e.walletId }))
      )
  );

  const groups = createMemo(() => groupByDay(entries()));

  return (
    <SubPageShell
      backHref="/transactions/dompet"
      data-ssgoi-transition="/transactions/dompet/riwayat"
      title="Riwayat Dompet"
    >
      <div class="flex flex-1 flex-col overflow-hidden">
        <div class="shrink-0 px-4 pt-4 pb-3 lg:px-6">
          <div class="scrollbar-none flex gap-2 overflow-x-auto">
            <TabButton
              active={walletFilter() === null}
              onClick={() => setParams({ wallet: undefined })}
              shape="pill"
              tone="accent"
            >
              Semua
            </TabButton>
            <For each={wallets()}>
              {(wallet) => (
                <TabButton
                  active={walletFilter() === wallet.id}
                  onClick={() => setParams({ wallet: wallet.id })}
                  shape="pill"
                  tone="accent"
                >
                  {WALLET_TYPE_META[wallet.type].emoji} {wallet.name}
                </TabButton>
              )}
            </For>
          </div>
        </div>

        <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
          <Show
            fallback={
              <p class="py-20 text-center text-body-sm text-muted-foreground">
                {loading() ? "Memuat…" : "Belum ada aktivitas"}
              </p>
            }
            when={groups().length > 0}
          >
            <For each={groups()}>
              {(group) => (
                <div class="mb-4">
                  <p class="sticky top-0 z-10 mb-1.5 bg-background py-1 font-semibold text-caption-sm text-muted-foreground">
                    {group.label}
                  </p>
                  <div class="overflow-hidden rounded-xl border border-border">
                    <For each={group.entries}>
                      {(entry) => {
                        const dir = entryDirection(entry);
                        const meta = TYPE_META[entry.type];
                        const counterparty = entry.referenceId
                          ? counterpartiesQuery.data()?.get(entry.referenceId)
                          : undefined;
                        return (
                          <div class="flex items-start gap-3 border-border border-b p-3 last:border-b-0">
                            <span
                              aria-hidden="true"
                              class="text-lg leading-none"
                            >
                              {meta.emoji}
                            </span>
                            <div class="min-w-0 flex-1">
                              <div class="flex items-baseline justify-between gap-2">
                                <span class="truncate font-semibold text-body-sm text-foreground">
                                  {meta.label}
                                  <Show when={counterparty}>
                                    {" "}
                                    {entry.type === "transfer_out" ? "→" : "←"}{" "}
                                    {counterparty}
                                  </Show>
                                </span>
                                <span
                                  class={cn(
                                    "shrink-0 font-semibold text-body-sm tabular-nums",
                                    dir === "in"
                                      ? "text-success"
                                      : "text-danger"
                                  )}
                                >
                                  {dir === "in" ? "+" : "−"}
                                  {formatRupiah(
                                    Math.abs(entry.amountMinorUnits) / 100
                                  )}
                                </span>
                              </div>
                              <p class="text-caption-sm text-muted-foreground">
                                {entry.walletName} ·{" "}
                                {TIME_FMT.format(
                                  dayjs(entry.createdAt).toDate()
                                )}
                                <Show when={entry.category}>
                                  {" "}
                                  · {entry.category}
                                </Show>
                              </p>
                              <Show when={entry.notes}>
                                <p class="text-caption-sm text-faint-foreground">
                                  {entry.notes}
                                </p>
                              </Show>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
            <Show when={cursor()}>
              <div class="pb-2 text-center">
                <button
                  class="font-medium text-body-sm text-primary underline underline-offset-4"
                  disabled={loading()}
                  onClick={() => loadMore()}
                  type="button"
                >
                  {loading() ? "Memuat…" : "Muat lagi"}
                </button>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </SubPageShell>
  );
}
