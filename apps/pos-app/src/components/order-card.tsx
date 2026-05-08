import dayjs from "dayjs";
import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import type { OrderItemRow, OrderRow } from "~/db/orders";
import { cn, formatIDR } from "~/lib/utils";

interface OrderCardProps {
	items: OrderItemRow[];
	onCancel?: () => void;
	order: OrderRow;
}

export const OrderCard: Component<OrderCardProps> = (props) => {
	const [expanded, setExpanded] = createSignal(false);

	const time = () => dayjs(props.order.createdAt).format("HH:mm");

	return (
		<div class="rounded-xl border bg-card">
			<button
				class="flex w-full items-center gap-3 p-3 text-left active:bg-accent/80"
				onClick={() => setExpanded(!expanded())}
				type="button"
			>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="font-medium text-sm">{props.order.orderNumber}</span>
						<span class="text-muted-foreground text-xs">{time()}</span>
					</div>
					<div class="text-muted-foreground text-xs">
						{props.order.staffName}
					</div>
				</div>
				<div class="flex items-center gap-2">
					<span
						class={cn(
							"shrink-0 rounded-full px-2 py-0.5 font-medium text-xs",
							props.order.status === "completed"
								? "bg-success text-success-foreground"
								: "bg-destructive text-destructive-foreground",
						)}
					>
						{props.order.status === "completed" ? "Selesai" : "Batal"}
					</span>
					<span class="font-semibold text-sm">
						{formatIDR(props.order.total)}
					</span>
				</div>
			</button>

			<Show when={expanded()}>
				<div class="border-t px-3 pb-3">
					<div class="py-2">
						<For each={props.items}>
							{(item) => (
								<div class="flex justify-between py-1 text-sm">
									<span class="truncate">
										{item.productName} ×{item.quantity}
									</span>
									<span class="shrink-0 text-muted-foreground">
										{formatIDR(item.subtotal)}
									</span>
								</div>
							)}
						</For>
					</div>

					<div class="border-t py-2">
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Metode</span>
							<span class="font-medium">
								{props.order.paymentMethod === "cash" ? "Tunai" : "QRIS"}
							</span>
						</div>
						<Show
							when={
								props.order.paymentMethod === "cash" &&
								props.order.amountPaid != null
							}
						>
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Dibayar</span>
								<span>{formatIDR(props.order.amountPaid)}</span>
							</div>
							<Show
								when={
									props.order.changeAmount != null &&
									props.order.changeAmount > 0
								}
							>
								<div class="flex justify-between text-sm">
									<span class="text-muted-foreground">Kembalian</span>
									<span>{formatIDR(props.order.changeAmount)}</span>
								</div>
							</Show>
						</Show>
					</div>

					<Show when={props.onCancel && props.order.status === "completed"}>
						<button
							class="mt-1 w-full rounded-lg border border-destructive/30 py-2 font-medium text-destructive text-sm active:bg-destructive/10"
							onClick={props.onCancel}
							type="button"
						>
							Batalkan Pesanan
						</button>
					</Show>
				</div>
			</Show>
		</div>
	);
};
