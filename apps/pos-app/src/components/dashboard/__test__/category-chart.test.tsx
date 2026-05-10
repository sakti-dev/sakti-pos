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
import type { CategoryRevenueRow } from "~/db/dashboard";
import { CategoryChart } from "../category-chart";

const MOCK_DATA: CategoryRevenueRow[] = [
  { categoryName: "Makanan", revenue: 500_000 },
  { categoryName: "Minuman", revenue: 300_000 },
];

describe("CategoryChart", () => {
  test("renders title", () => {
    const { getByText } = render(() => <CategoryChart data={MOCK_DATA} />);
    expect(getByText("Penjualan per Kategori")).toBeInTheDocument();
  });

  test("shows empty state when no data", () => {
    const { getByText } = render(() => <CategoryChart data={[]} />);
    expect(getByText("Belum ada data")).toBeInTheDocument();
  });

  test("renders nothing when data is undefined and not loading", () => {
    const { container } = render(() => (
      <CategoryChart data={undefined} loading={false} />
    ));
    expect(
      container.querySelector("[data-testid='mock-bar-chart']")
    ).toBeNull();
  });
});
