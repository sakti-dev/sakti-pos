import { render } from "@solidjs/testing-library";
import { describe, expect, test } from "vitest";
import type { DashboardSummary } from "~/db/dashboard";
import { SalesSummaryCards } from "../sales-summary-cards";

const SUMMARY: DashboardSummary = {
	avgOrderValue: 15_000,
	orderCount: 10,
	totalRevenue: 150_000,
};

const PREV_SUMMARY: DashboardSummary = {
	avgOrderValue: 12_000,
	orderCount: 8,
	totalRevenue: 120_000,
};

describe("SalesSummaryCards", () => {
	test("renders skeleton when loading", () => {
		const { container } = render(() => <SalesSummaryCards loading={true} />);
		expect(container.querySelectorAll(".animate-pulse")).toHaveLength(8);
	});

	test("renders summary data when loaded", () => {
		const { getByText } = render(() => (
			<SalesSummaryCards loading={false} summary={SUMMARY} />
		));
		expect(getByText("Total Pendapatan")).toBeInTheDocument();
		expect(getByText("Jumlah Pesanan")).toBeInTheDocument();
		expect(getByText("10")).toBeInTheDocument();
		expect(getByText("Rata-rata/Pesanan")).toBeInTheDocument();
		expect(getByText("vs Periode Lalu")).toBeInTheDocument();
	});

	test("shows dash when no previous data", () => {
		const { getByText } = render(() => (
			<SalesSummaryCards loading={false} summary={SUMMARY} />
		));
		expect(getByText("-")).toBeInTheDocument();
	});

	test("shows positive delta with up arrow", () => {
		const { getByText } = render(() => (
			<SalesSummaryCards
				loading={false}
				previous={PREV_SUMMARY}
				summary={SUMMARY}
			/>
		));
		expect(getByText(/\u25B2 \+25%/)).toBeInTheDocument();
	});

	test("shows negative delta with down arrow", () => {
		const { getByText } = render(() => (
			<SalesSummaryCards
				loading={false}
				previous={SUMMARY}
				summary={PREV_SUMMARY}
			/>
		));
		expect(getByText(/\u25BC -20%/)).toBeInTheDocument();
	});

	test("shows zero delta when equal", () => {
		const { getByText } = render(() => (
			<SalesSummaryCards loading={false} previous={SUMMARY} summary={SUMMARY} />
		));
		expect(getByText("0%")).toBeInTheDocument();
	});

	test("shows Baru when previous is zero but current is not", () => {
		const { getByText } = render(() => (
			<SalesSummaryCards
				loading={false}
				previous={{ avgOrderValue: 0, orderCount: 0, totalRevenue: 0 }}
				summary={SUMMARY}
			/>
		));
		expect(getByText(/\u25B2 Baru/)).toBeInTheDocument();
	});

	test("shows 0% when both current and previous are zero", () => {
		const { getByText } = render(() => (
			<SalesSummaryCards
				loading={false}
				previous={{ avgOrderValue: 0, orderCount: 0, totalRevenue: 0 }}
				summary={{ avgOrderValue: 0, orderCount: 0, totalRevenue: 0 }}
			/>
		));
		expect(getByText("0%")).toBeInTheDocument();
	});

	test("renders zeros when no summary data", () => {
		const { queryAllByText } = render(() => (
			<SalesSummaryCards loading={false} />
		));
		const zeroes = queryAllByText("0");
		expect(zeroes.length).toBeGreaterThan(0);
	});
});
