import dayjs from "dayjs";
import "dayjs/locale/id";
import { Bar } from "solid-chartjs";
import type { Component } from "solid-js";
import { createMemo, Match, Show, Switch } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import type {
	DailyRow,
	HourlyRow,
	MonthlyRow,
	WeeklyRow,
} from "~/db/dashboard";
import { formatRupiahAxis } from "~/lib/chart-setup";
import type { ChartGranularity } from "~/lib/period";
import { useIsPhone } from "~/store/responsive";

dayjs.locale("id");

type RevenueData = DailyRow[] | HourlyRow[] | MonthlyRow[] | WeeklyRow[];

interface RevenueChartProps {
	data?: RevenueData;
	loading?: boolean;
	type: ChartGranularity;
}

const HIGHLIGHT_BG = "oklch(0.65 0.2 30 / 0.85)";
const HIGHLIGHT_BORDER = "oklch(0.65 0.2 30)";
const DEFAULT_BG = "oklch(0.55 0.18 250 / 0.7)";
const DEFAULT_BORDER = "oklch(0.55 0.18 250)";

const title = (type: ChartGranularity): string => {
	switch (type) {
		case "hourly":
			return "Pendapatan per Jam";
		case "daily":
			return "Pendapatan per Hari";
		case "weekly":
			return "Pendapatan per Minggu";
		case "monthly":
			return "Pendapatan per Bulan";
	}
};

function getLabel(
	row: HourlyRow | DailyRow | WeeklyRow | MonthlyRow,
	type: ChartGranularity,
	index: number,
): string {
	if (type === "hourly") {
		return String((row as HourlyRow).hour).padStart(2, "0");
	}
	if (type === "daily") {
		return dayjs((row as DailyRow).date).format("DD MMM");
	}
	if (type === "weekly") {
		return `Mg ${index + 1}`;
	}
	return dayjs((row as MonthlyRow).month).format("MMM");
}

export const RevenueChart: Component<RevenueChartProps> = (props) => {
	const isPhone = useIsPhone();

	const hasData = () => props.data?.some((r) => r.revenue > 0);

	const processedData = createMemo(() => {
		const raw = props.data;
		if (!raw) {
			return { data: [] as RevenueData, topHours: new Set<number>() };
		}

		if (props.type === "hourly") {
			const hourly = raw as HourlyRow[];
			const withRevenue = hourly.filter((r) => r.revenue > 0);
			if (withRevenue.length === 0) {
				return { data: raw, topHours: new Set<number>() };
			}

			const minHour = Math.max(
				0,
				Math.min(...withRevenue.map((r) => r.hour)) - 1,
			);
			const maxHour = Math.min(
				23,
				Math.max(...withRevenue.map((r) => r.hour)) + 1,
			);
			const sliced = hourly.filter(
				(r) => r.hour >= minHour && r.hour <= maxHour,
			);

			const sorted = [...withRevenue].sort((a, b) => b.revenue - a.revenue);
			const topHours = new Set(sorted.slice(0, 3).map((r) => r.hour));

			return { data: sliced, topHours };
		}

		return { data: raw, topHours: new Set<number>() };
	});

	const chartData = () => {
		const { data, topHours } = processedData();
		return {
			datasets: [
				{
					backgroundColor: data.map((r) =>
						props.type === "hourly" && topHours.has((r as HourlyRow).hour)
							? HIGHLIGHT_BG
							: DEFAULT_BG,
					),
					borderColor: data.map((r) =>
						props.type === "hourly" && topHours.has((r as HourlyRow).hour)
							? HIGHLIGHT_BORDER
							: DEFAULT_BORDER,
					),
					borderWidth: 1,
					data: data.map((r) => r.revenue),
					label: "Pendapatan",
				},
			],
			labels: data.map((r, i) => getLabel(r, props.type, i)),
		};
	};

	return (
		<div class="rounded-xl border bg-card p-4">
			<h3 class="mb-3 font-medium text-sm">{title(props.type)}</h3>
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
						<Match when={hasData()}>
							<div class="overflow-x-auto">
								<div class="h-48 min-w-[400px]">
									<Bar
										data={chartData()}
										options={{
											responsive: true,
											maintainAspectRatio: false,
											plugins: {
												legend: { display: false },
												tooltip: {
													callbacks: {
														label: (ctx: { parsed: { y: number } }) => {
															const val = ctx.parsed.y;
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
													grid: { display: false },
													ticks: {
														maxRotation: isPhone() ? 45 : 0,
														maxTicksLimit: isPhone() ? 8 : undefined,
													},
												},
												y: {
													beginAtZero: true,
													ticks: {
														callback: (value: number) =>
															formatRupiahAxis(value),
													},
												},
											},
										}}
									/>
								</div>
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
