import { CategoryChart } from "~/components/dashboard/category-chart";
import { PaymentBreakdownChart } from "~/components/dashboard/payment-breakdown";
import { PeriodSelector } from "~/components/dashboard/period-selector";
import { RevenueChart } from "~/components/dashboard/revenue-chart";
import { SalesSummaryCards } from "~/components/dashboard/sales-summary-cards";
import { TopProductsChart } from "~/components/dashboard/top-products-chart";
import { AppShell } from "~/components/layout";
import { createSignal } from "solid-js";
import type {
	CategoryRevenueRow,
	DashboardSummary,
	DailyRow,
	HourlyRow,
	MonthlyRow,
	PaymentBreakdown,
	TopProductRow,
	WeeklyRow,
} from "~/db/dashboard";
import { getTodayRange, type DateRange } from "~/lib/period";
import { useDashboardData } from "./use-dashboard-data";

type RevenueData = {
	data: DailyRow[] | HourlyRow[] | MonthlyRow[] | WeeklyRow[];
	type: "hourly" | "daily" | "weekly" | "monthly";
};

interface DashboardViewProps {
	categorySales: CategoryRevenueRow[];
	loading: boolean;
	onRangeChange: (range: DateRange) => void;
	payment: PaymentBreakdown;
	prevSummary: DashboardSummary;
	range: DateRange;
	revenueData: RevenueData;
	summary: DashboardSummary;
	topProducts: TopProductRow[];
}

function DashboardView(props: DashboardViewProps) {
	return (
		<AppShell title="Dasbor">
			<div class="space-y-4 p-4">
				<PeriodSelector onChange={props.onRangeChange} value={props.range} />

				<SalesSummaryCards
					loading={props.loading}
					previous={props.prevSummary}
					summary={props.summary}
				/>

				<RevenueChart
					data={props.revenueData.data}
					loading={props.loading}
					type={props.revenueData.type}
				/>

				<div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
					<div class="lg:col-span-7">
						<TopProductsChart data={props.topProducts} loading={props.loading} />
					</div>
					<div class="space-y-4 lg:col-span-5">
						<PaymentBreakdownChart data={props.payment} loading={props.loading} />
						<CategoryChart data={props.categorySales} loading={props.loading} />
					</div>
				</div>
			</div>
		</AppShell>
	);
}

export default function Dashboard() {
	const [range, setRange] = createSignal<DateRange>(getTodayRange());
	const dashboard = useDashboardData(range);

	return (
		<DashboardView
			categorySales={dashboard.categorySales()}
			loading={dashboard.loading()}
			onRangeChange={setRange}
			payment={dashboard.payment()}
			prevSummary={dashboard.prevSummary()}
			range={range()}
			revenueData={dashboard.revenueData()}
			summary={dashboard.summary()}
			topProducts={dashboard.topProducts()}
		/>
	);
}
