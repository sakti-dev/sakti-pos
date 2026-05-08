import {
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	LinearScale,
	Tooltip,
} from "chart.js";
import { Bar } from "solid-chartjs";
import type { Component } from "solid-js";
import { createSignal, onMount, Show } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import type { TopProductRow } from "~/db/dashboard";
import { cn } from "~/lib/utils";
import { useIsPhone } from "~/store/responsive";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface TopProductsChartProps {
	data?: TopProductRow[] | undefined;
	loading?: boolean;
}

type SortMode = "quantity" | "revenue";

function formatRupiahAxis(value: number): string {
	if (value === 0) {
		return "0";
	}
	if (value >= 1_000_000) {
		return `${value / 1_000_000}jt`;
	}
	if (value >= 1000) {
		return `${value / 1000}rb`;
	}
	return String(value);
}

const TopProductsChart: Component<TopProductsChartProps> = (props) => {
	const [mounted, setMounted] = createSignal(false);
	const [mode, setMode] = createSignal<SortMode>("revenue");
	const isPhone = useIsPhone();

	onMount(() => setMounted(true));

	const sortedData = () => {
		const raw = props.data;
		if (!raw) {
			return [];
		}
		return [...raw].sort((a, b) =>
			mode() === "revenue" ? b.revenue - a.revenue : b.quantity - a.quantity,
		);
	};

	const chartData = () => ({
		datasets: [
			{
				backgroundColor:
					mode() === "revenue"
						? "oklch(0.6 0.15 145 / 0.7)"
						: "oklch(0.65 0.18 250 / 0.7)",
				borderColor:
					mode() === "revenue" ? "oklch(0.6 0.15 145)" : "oklch(0.65 0.18 250)",
				borderWidth: 1,
				data: sortedData().map((r) =>
					mode() === "revenue" ? r.revenue : r.quantity,
				),
				label: mode() === "revenue" ? "Omzet" : "Porsi",
			},
		],
		labels: sortedData().map((r) => r.productName),
	});

	return (
		<div class="rounded-xl border bg-card p-4">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="font-medium text-sm">Produk Terlaris</h3>
				<div class="flex rounded-md overflow-hidden border border-input">
					<button
						class={cn(
							"px-2.5 py-1 font-medium text-xs transition-colors",
							mode() === "revenue"
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
						onClick={() => setMode("revenue")}
						type="button"
					>
						Omzet
					</button>
					<button
						class={cn(
							"px-2.5 py-1 font-medium text-xs transition-colors",
							mode() === "quantity"
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
						onClick={() => setMode("quantity")}
						type="button"
					>
						Porsi
					</button>
				</div>
			</div>
			<Show
				fallback={<Skeleton class="h-64 w-full" />}
				when={
					!props.loading &&
					mounted() &&
					props.data !== undefined &&
					props.data.length > 0
				}
			>
				<div class="h-64">
					<Bar
						data={chartData()}
						options={{
							indexAxis: "y",
							responsive: true,
							maintainAspectRatio: false,
							plugins: {
								legend: { display: false },
								tooltip: {
									callbacks: {
										label: (ctx: {
											dataIndex: number;
											parsed: { x: number };
										}) => {
											const val = ctx.parsed.x;
											const item = sortedData()[ctx.dataIndex];
											if (mode() === "revenue") {
												const formatted = new Intl.NumberFormat("id-ID", {
													maximumFractionDigits: 0,
													style: "currency",
													currency: "IDR",
												}).format(val);
												return ` ${formatted} (${item?.quantity ?? 0} pcs)`;
											}
											return ` ${val} pcs (Rp ${(item?.revenue ?? 0).toLocaleString("id-ID")})`;
										},
									},
								},
							},
							scales: {
								x: {
									beginAtZero: true,
									ticks: {
										callback: (value: number) =>
											mode() === "revenue"
												? formatRupiahAxis(value)
												: String(value),
										maxTicksLimit: isPhone() ? 5 : undefined,
									},
								},
								y: {
									grid: { display: false },
								},
							},
						}}
					/>
				</div>
			</Show>
			<Show
				when={
					!props.loading &&
					(props.data === undefined || props.data.length === 0)
				}
			>
				<p class="py-8 text-center text-muted-foreground text-sm">
					Belum ada data
				</p>
			</Show>
		</div>
	);
};

export { TopProductsChart };
