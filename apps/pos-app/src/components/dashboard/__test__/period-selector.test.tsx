import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, test } from "vitest";
import type { DateRange } from "~/lib/dashboard/period";
import { PeriodSelector } from "../period-selector";

const TODAY_RANGE: DateRange = {
  dateFrom: "2026-05-04",
  dateTo: "2026-05-04",
  preset: "today",
};

const user = userEvent.setup();

describe("PeriodSelector", () => {
  test("renders all preset buttons", () => {
    const { getByText } = render(() => (
      <PeriodSelector onChange={() => {}} value={TODAY_RANGE} />
    ));
    expect(getByText("Hari ini")).toBeInTheDocument();
    expect(getByText("Kemarin")).toBeInTheDocument();
    expect(getByText("Minggu ini")).toBeInTheDocument();
    expect(getByText("Bulan ini")).toBeInTheDocument();
    expect(getByText("Tahun ini")).toBeInTheDocument();
    expect(getByText("Kustom")).toBeInTheDocument();
  });

  test("calls onChange when clicking a preset", async () => {
    const onChange = vi.fn();
    const { getByText } = render(() => (
      <PeriodSelector onChange={onChange} value={TODAY_RANGE} />
    ));
    await user.click(getByText("Minggu ini"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].preset).toBe("week");
  });

  test("shows date pickers when Kustom is active", () => {
    const customRange: DateRange = {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-04",
      preset: "custom",
    };
    const { container } = render(() => (
      <PeriodSelector onChange={() => {}} value={customRange} />
    ));
    const inputs = container.querySelectorAll('input[type="date"]');
    expect(inputs).toHaveLength(2);
  });

  test("calls onChange with custom date range when date changes", () => {
    const [range, setRange] = createSignal<DateRange>({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-04",
      preset: "custom",
    });
    const onChange = vi.fn((r: DateRange) => setRange(r));
    const { container } = render(() => (
      <PeriodSelector onChange={onChange} value={range()} />
    ));

    const fromInput = container.querySelectorAll('input[type="date"]')[0];
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeInputValueSetter?.call(fromInput, "2026-04-28");
    fromInput.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].dateFrom).toBe("2026-04-28");
    expect(onChange.mock.calls[0][0].preset).toBe("custom");
  });
});
