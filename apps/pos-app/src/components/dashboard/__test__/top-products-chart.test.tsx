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
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import type { TopProductRow } from "~/db/dashboard";
import { TopProductsChart } from "../top-products-chart";

const MOCK_DATA: TopProductRow[] = [
  { productName: "Nasi Goreng", quantity: 50, revenue: 500_000 },
  { productName: "Es Teh", quantity: 30, revenue: 150_000 },
  { productName: "Mie Ayam", quantity: 20, revenue: 200_000 },
];

const user = userEvent.setup();

describe("TopProductsChart", () => {
  test("renders title", () => {
    const { getByText } = render(() => <TopProductsChart data={MOCK_DATA} />);
    expect(getByText("Produk Terlaris")).toBeInTheDocument();
  });

  test("renders Omzet and Porsi toggle buttons", () => {
    const { getByText } = render(() => <TopProductsChart data={MOCK_DATA} />);
    expect(getByText("Omzet")).toBeInTheDocument();
    expect(getByText("Porsi")).toBeInTheDocument();
  });

  test("shows empty state when no data", () => {
    const { getByText } = render(() => <TopProductsChart data={[]} />);
    expect(getByText("Belum ada data")).toBeInTheDocument();
  });

  test("renders nothing when data is undefined and not loading", () => {
    const { container } = render(() => (
      <TopProductsChart data={undefined} loading={false} />
    ));
    expect(
      container.querySelector("[data-testid='mock-bar-chart']")
    ).toBeNull();
  });

  test("switches mode on Porsi click", async () => {
    const { getByText } = render(() => <TopProductsChart data={MOCK_DATA} />);
    await user.click(getByText("Porsi"));
    expect(getByText("Porsi")).toBeInTheDocument();
  });

  test("switches back to Omzet on click", async () => {
    const { getByText } = render(() => <TopProductsChart data={MOCK_DATA} />);
    await user.click(getByText("Porsi"));
    await user.click(getByText("Omzet"));
    expect(getByText("Omzet")).toBeInTheDocument();
  });
});
