import { useSearchParams } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import { DashboardTab } from "./components/dashboard-tab";
import { GoodsReceiptTab } from "./components/goods-receipt-tab";
import { HistoryTab } from "./components/history-tab";
import { StocktakeTab } from "./components/stocktake-tab";

type TabKey = "dashboard" | "stocktake" | "goods-receipt" | "history";

const TABS: { label: string; value: TabKey }[] = [
  { label: "Daftar Stok", value: "dashboard" },
  { label: "Stock Opname", value: "stocktake" },
  { label: "Penerimaan Barang", value: "goods-receipt" },
  { label: "Riwayat", value: "history" },
];

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const active = createMemo<TabKey>(() => {
    const t = (params.tab as TabKey) ?? "dashboard";
    return TABS.some((x) => x.value === t) ? t : "dashboard";
  });

  return (
    <div
      class="flex flex-1 flex-col overflow-hidden"
      data-ssgoi-transition="/inventory"
    >
      <div class="relative shrink-0 border-border border-b">
        <Tabs
          class="flex flex-1 flex-col overflow-hidden"
          onChange={(v) => setParams({ tab: v })}
          value={active()}
        >
          <TabsList class="relative flex w-full">
            <For each={TABS}>
              {(t) => (
                <TabsTrigger class="flex-1" value={t.value}>
                  {t.label}
                </TabsTrigger>
              )}
            </For>
            <TabsIndicator class="bg-primary" />
          </TabsList>
        </Tabs>
      </div>

      <Show when={active() === "dashboard"}>
        <DashboardTab />
      </Show>
      <Show when={active() === "stocktake"}>
        <StocktakeTab />
      </Show>
      <Show when={active() === "goods-receipt"}>
        <GoodsReceiptTab />
      </Show>
      <Show when={active() === "history"}>
        <HistoryTab />
      </Show>
    </div>
  );
}
