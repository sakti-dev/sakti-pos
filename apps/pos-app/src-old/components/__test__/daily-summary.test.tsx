import { render } from "@solidjs/testing-library";
import { describe, expect, test } from "vitest";
import type { DailySummary } from "~/db/orders";
import { DailySummaryBar } from "../daily-summary";

const REVENUE_80K = /Rp 80\.000/;
const REVENUE_50K = /Rp 50\.000/;
const REVENUE_30K = /Rp 30\.000/;

const mockSummary: DailySummary = {
  cashTotal: 50_000,
  orderCount: 5,
  qrisTotal: 30_000,
  totalRevenue: 80_000,
};

describe("DailySummaryBar", () => {
  test("renders nothing when data is undefined", () => {
    const { container } = render(() => <DailySummaryBar data={undefined} />);
    expect(container.textContent).toBe("");
  });

  test("renders summary data when provided", () => {
    const { getByText } = render(() => <DailySummaryBar data={mockSummary} />);
    expect(getByText("5")).toBeInTheDocument();
    expect(getByText(REVENUE_80K)).toBeInTheDocument();
    expect(getByText(REVENUE_50K)).toBeInTheDocument();
    expect(getByText(REVENUE_30K)).toBeInTheDocument();
  });
});
