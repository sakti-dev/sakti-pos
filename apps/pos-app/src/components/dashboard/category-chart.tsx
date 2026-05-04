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
import type { CategoryRevenueRow } from "~/db/dashboard";
import { useIsPhone } from "~/lib/responsive";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface CategoryChartProps {
	data?: CategoryRevenueRow[] | undefined;
	loading?: boolean;
}

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

const CategoryChart: Component<CategoryChartProps> = (props) => {
	const [mounted, setMounted] = createSignal(false);
	const isPhone = useIsPhone();

	onMount(() => setMounted(true));

	const chartData = () => ({
		datasets: [
			{
				backgroundColor: "oklch(0.65 0.18 250 / 0.7)",
				borderColor: "oklch(0.65 0.18 250)",
				borderWidth: 1,
				data: props.data?.map((r) => r.revenue) ?? [],
				label: "Pendapatan",
			},
		],
		labels: props.data?.map((r) => r.categoryName) ?? [],
	});

	return (
		<div class="rounded-xl border bg-card p-4">
			<h3 class="mb-3 font-medium text-sm">Penjualan per Kategori</h3>
			<Show
				fallback={<Skeleton class="h-48 w-full" />}
				when={
					!props.loading &&
					mounted() &&
					props.data !== undefined &&
					props.data.length > 0
				}
			>
				<div class="h-48">
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
										label: (ctx: { parsed: { x: number } }) => {
											const val = ctx.parsed.x;
											return ` ${new Intl.NumberFormat("id-ID", {
												maximumFractionDigits: 0,
												style: "currency",
												currency: "IDR",
											}).format(val)}`;
										},
									},
								},
							},
							scales: {
								x: {
									beginAtZero: true,
									ticks: {
										callback: (value: number) => formatRupiahAxis(value),
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

export { CategoryChart };
