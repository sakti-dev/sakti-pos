import { createSignal, For, Show } from "solid-js";
import {
  CheckCircleIcon,
  ClockIcon,
  FileIcon,
  LoaderIcon,
  SearchIcon,
  XCircleIcon,
} from "~/assets";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";

/* ── types ────────────────────────────────────────────────────── */

type TxStatus = "new" | "processing" | "waiting" | "done" | "cancelled";
type FilterKey = "all" | TxStatus;

interface TxEntry {
  readonly customer: string;
  readonly id: string;
  readonly items: readonly string[];
  readonly status: TxStatus;
  readonly time: string;
  readonly total: number;
}

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

const FILTER_TABS: readonly { key: FilterKey; label: string; total: number }[] =
  [
    { key: "all", label: "Semua", total: 100 },
    { key: "new", label: "Baru", total: 20 },
    { key: "processing", label: "Diproses", total: 30 },
    { key: "waiting", label: "Menunggu", total: 5 },
    { key: "done", label: "Selesai", total: 92 },
    { key: "cancelled", label: "Batal", total: 0 },
  ];

/* ── sample data (matches reference) ──────────────────────────── */

const sampleTxs: readonly TxEntry[] = [
  {
    id: "TX-20260611-001",
    customer: "Meja 3",
    items: ["Es Kopi Susu", "Nasi Goreng Spesial"],
    total: 68_000,
    status: "new",
    time: "08:42",
  },
  {
    id: "TX-20260611-002",
    customer: "Budi Santoso",
    items: ["Matcha Latte", "Roti Bakar"],
    total: 52_000,
    status: "processing",
    time: "08:35",
  },
  {
    id: "TX-20260611-003",
    customer: "Meja 7",
    items: ["Americano", "Cappuccino", "Cheesecake"],
    total: 115_000,
    status: "waiting",
    time: "08:28",
  },
  {
    id: "TX-20260611-004",
    customer: "Sari Dewi",
    items: ["Teh Tarik"],
    total: 22_000,
    status: "done",
    time: "08:15",
  },
  {
    id: "TX-20260611-005",
    customer: "Walk-in",
    items: ["Kopi Tubruk", "Pisang Goreng"],
    total: 35_000,
    status: "done",
    time: "08:02",
  },
  {
    id: "TX-20260611-006",
    customer: "Meja 1",
    items: ["Latte", "Sandwich Club"],
    total: 78_000,
    status: "processing",
    time: "07:55",
  },
  {
    id: "TX-20260611-007",
    customer: "Andi Pratama",
    items: ["Es Teh Manis"],
    total: 12_000,
    status: "cancelled",
    time: "07:48",
  },
  {
    id: "TX-20260611-008",
    customer: "Meja 5",
    items: ["Mocha Frappe", "Brownies", "Es Jeruk"],
    total: 95_000,
    status: "new",
    time: "07:30",
  },
  {
    id: "TX-20260611-009",
    customer: "Rina Kartika",
    items: ["Caramel Macchiato", "Croissant"],
    total: 62_000,
    status: "done",
    time: "07:15",
  },
  {
    id: "TX-20260611-010",
    customer: "Meja 2",
    items: ["Ayam Geprek", "Es Jeruk Segar"],
    total: 48_000,
    status: "waiting",
    time: "07:05",
  },
  {
    id: "TX-20260611-011",
    customer: "Dian Lestari",
    items: ["Flat White"],
    total: 32_000,
    status: "done",
    time: "06:50",
  },
  {
    id: "TX-20260611-012",
    customer: "Meja 9",
    items: ["Nasi Goreng Spesial", "Es Kopi Susu", "Es Teh Tarik"],
    total: 92_000,
    status: "processing",
    time: "06:35",
  },
];

/* ── helpers ──────────────────────────────────────────────────── */

import { formatItems, formatRupiah } from "~/lib/utils";

/* ── component ────────────────────────────────────────────────── */

export default function Transactions() {
  const [search, setSearch] = createSignal("");
  const [filter, setFilter] = createSignal<FilterKey>("all");

  const filtered = () => {
    const q = search().toLowerCase();
    const f = filter();
    return sampleTxs.filter((tx) => {
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
        duration={0.35}
        y={-8}
        class="flex shrink-0 items-center gap-3 px-6 pt-5 pb-3 max-[800px]:px-[18px]"
      >
        <h1 class="font-bold font-display text-foreground text-heading-sm">
          Transaksi
        </h1>
      </FadeIn>

      {/* Search + filter row */}
      <FadeIn
        delay={0.05}
        duration={0.4}
        y={8}
        class="flex shrink-0 flex-col gap-3 px-6 pb-3 max-[800px]:px-[18px]"
      >
        {/* Search field */}
        <label class="flex items-center gap-2 rounded-xl bg-card px-4 py-2.5 shadow-card">
          <SearchIcon class="h-4 w-4 shrink-0 text-faint-foreground" />
          <input
            class="w-full bg-transparent text-foreground text-sm outline-none placeholder:text-faint-foreground"
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="Cari transaksi..."
            type="text"
            value={search()}
          />
        </label>

        {/* Filter tabs */}
        <div class="scrollbar-none flex gap-1.5 overflow-x-auto">
          <For each={FILTER_TABS}>
            {(tab) => (
              <Button
                aria-label={tab.label}
                class="flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-left font-semibold text-body-sm max-[900px]:whitespace-nowrap max-[900px]:px-3 max-[900px]:py-2 max-[900px]:text-caption"
                look={filter() === tab.key ? "soft" : "outline"}
                onClick={() => setFilter(tab.key)}
                size="none"
                tone={filter() === tab.key ? "primary" : "neutral"}
                type="button"
              >
                {tab.label}&nbsp;
                <span class="text-caption-sm">({tab.total})</span>
              </Button>
            )}
          </For>
        </div>
      </FadeIn>

      {/* Transaction list */}
      <div class="scrollbar-none flex flex-1 flex-col gap-2 overflow-y-auto px-6 pb-24 max-[800px]:px-[18px] max-[900px]:pb-28">
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
                  delay={0.1 + i() * 0.03}
                  duration={0.35}
                  y={12}
                  class="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card"
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
      </div>
    </div>
  );
}
