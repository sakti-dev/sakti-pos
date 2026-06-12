import { createSignal, For, Show } from "solid-js";
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FileIcon,
  LoaderIcon,
  SearchIcon,
  XCircleIcon,
} from "~/assets";
import { AppShell } from "~/components/layout/app-shell";
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

const todayDate = () => {
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
  const [activeFilter, setActiveFilter] = createSignal<FilterKey>("all");
  const [search, setSearch] = createSignal("");

  const badgeCounts = (): Record<FilterKey, number> => {
    const counts: Record<FilterKey, number> = {
      all: sampleTxs.length,
      new: 0,
      processing: 0,
      waiting: 0,
      done: 0,
      cancelled: 0,
    };
    for (const tx of sampleTxs) {
      counts[tx.status]++;
    }
    return counts;
  };

  const filtered = (): readonly TxEntry[] =>
    sampleTxs.filter((tx) => {
      const matchFilter =
        activeFilter() === "all" || tx.status === activeFilter();
      const q = search().toLowerCase();
      const matchSearch =
        !q ||
        tx.id.toLowerCase().includes(q) ||
        tx.customer.toLowerCase().includes(q) ||
        tx.items.join(" ").toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });

  return (
    <AppShell activeNav="transactions">
      <div class="scrollbar-none flex flex-1 flex-col gap-5 overflow-y-auto px-7 pt-6 pb-24 max-[800px]:gap-4 max-[800px]:px-[18px] max-[800px]:pb-28 max-[900px]:pb-28">
        {/* Header */}
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="font-bold text-[22px] text-text tracking-[-0.01em] dark:text-[#ededed]">
              Transaksi
            </h1>
            <p class="mt-0.5 text-[13px] text-text-muted tracking-[0.02em] dark:text-[#707070]" />
          </div>
          <div class="flex items-center gap-1.5 font-medium text-[13px] text-text-secondary">
            <CalendarIcon class="h-3.5 w-3.5 text-text-muted" />
            <span>{todayDate()}</span>
          </div>
        </div>

        {/* Controls */}
        <div class="flex flex-wrap items-center gap-2.5 max-[600px]:flex-col max-[600px]:items-stretch">
          {/* Search */}
          <div class="flex min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2 transition-[border-color,box-shadow] duration-200 focus-within:border-[rgba(9,73,51,0.25)] focus-within:shadow-[0_0_0_3px_rgba(9,73,51,0.06)] max-[340px]:max-w-full dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1a1a1a] dark:focus-within:border-[rgba(60,208,112,0.30)] dark:focus-within:shadow-[0_0_0_3px_rgba(60,208,112,0.08)]">
            <SearchIcon class="h-4 w-4 shrink-0 text-text-muted" />
            <input
              aria-label="Cari transaksi"
              class="w-full border-none bg-transparent font-sans text-[14px] text-text outline-none placeholder:text-text-muted dark:text-[#f0f0f0]"
              onInput={(e) => setSearch(e.currentTarget.value)}
              placeholder="Cari ID, pelanggan, menu..."
              type="text"
            />
          </div>

          {/* Filter tabs */}
          <div class="flex gap-1.5 overflow-x-auto pb-0.5 max-[600px]:flex-wrap">
            <For each={FILTER_TABS}>
              {(tab) => {
                const isActive = () => activeFilter() === tab.key;
                return (
                  <Tab
                    active={isActive()}
                    class="tracking-[0.01em]"
                    onClick={() => setActiveFilter(tab.key)}
                    shape="pill"
                  >
                    {tab.label}
                    <span
                      class="ml-1.5 grid min-w-[18px] place-items-center rounded-full px-[5px] py-0 font-semibold text-[11px] tracking-[0.02em]"
                      classList={{
                        "bg-[rgba(255,255,255,0.20)]": isActive(),
                        "bg-surface-gray text-text-muted dark:bg-[rgba(255,255,255,0.20)] dark:text-[#ededed]":
                          !isActive(),
                      }}
                    >
                      {badgeCounts()[tab.key]}
                    </span>
                  </Tab>
                );
              }}
            </For>
          </div>
        </div>

        {/* Transaction list */}
        <div class="flex flex-col gap-2">
          <Show
            fallback={
              <div class="flex flex-col items-center gap-3 px-5 py-16 text-text-muted">
                <FileIcon class="h-12 w-12 opacity-40" />
                <div class="font-semibold text-[16px] text-text-secondary dark:text-[#a0a0a0]">
                  Tidak ada transaksi
                </div>
                <div class="max-w-[280px] text-center text-[13px] leading-relaxed tracking-[0.02em]">
                  Belum ada transaksi yang cocok dengan filter atau pencarian
                  Anda.
                </div>
              </div>
            }
            when={filtered().length > 0}
          >
            <For each={filtered()}>
              {(tx) => {
                const meta = STATUS_META[tx.status];
                const pill = STATUS_PILL[tx.status];
                const Icon = meta.Icon;
                return (
                  <button
                    class="flex w-full items-center gap-4 rounded-[14px] border border-border bg-surface px-5 py-4 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[rgba(9,73,51,0.15)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] active:translate-y-0 max-[600px]:flex-wrap max-[800px]:gap-3 max-[800px]:px-4 max-[800px]:py-3.5 dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1e1e1e] dark:hover:border-[rgba(255,255,255,0.12)] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.30)]"
                    type="button"
                  >
                    {/* Status icon */}
                    <div
                      class={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] ${meta.bg} ${meta.color} max-[800px]:h-[38px] max-[800px]:w-[38px]`}
                    >
                      <Icon class="h-5 w-5 max-[800px]:h-[17px] max-[800px]:w-[17px]" />
                    </div>

                    {/* Body */}
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-semibold text-[14px] text-text tabular-nums tracking-[-0.01em] dark:text-[#ededed]">
                          {tx.id}
                        </span>
                        <span class="text-[13px] text-text-secondary tracking-[0.02em] dark:text-[#a0a0a0]">
                          {tx.customer}
                        </span>
                      </div>
                      <div class="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-text-muted tracking-[0.02em] dark:text-[#707070]">
                        {formatItems(tx.items)}
                      </div>
                    </div>

                    {/* Meta */}
                    <div class="flex shrink-0 flex-col items-end gap-1 max-[600px]:w-full max-[600px]:flex-row max-[600px]:items-center max-[600px]:justify-between">
                      <span class="font-bold text-[15px] text-text tabular-nums tracking-[-0.01em] dark:text-[#ededed]">
                        {formatRupiah(tx.total)}
                      </span>
                      <div class="flex items-center gap-2">
                        <span class="text-[12px] text-text-muted tabular-nums tracking-[0.02em] dark:text-[#707070]">
                          {tx.time}
                        </span>
                        <span
                          class={`inline-flex items-center gap-[5px] rounded-pill px-2.5 py-[3px] font-semibold text-[11px] uppercase tracking-[0.06em] ${pill.bg} ${pill.color}`}
                        >
                          <span class="h-[5px] w-[5px] rounded-full bg-current" />
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </div>
    </AppShell>
  );
}
