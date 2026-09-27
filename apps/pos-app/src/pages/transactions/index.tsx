import { A } from "@solidjs/router";
import dayjs from "dayjs";
import { createResource, createSignal, For, Show } from "solid-js";
import { BanknoteIcon, QrCodeIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import { FadeIn } from "~/components/ui/fade-in";
import { listRecentOrderEntries } from "~/db/orders";
import { useOrientation } from "~/lib/ui/use-orientation";
import { formatItems, formatRupiah } from "~/lib/utils";

const METHOD_META = {
  cash: { Icon: BanknoteIcon, label: "Tunai" },
  qris: { Icon: QrCodeIcon, label: "QRIS" },
  qris_static: { Icon: QrCodeIcon, label: "QRIS Statis" },
  qris_dynamic: { Icon: QrCodeIcon, label: "QRIS Dinamis" },
} as const;

export default function Transactions() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  const [search, setSearch] = createSignal("");

  const [entries] = createResource(() => listRecentOrderEntries());

  const filtered = () => {
    const q = search().toLowerCase();
    return (entries() ?? []).filter((e) => {
      if (!q) {
        return true;
      }
      return (
        e.order.orderNumber.toLowerCase().includes(q) ||
        e.items.some((i) => i.productName.toLowerCase().includes(q))
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

      {/* Search row */}
      <FadeIn
        class="flex shrink-0 flex-col gap-3 px-gutter pb-3 lg:px-6"
        delay={0.05}
        duration={0.4}
        enable={enable()}
        y={8}
      >
        <SearchBar
          onInput={setSearch}
          placeholder="Cari nomor atau item transaksi..."
          value={search()}
        />
      </FadeIn>

      {/* Transaction list */}
      <div class="scrollbar-none flex flex-1 flex-col gap-2 overflow-y-auto px-gutter pb-28 lg:px-6 lg:pb-24">
        <Show
          fallback={
            <div class="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
              <p class="text-faint-foreground text-sm">
                {entries.loading ? "Memuat transaksi…" : "Belum ada transaksi"}
              </p>
              <Show when={!entries.loading && (entries() ?? []).length === 0}>
                <A
                  class="font-medium text-body-sm text-primary underline underline-offset-4"
                  href="/transactions/cash-register"
                >
                  Mulai transaksi baru
                </A>
              </Show>
            </div>
          }
          when={filtered().length > 0}
        >
          <For each={filtered()}>
            {(entry, i) => {
              const meta =
                METHOD_META[entry.order.paymentMethod] ?? METHOD_META.cash;
              return (
                <FadeIn
                  class="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card"
                  delay={0.1 + i() * 0.03}
                  duration={0.35}
                  enable={enable()}
                  y={12}
                >
                  {/* Icon */}
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 dark:bg-accent">
                    <meta.Icon class="h-5 w-5 text-primary" />
                  </div>

                  {/* Body */}
                  <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate font-semibold text-foreground text-sm">
                        {entry.order.orderNumber}
                      </span>
                      <span class="shrink-0 font-semibold text-foreground text-sm">
                        {formatRupiah(entry.order.totalMinorUnits / 100)}
                      </span>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate text-faint-foreground text-xs">
                        {formatItems(entry.items.map((i) => i.productName))} ·{" "}
                        {dayjs(entry.order.createdAt).format("HH:mm")}
                      </span>
                      <span class="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 font-medium text-caption-sm text-primary dark:bg-accent dark:text-primary">
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
