import type { Component } from "solid-js";
import { Show } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import type { DashboardSummary } from "~/db/dashboard";
import { formatIDR } from "~/lib/utils";

interface SalesSummaryCardsProps {
	loading?: boolean;
	previous?: DashboardSummary | undefined;
	summary?: DashboardSummary | undefined;
}

function formatDelta(
	current: number,
	previous: number,
): {
	label: string;
	type: "down" | "neutral" | "up";
} {
	if (previous === 0) {
		if (current === 0) {
			return { label: "0%", type: "neutral" };
		}
		return { label: "\u25B2 Baru", type: "up" };
	}
	const pct = Math.round(((current - previous) / previous) * 100);
	if (pct > 0) {
		return { label: `\u25B2 +${pct}%`, type: "up" };
	}
	if (pct < 0) {
		return { label: `\u25BC ${pct}%`, type: "down" };
	}
	return { label: "0%", type: "neutral" };
}

const deltaColor = (type: "down" | "neutral" | "up") => {
	switch (type) {
		case "up":
			return "text-[oklch(0.6_0.15_145)]";
		case "down":
			return "text-destructive";
		default:
			return "text-muted-foreground";
	}
};

export const SalesSummaryCards: Component<SalesSummaryCardsProps> = (props) => {
	const delta = () =>
		props.summary && props.previous
			? formatDelta(props.summary.totalRevenue, props.previous.totalRevenue)
			: undefined;

	return (
		<div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
			<Show
				fallback={
					<>
						<div class="rounded-xl border bg-card p-3">
							<Skeleton class="mb-1 h-3 w-20" />
							<Skeleton class="h-6 w-28" />
						</div>
						<div class="rounded-xl border bg-card p-3">
							<Skeleton class="mb-1 h-3 w-20" />
							<Skeleton class="h-6 w-16" />
						</div>
						<div class="rounded-xl border bg-card p-3">
							<Skeleton class="mb-1 h-3 w-24" />
							<Skeleton class="h-6 w-24" />
						</div>
						<div class="rounded-xl border bg-card p-3">
							<Skeleton class="mb-1 h-3 w-24" />
							<Skeleton class="h-6 w-16" />
						</div>
					</>
				}
				when={!props.loading}
			>
				<div class="rounded-xl border bg-card p-3">
					<p class="text-muted-foreground text-xs">Total Pendapatan</p>
					<p class="font-bold text-lg text-primary">
						{formatIDR(props.summary?.totalRevenue)}
					</p>
				</div>
				<div class="rounded-xl border bg-card p-3">
					<p class="text-muted-foreground text-xs">Jumlah Pesanan</p>
					<p class="font-bold text-lg">{props.summary?.orderCount ?? 0}</p>
				</div>
				<div class="rounded-xl border bg-card p-3">
					<p class="text-muted-foreground text-xs">Rata-rata/Pesanan</p>
					<p class="font-bold">{formatIDR(props.summary?.avgOrderValue)}</p>
				</div>
				<div class="rounded-xl border bg-card p-3">
					<p class="text-muted-foreground text-xs">vs Periode Lalu</p>
					<p
						class={`font-bold text-lg ${deltaColor(delta()?.type ?? "neutral")}`}
					>
						{delta()?.label ?? "-"}
					</p>
				</div>
			</Show>
		</div>
	);
};
