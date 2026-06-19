import { createSignal, For, Show } from "solid-js";
import {
  CheckCircleIcon,
  ClockIcon,
  FileIcon,
  LoaderIcon,
  XCircleIcon,
} from "~/assets";
import { SearchBar } from "~/components/search-bar";
import { FadeIn } from "~/components/ui/fade-in";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  type FilterKey,
  sampleTransactions,
  type TxStatus,
  transactionFilterCounts,
} from "~/lib/data/transactions";
import { useOrientation } from "~/lib/ui/use-orientation";

/* ── constants ────────────────────────────────────────────────── */

const STATUS_META: Record<
  TxStatus,
  { Icon: typeof FileIcon; bg: string; color: string; label: string }
> = {
  new: {
    Icon: FileIcon,
    bg: "bg-accent/10 dark:bg-accent",
    color: "text-primary",
    label: "Baru",
  },
  processing: {
    Icon: LoaderIcon,
    bg: "bg-status-processing/25 dark:bg-status-processing",
    color: "text-status-processing-foreground",
    label: "Diproses",
  },
  waiting: {
    Icon: ClockIcon,
    bg: "bg-status-warning/15 dark:bg-status-warning",
    color: "text-status-warning dark:text-status-warning-foreground",
    label: "Menunggu",
  },
  done: {
    Icon: CheckCircleIcon,
    bg: "bg-status-success/10 dark:bg-status-success",
    color: "text-status-success dark:text-status-success-foreground",
    label: "Selesai",
  },
  cancelled: {
    Icon: XCircleIcon,
    bg: "bg-status-danger/10 dark:bg-status-danger",
    color: "text-status-danger dark:text-status-danger-foreground",
    label: "Batal",
  },
};

const STATUS_PILL: Record<TxStatus, { bg: string; color: string }> = {
  new: {
    bg: "bg-accent/10 dark:bg-accent",
    color: "text-primary",
  },
  processing: {
    bg: "bg-status-processing/25 dark:bg-status-processing",
    color: "text-status-processing-foreground",
  },
  waiting: {
    bg: "bg-status-warning/15 dark:bg-status-warning",
    color: "text-status-warning dark:text-status-warning-foreground",
  },
  done: {
    bg: "bg-status-success/10 dark:bg-status-success",
    color: "text-status-success dark:text-status-success-foreground",
  },
  cancelled: {
    bg: "bg-status-danger/10 dark:bg-status-danger",
    color: "text-status-danger dark:text-status-danger-foreground",
  },
};

const FILTER_TABS: readonly { key: FilterKey; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "new", label: "Baru" },
  { key: "processing", label: "Diproses" },
  { key: "waiting", label: "Menunggu" },
  { key: "done", label: "Selesai" },
  { key: "cancelled", label: "Batal" },
] as const;

/* ── helpers ──────────────────────────────────────────────────── */

import { formatItems, formatRupiah } from "~/lib/utils";

/* ── component ────────────────────────────────────────────────── */

export default function Transactions() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  const [search, setSearch] = createSignal("");
  const [filter, setFilter] = createSignal<FilterKey>("all");

  const filtered = () => {
    const q = search().toLowerCase();
    const f = filter();
    return sampleTransactions.filter((tx) => {
      if (f !== "all" && tx.status !== f) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        tx.id.toLowerCase().includes(q) || tx.customer.toLowerCase().includes(q)
      );
    });
  };

  return (
    <div
      class="flex flex-1 flex-col overflow-hidden"
      data-ssgoi-transition="/transactions"
    >
      {/* Header bar */}
      <FadeIn
        class="flex shrink-0 items-center gap-3 px-gutter pt-5 pb-3 lg:px-6"
        duration={0.35}
        enable={enable()}
        y={-8}
      >
        <h1 class="font-bold font-display text-foreground text-heading-sm">
          Transaksi
        </h1>
      </FadeIn>

      {/* Search + filter row */}
      <FadeIn
        class="flex shrink-0 flex-col gap-3 px-gutter pb-3 lg:px-6"
        delay={0.05}
        duration={0.4}
        enable={enable()}
        y={8}
      >
        {/* Search field */}
        <SearchBar
          onInput={setSearch}
          placeholder="Cari transaksi..."
          value={search()}
        />

        {/* Filter tabs */}
        <Tabs
          class="scrollbar-none overflow-x-auto"
          onChange={(v) => setFilter(v as FilterKey)}
          value={filter()}
        >
          <TabsList class="flex gap-2">
            <For each={FILTER_TABS}>
              {(tab) => (
                <TabsTrigger
                  aria-label={tab.label}
                  shape="pill"
                  tone="accent"
                  value={tab.key}
                  variant="pill"
                >
                  {tab.label}
                  <span class="text-caption-sm opacity-70">
                    ({transactionFilterCounts[tab.key]})
                  </span>
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
      </FadeIn>

      {/* Transaction list */}
      <div class="scrollbar-none flex flex-1 flex-col gap-2 overflow-y-auto px-gutter pb-28 lg:px-6 lg:pb-24">
        <Show keyed when={filter()}>
          <Show
            fallback={
              <div class="flex flex-1 items-center justify-center py-20 text-faint-foreground text-sm">
                Tidak ada transaksi ditemukan
              </div>
            }
            when={filtered().length > 0}
          >
            <For each={filtered()}>
              {(tx, i) => {
                const meta = STATUS_META[tx.status];
                const pill = STATUS_PILL[tx.status];
                return (
                  <FadeIn
                    class="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card"
                    delay={0.1 + i() * 0.03}
                    duration={0.35}
                    enable={enable()}
                    y={12}
                  >
                    {/* Icon */}
                    <div
                      class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}
                    >
                      <meta.Icon class={`h-5 w-5 ${meta.color}`} />
                    </div>

                    {/* Body */}
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                      <div class="flex items-center justify-between gap-2">
                        <span class="truncate font-semibold text-foreground text-sm">
                          {tx.customer}
                        </span>
                        <span class="shrink-0 font-semibold text-foreground text-sm">
                          {formatRupiah(tx.total)}
                        </span>
                      </div>
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-faint-foreground text-xs">
                          {formatItems(tx.items)} · {tx.time}
                        </span>
                        <span
                          class={`shrink-0 rounded-full px-2.5 py-0.5 font-medium text-caption-sm ${pill.bg} ${pill.color}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  </FadeIn>
                );
              }}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  );
}
