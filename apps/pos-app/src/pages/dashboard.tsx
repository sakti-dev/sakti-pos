import { createMemo, createResource, createSignal } from "solid-js";
import { CategoryChart } from "~/components/dashboard/category-chart";
import { PaymentBreakdownChart } from "~/components/dashboard/payment-breakdown";
import { PeriodSelector } from "~/components/dashboard/period-selector";
import { RevenueChart } from "~/components/dashboard/revenue-chart";
import { SalesSummaryCards } from "~/components/dashboard/sales-summary-cards";
import { TopProductsChart } from "~/components/dashboard/top-products-chart";
import { AppShell } from "~/components/layout";
import {
	type DailyRow,
	getDailyBreakdown,
	getDashboardSummary,
	getHourlyBreakdown,
	getMonthlyBreakdown,
	getPaymentBreakdown,
	getSalesByCategory,
	getTopProducts,
	getWeeklyBreakdown,
	type HourlyRow,
	type MonthlyRow,
	type WeeklyRow,
} from "~/db/dashboard";
import {
	type DateRange,
	getChartGranularity,
	getPreviousRange,
	getTodayRange,
} from "~/lib/period";

export default function Dashboard() {
	const [range, setRange] = createSignal<DateRange>(getTodayRange());

	const prevRange = createMemo(() => getPreviousRange(range()));

	const rangeKey = createMemo(() => `${range().dateFrom}-${range().dateTo}`);
	const prevKey = createMemo(
		() => `${prevRange().dateFrom}-${prevRange().dateTo}`,
	);

	const safeSummary = async (from: string, to: string) => {
		try {
			return await getDashboardSummary(from, to);
		} catch {
			return { orderCount: 0, totalRevenue: 0, avgOrderValue: 0 };
		}
	};

	const [summary] = createResource(rangeKey, () =>
		safeSummary(range().dateFrom, range().dateTo),
	);
	const [prevSummary] = createResource(prevKey, () =>
		safeSummary(prevRange().dateFrom, prevRange().dateTo),
	);
	const [payment] = createResource(rangeKey, async () => {
		try {
			return await getPaymentBreakdown(range().dateFrom, range().dateTo);
		} catch {
			return { cashCount: 0, cashTotal: 0, qrisCount: 0, qrisTotal: 0 };
		}
	});
	const [topProducts] = createResource(rangeKey, async () => {
		try {
			return await getTopProducts(range().dateFrom, range().dateTo);
		} catch {
			return [];
		}
	});
	const [categorySales] = createResource(rangeKey, async () => {
		try {
			return await getSalesByCategory(range().dateFrom, range().dateTo);
		} catch {
			return [];
		}
	});

	const granularity = createMemo(() => getChartGranularity(range()));

	const [revenueData] = createResource(rangeKey, async () => {
		const g = granularity();
		const { dateFrom, dateTo } = range();
		try {
			let data: DailyRow[] | HourlyRow[] | MonthlyRow[] | WeeklyRow[];
			if (g === "hourly") {
				data = await getHourlyBreakdown(dateFrom, dateTo);
			} else if (g === "daily") {
				data = await getDailyBreakdown(dateFrom, dateTo);
			} else if (g === "weekly") {
				data = await getWeeklyBreakdown(dateFrom, dateTo);
			} else {
				data = await getMonthlyBreakdown(dateFrom, dateTo);
			}
			return { data, type: g };
		} catch {
			return { data: [], type: g };
		}
	});

	const loading = () => summary.loading;

	return (
		<AppShell title="Dasbor">
			<div class="space-y-4 p-4">
				<PeriodSelector onChange={setRange} value={range()} />

				<SalesSummaryCards
					loading={loading()}
					previous={prevSummary()}
					summary={summary()}
				/>

				<RevenueChart
					data={revenueData()?.data}
					loading={loading()}
					type={revenueData()?.type ?? "hourly"}
				/>

				<div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
					<div class="lg:col-span-7">
						<TopProductsChart data={topProducts()} loading={loading()} />
					</div>
					<div class="space-y-4 lg:col-span-5">
						<PaymentBreakdownChart data={payment()} loading={loading()} />
						<CategoryChart data={categorySales()} loading={loading()} />
					</div>
				</div>
			</div>
		</AppShell>
	);
}
