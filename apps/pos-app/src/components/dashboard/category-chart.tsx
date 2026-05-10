import { Bar } from "solid-chartjs";
import type { Component } from "solid-js";
import { Match, Show, Switch } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import type { CategoryRevenueRow } from "~/db/dashboard";
import { formatRupiahAxis } from "~/lib/dashboard/chart-setup";
import { useIsPhone } from "~/store/responsive";

interface CategoryChartProps {
	data?: CategoryRevenueRow[] | undefined;
	loading?: boolean;
}

export const CategoryChart: Component<CategoryChartProps> = (props) => {
	const isPhone = useIsPhone();

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
				when={props.loading}
				fallback={
					<Switch
						fallback={
							<p class="py-8 text-center text-muted-foreground text-sm">
								Belum ada data
							</p>
						}
					>
						<Match when={props.data && props.data.length > 0}>
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
						</Match>
					</Switch>
				}
			>
				<Skeleton class="h-48 w-full" />
			</Show>
		</div>
	);
};
