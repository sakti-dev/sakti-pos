vi.mock("chart.js", () => ({
  ArcElement: {},
  BarElement: {},
  CategoryScale: {},
  Chart: { register: vi.fn() },
  LinearScale: {},
  Tooltip: {},
}));

vi.mock("solid-chartjs", () => ({
  Bar: vi.fn((props) => (
    <div data-index={props.options?.indexAxis} data-testid="mock-bar-chart" />
  )),
  Doughnut: vi.fn((_props) => <div data-testid="mock-doughnut-chart" />),
}));

import { render } from "@solidjs/testing-library";
import { describe, expect, test } from "vitest";
import type {
  DailyRow,
  HourlyRow,
  MonthlyRow,
  WeeklyRow,
} from "~/db/dashboard";
import { RevenueChart } from "../revenue-chart";

const HOURLY_DATA: HourlyRow[] = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  revenue: i >= 8 && i <= 16 ? 100_000 : 0,
}));

const DAILY_DATA: DailyRow[] = [
  { date: "2026-05-04", revenue: 54_000 },
  { date: "2026-05-05", revenue: 30_000 },
];

const WEEKLY_DATA: WeeklyRow[] = [
  { weekStart: "2026-05-04", revenue: 200_000 },
  { weekStart: "2026-05-11", revenue: 150_000 },
];

const MONTHLY_DATA: MonthlyRow[] = [
  { month: "2026-05", revenue: 1_000_000 },
  { month: "2026-06", revenue: 800_000 },
];

describe("RevenueChart", () => {
  test("renders hourly title", () => {
    const { getByText } = render(() => (
      <RevenueChart data={HOURLY_DATA} loading={false} type="hourly" />
    ));
    expect(getByText("Pendapatan per Jam")).toBeInTheDocument();
  });

  test("renders daily title", () => {
    const { getByText } = render(() => (
      <RevenueChart data={DAILY_DATA} loading={false} type="daily" />
    ));
    expect(getByText("Pendapatan per Hari")).toBeInTheDocument();
  });

  test("renders weekly title", () => {
    const { getByText } = render(() => (
      <RevenueChart data={WEEKLY_DATA} loading={false} type="weekly" />
    ));
    expect(getByText("Pendapatan per Minggu")).toBeInTheDocument();
  });

  test("renders monthly title", () => {
    const { getByText } = render(() => (
      <RevenueChart data={MONTHLY_DATA} loading={false} type="monthly" />
    ));
    expect(getByText("Pendapatan per Bulan")).toBeInTheDocument();
  });

  test("shows empty state when all zeros", () => {
    const emptyHourly: HourlyRow[] = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      revenue: 0,
    }));
    const { getByText } = render(() => (
      <RevenueChart data={emptyHourly} loading={false} type="hourly" />
    ));
    expect(getByText("Belum ada data")).toBeInTheDocument();
  });

  test("renders nothing when data is undefined and not loading", () => {
    const { container } = render(() => (
      <RevenueChart data={undefined} loading={false} type="hourly" />
    ));
    expect(
      container.querySelector("[data-testid='mock-bar-chart']")
    ).toBeNull();
  });

  test("has scrollable container for overflow on mobile", () => {
    const { container } = render(() => (
      <RevenueChart data={HOURLY_DATA} type="hourly" />
    ));
    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).toBeInTheDocument();
  });
});
