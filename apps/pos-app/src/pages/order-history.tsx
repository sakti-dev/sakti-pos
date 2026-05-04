import dayjs from "dayjs";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	For,
	Show,
} from "solid-js";
import { toast } from "solid-sonner";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { DailySummaryBar } from "~/components/daily-summary";
import { AppShell } from "~/components/layout";
import { OrderCard } from "~/components/order-card";
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
import { currentUserRole } from "~/lib/auth";
import { useIsPhone } from "~/lib/responsive";
import { cn } from "~/lib/utils";

const statusOptions: SelectOption[] = [
	{ label: "Semua", value: "" },
	{ label: "Selesai", value: "completed" },
	{ label: "Batal", value: "cancelled" },
];

export default function OrderHistory() {
	const isPhone = useIsPhone();
	const today = () => dayjs().format("YYYY-MM-DD");

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
		toast.success("Pesanan dibatalkan");
	};

	return (
		<AppShell title="Riwayat Pesanan">
			<div class="space-y-3 p-4">
				<DailySummaryBar data={summary()} />

				<div
					class={cn(
						"sticky top-3 z-10 -mx-4 bg-background px-4 pb-3",
						"flex gap-2",
						isPhone() && "portrait:flex-col",
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
											<div class="rounded-xl border bg-card p-4">
												<div class="flex items-center justify-between">
													<Skeleton class="h-4 w-20" />
													<Skeleton class="h-4 w-16" />
												</div>
												<div class="mt-2 space-y-1">
													<Skeleton class="h-3 w-full" />
													<Skeleton class="h-3 w-2/3" />
												</div>
											</div>
										)}
									</For>
								</div>
							}
							when={orders() !== undefined}
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
