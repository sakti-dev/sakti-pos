import { useSearchParams } from "@solidjs/router";
import { createMemo, For } from "solid-js";
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import { DashboardTab } from "./components/dashboard-tab";
import { GoodsReceiptTab } from "./components/goods-receipt-tab";
import { HistoryTab } from "./components/history-tab";
import { StocktakeTab } from "./components/stocktake-tab";

type TabKey = "dashboard" | "goods-receipt" | "history" | "stocktake";

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
      <Tabs
        class="flex flex-1 flex-col overflow-hidden"
        onChange={(v) => setParams({ tab: v })}
        value={active()}
      >
        <div class="relative shrink-0 border-border border-b">
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
        </div>

        <TabsContent class="flex-1 overflow-hidden" value="dashboard">
          <DashboardTab />
        </TabsContent>
        <TabsContent class="flex-1 overflow-hidden" value="stocktake">
          <StocktakeTab />
        </TabsContent>
        <TabsContent class="flex-1 overflow-hidden" value="goods-receipt">
          <GoodsReceiptTab />
        </TabsContent>
        <TabsContent class="flex-1 overflow-hidden" value="history">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
