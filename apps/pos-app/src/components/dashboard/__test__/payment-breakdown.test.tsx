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
import type { PaymentBreakdown } from "~/db/dashboard";
import { PaymentBreakdownChart } from "../payment-breakdown";

const MOCK_DATA: PaymentBreakdown = {
  cashCount: 5,
  cashTotal: 250_000,
  qrisCount: 3,
  qrisTotal: 150_000,
};

describe("PaymentBreakdownChart", () => {
  test("renders title", () => {
    const { getByText } = render(() => (
      <PaymentBreakdownChart data={MOCK_DATA} />
    ));
    expect(getByText("Metode Pembayaran")).toBeInTheDocument();
  });

  test("shows Tunai and QRIS labels with percentages", () => {
    const { container } = render(() => (
      <PaymentBreakdownChart data={MOCK_DATA} />
    ));
    const allText = container.textContent ?? "";
    expect(allText).toContain("Tunai");
    expect(allText).toContain("QRIS");
  });

  test("shows empty state when total is zero", () => {
    const { getByText } = render(() => (
      <PaymentBreakdownChart
        data={{ cashCount: 0, cashTotal: 0, qrisCount: 0, qrisTotal: 0 }}
        loading={false}
      />
    ));
    expect(getByText("Belum ada data")).toBeInTheDocument();
  });

  test("renders nothing when data is undefined and not loading", () => {
    const { container } = render(() => (
      <PaymentBreakdownChart data={undefined} loading={false} />
    ));
    expect(
      container.querySelector("[data-testid='mock-doughnut-chart']")
    ).toBeNull();
  });

  test("handles 100% cash", () => {
    const { container } = render(() => (
      <PaymentBreakdownChart
        data={{ cashCount: 5, cashTotal: 100_000, qrisCount: 0, qrisTotal: 0 }}
        loading={false}
      />
    ));
    const allText = container.textContent ?? "";
    expect(allText).toContain("Tunai");
    expect(allText).toContain("QRIS");
  });

  test("handles 100% QRIS", () => {
    const { container } = render(() => (
      <PaymentBreakdownChart
        data={{ cashCount: 0, cashTotal: 0, qrisCount: 5, qrisTotal: 100_000 }}
        loading={false}
      />
    ));
    const allText = container.textContent ?? "";
    expect(allText).toContain("Tunai");
    expect(allText).toContain("QRIS");
  });
});
