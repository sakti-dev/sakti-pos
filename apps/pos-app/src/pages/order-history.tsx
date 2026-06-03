import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { DailySummaryBar } from "~/components/daily-summary";
import { AppShell } from "~/components/layout";
import { OrderCard } from "~/components/order-card";
import { Card } from "~/components/ui/card";
import { DatePicker } from "~/components/ui/date-picker";
import { Select, type SelectOption } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  cancelOrder,
  getDailySummary,
  getOrderItems,
  getOrders,
  type OrderItemRow,
  type OrderRow,
} from "~/db/orders";
import { getBusinessDate } from "~/lib/date-time";
import { useDrizzleQuery } from "~/lib/use-drizzle-query";
import { cn } from "~/lib/utils";
import { currentUserRole } from "~/store/auth";
import { currentOutletTimezone } from "~/store/outlet";
import { useIsPhone } from "~/store/responsive";

const statusOptions: SelectOption[] = [
  { label: "Semua", value: "" },
  { label: "Selesai", value: "completed" },
  { label: "Batal", value: "cancelled" },
];

export default function OrderHistory() {
  const isPhone = useIsPhone();
  const today = () => getBusinessDate(currentOutletTimezone());

  const [dateFrom, setDateFrom] = createSignal(today());
  const [dateTo, setDateTo] = createSignal(today());
  const [statusFilter, setStatusFilter] = createSignal("");
  const timezone = currentOutletTimezone;

  const filter = createMemo(() => ({
    dateFrom: dateFrom(),
    dateTo: dateTo(),
    timezone: timezone(),
    status:
      statusFilter() === ""
        ? undefined
        : (statusFilter() as "completed" | "cancelled"),
  }));

  const ordersQuery = useDrizzleQuery(filter, () =>
    getOrders(
      {
        dateFrom: filter().dateFrom,
        dateTo: filter().dateTo,
        status: filter().status,
      },
      filter().timezone
    )
  );
  const summaryQuery = useDrizzleQuery(
    () => `${dateFrom()}-${timezone()}`,
    () => getDailySummary(dateFrom(), timezone())
  );

  const [orderItemsCache, setOrderItemsCache] = createSignal<
    Record<string, OrderItemRow[]>
  >({});
  const [cancelTarget, setCancelTarget] = createSignal<OrderRow | undefined>();

  createEffect(() => {
    const orderList = ordersQuery.data();
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
    return role === "manager" || role === "owner";
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
    await ordersQuery.refetch();
    toast.success("Pesanan dibatalkan");
  };

  return (
    <AppShell title="Riwayat Pesanan">
      <div class="space-y-3 p-4">
        <DailySummaryBar data={summaryQuery.data()} />

        <div
          class={cn(
            "sticky top-3 z-10 -mx-4 bg-background px-4 pb-3",
            "flex gap-2",
            isPhone() && "portrait:flex-col"
          )}
        >
          <div class="flex items-center gap-2">
            <DatePicker
              class={cn(isPhone() && "portrait:flex-1")}
              max={today()}
              onChange={setDateFrom}
              value={dateFrom()}
            />
            <span class="text-muted-foreground text-sm">s/d</span>
            <DatePicker
              class={cn(isPhone() && "portrait:flex-1")}
              max={today()}
              onChange={setDateTo}
              value={dateTo()}
            />
          </div>
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
            <Show
              fallback={
                <div class="space-y-2">
                  <For each={[1, 2, 3]}>
                    {() => (
                      <Card>
                        <div class="flex items-center justify-between">
                          <Skeleton class="h-4 w-20" />
                          <Skeleton class="h-4 w-16" />
                        </div>
                        <div class="mt-2 space-y-1">
                          <Skeleton class="h-3 w-full" />
                          <Skeleton class="h-3 w-2/3" />
                        </div>
                      </Card>
                    )}
                  </For>
                </div>
              }
              when={ordersQuery.data() !== undefined}
            >
              <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>
                  {statusFilter()
                    ? "Tidak ada pesanan dengan filter ini"
                    : "Belum ada pesanan"}
                </p>
              </div>
            </Show>
          }
          when={ordersQuery.data() && ordersQuery.data()!.length > 0}
        >
          <div class="space-y-2">
            <For each={ordersQuery.data()}>
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
