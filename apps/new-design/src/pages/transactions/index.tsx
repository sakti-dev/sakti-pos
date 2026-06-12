import { motion } from "motion-solidjs";
import { createSignal, For, Show } from "solid-js";
import {
  CheckCircleIcon,
  ClockIcon,
  FileIcon,
  LoaderIcon,
  SearchIcon,
  XCircleIcon,
} from "~/assets";
import { Tab } from "~/components/ui/tab";

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
    bg: "bg-[rgba(60,208,112,0.12)] dark:bg-[rgba(60,208,112,0.15)]",
    color: "text-[#094933] dark:text-[#3cd070]",
    label: "Baru",
  },
  processing: {
    Icon: LoaderIcon,
    bg: "bg-[rgba(255,233,92,0.25)] dark:bg-[rgba(250,204,21,0.12)]",
    color: "text-[#7a5f00] dark:text-[#fde68a]",
    label: "Diproses",
  },
  waiting: {
    Icon: ClockIcon,
    bg: "bg-[rgba(230,168,23,0.12)] dark:bg-[rgba(251,146,60,0.12)]",
    color: "text-[#b8860b] dark:text-[#fed7aa]",
    label: "Menunggu",
  },
  done: {
    Icon: CheckCircleIcon,
    bg: "bg-[rgba(46,125,50,0.10)] dark:bg-[rgba(74,222,128,0.12)]",
    color: "text-[#2e7d32] dark:text-[#86efac]",
    label: "Selesai",
  },
  cancelled: {
    Icon: XCircleIcon,
    bg: "bg-[rgba(192,57,43,0.08)] dark:bg-[rgba(248,113,113,0.12)]",
    color: "text-[#c0392b] dark:text-[#fca5a5]",
    label: "Batal",
  },
};

const STATUS_PILL: Record<TxStatus, { bg: string; color: string }> = {
  new: {
    bg: "bg-[rgba(60,208,112,0.12)] dark:bg-[rgba(60,208,112,0.15)]",
    color: "text-[#094933] dark:text-[#3cd070]",
  },
  processing: {
    bg: "bg-[rgba(255,233,92,0.25)] dark:bg-[rgba(250,204,21,0.12)]",
    color: "text-[#7a5f00] dark:text-[#fde68a]",
  },
  waiting: {
    bg: "bg-[rgba(230,168,23,0.12)] dark:bg-[rgba(251,146,60,0.12)]",
    color: "text-[#b8860b] dark:text-[#fed7aa]",
  },
  done: {
    bg: "bg-[rgba(46,125,50,0.10)] dark:bg-[rgba(74,222,128,0.12)]",
    color: "text-[#2e7d32] dark:text-[#86efac]",
  },
  cancelled: {
    bg: "bg-[rgba(192,57,43,0.08)] dark:bg-[rgba(248,113,113,0.12)]",
    color: "text-[#c0392b] dark:text-[#fca5a5]",
  },
};

const FILTER_TABS: readonly { key: FilterKey; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "new", label: "Baru" },
  { key: "processing", label: "Diproses" },
  { key: "waiting", label: "Menunggu" },
  { key: "done", label: "Selesai" },
  { key: "cancelled", label: "Batal" },
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

const _todayDate = () => {
  const d = new Date();
  const days = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ] as const;
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ] as const;
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

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
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        class="flex shrink-0 items-center gap-3 px-6 pt-5 pb-3 max-[800px]:px-[18px]"
        initial={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 class="font-bold font-display text-[22px] text-text tracking-[-0.01em] dark:text-[#ededed]">
          Transaksi
        </h1>
      </motion.div>

      {/* Search + filter row */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        class="flex shrink-0 flex-col gap-3 px-6 pb-3 max-[800px]:px-[18px]"
        initial={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      >
        {/* Search field */}
        <label class="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:bg-[#1a1a1a]">
          <SearchIcon class="h-4 w-4 shrink-0 text-text-muted" />
          <input
            class="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted dark:text-[#ededed]"
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
              <Tab
                active={filter() === tab.key}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
              </Tab>
            )}
          </For>
        </div>
      </motion.div>

      {/* Transaction list */}
      <div class="scrollbar-none flex flex-1 flex-col gap-2 overflow-y-auto px-6 pb-24 max-[800px]:px-[18px] max-[900px]:pb-28">
        <Show
          fallback={
            <div class="flex flex-1 items-center justify-center py-20 text-sm text-text-muted">
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
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  class="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:bg-[#1a1a1a]"
                  initial={{ opacity: 0, y: 12 }}
                  transition={{
                    duration: 0.35,
                    ease: [0.22, 1, 0.36, 1],
                    delay: 0.1 + i() * 0.03,
                  }}
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
                      <span class="truncate font-semibold text-sm text-text dark:text-[#ededed]">
                        {tx.customer}
                      </span>
                      <span class="shrink-0 font-semibold text-sm text-text dark:text-[#ededed]">
                        {formatRupiah(tx.total)}
                      </span>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-text-muted text-xs">
                        {formatItems(tx.items)} · {tx.time}
                      </span>
                      <span
                        class={`shrink-0 rounded-full px-2.5 py-0.5 font-medium text-[11px] ${pill.bg} ${pill.color}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
}
