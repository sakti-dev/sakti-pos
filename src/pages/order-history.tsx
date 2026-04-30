import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
} from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { DailySummaryBar } from "~/components/daily-summary";
import { AppShell } from "~/components/layout";
import { OrderCard } from "~/components/order-card";
import { Select, type SelectOption } from "~/components/ui/select";
import {
  cancelOrder,
  getDailySummary,
  getOrderItems,
  getOrders,
  type OrderItemRow,
  type OrderRow,
} from "~/db/orders";
import { currentUserRole } from "~/lib/auth";

const statusOptions: SelectOption[] = [
  { label: "Semua", value: "" },
  { label: "Selesai", value: "completed" },
  { label: "Batal", value: "cancelled" },
];

export default function OrderHistory() {
  const today = () => new Date().toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = createSignal(today());
  const [dateTo, setDateTo] = createSignal(today());
  const [statusFilter, setStatusFilter] = createSignal("");

  const filter = createMemo(() => ({
    dateFrom: dateFrom(),
    dateTo: dateTo(),
    status:
      statusFilter() === ""
        ? undefined
        : (statusFilter() as "completed" | "cancelled"),
  }));

  const [orders, { refetch }] = createResource(filter, getOrders);
  const [summary] = createResource(dateFrom, getDailySummary);

  const [orderItemsCache, setOrderItemsCache] = createSignal<
    Record<number, OrderItemRow[]>
  >({});
  const [cancelTarget, setCancelTarget] = createSignal<OrderRow | undefined>();

  createEffect(() => {
    const orderList = orders();
    if (!orderList) {
      return;
    }
    const cache = orderItemsCache();
    for (const order of orderList) {
      if (!cache[order.id]) {
        getOrderItems(order.id).then((items) => {
          setOrderItemsCache((prev) => ({ ...prev, [order.id]: items }));
        });
      }
    }
  });

  const canCancel = () => {
    const role = currentUserRole();
    return role === "owner" || role === "manager";
  };

  const handleCancel = async () => {
    const target = cancelTarget();
    if (!target) {
      return;
    }
    await cancelOrder(target.id);
    setCancelTarget(undefined);
    setOrderItemsCache((prev) => {
      const next = { ...prev };
      delete next[target.id];
      return next;
    });
    await refetch();
  };

  return (
    <AppShell title="Riwayat Pesanan">
      <div class="space-y-3 p-4">
        <DailySummaryBar data={summary()} />

        <div class="flex items-center gap-2">
          <input
            class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
            max={today()}
            onChange={(e) => setDateFrom(e.currentTarget.value)}
            type="date"
            value={dateFrom()}
          />
          <span class="text-muted-foreground text-sm">s/d</span>
          <input
            class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
            max={today()}
            onChange={(e) => setDateTo(e.currentTarget.value)}
            type="date"
            value={dateTo()}
          />
          <div class="w-28">
            <Select
              onChange={(v) => setStatusFilter(String(v))}
              options={statusOptions}
              value={statusFilter()}
            />
          </div>
        </div>

        <Show
          fallback={
            <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>Belum ada pesanan</p>
            </div>
          }
          when={orders() && orders()!.length > 0}
        >
          <div class="space-y-2">
            <For each={orders()}>
              {(order) => (
                <OrderCard
                  items={orderItemsCache()[order.id] ?? []}
                  onCancel={
                    canCancel() ? () => setCancelTarget(order) : undefined
                  }
                  order={order}
                />
              )}
            </For>
          </div>
        </Show>
      </div>

      <ConfirmDrawer
        confirmLabel="Batalkan"
        message={`Batalkan pesanan ${cancelTarget()?.orderNumber}?`}
        onClose={() => setCancelTarget(undefined)}
        onConfirm={handleCancel}
        open={!!cancelTarget()}
        title="Batalkan Pesanan"
        variant="destructive"
      />
    </AppShell>
  );
}
