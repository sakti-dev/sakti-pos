import dayjs from "dayjs";
import { describe, expect, test } from "vitest";
import { shiftBusinessDate } from "~/lib/date-time";
import {
  type DateRange,
  getChartGranularity,
  getMonthRange,
  getPreviousRange,
  getTodayRange,
  getWeekRange,
  getYearRange,
  getYesterdayRange,
} from "../period";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

describe("getTodayRange", () => {
  test("returns today as both from and to", () => {
    const range = getTodayRange();
    expect(range.dateFrom).toBe(range.dateTo);
    expect(range.preset).toBe("today");
    expect(range.dateFrom).toMatch(DATE_PATTERN);
  });
});

describe("getYesterdayRange", () => {
  test("returns yesterday as both from and to with preset 'yesterday'", () => {
    const range = getYesterdayRange();
    const today = getTodayRange().dateFrom;
    expect(range.dateFrom).toBe(range.dateTo);
    expect(range.preset).toBe("yesterday");
    expect(range.dateFrom).toBe(shiftBusinessDate(today, -1));
  });
});

describe("getWeekRange", () => {
  test("returns Monday to Sunday with preset 'week'", () => {
    const range = getWeekRange();
    expect(range.preset).toBe("week");
    const monday = new Date(range.dateFrom);
    const sunday = new Date(range.dateTo);
    expect(monday.getDay()).toBe(1);
    expect(sunday.getDay()).toBe(0);
  });
});

describe("getMonthRange", () => {
  test("returns first and last day of current month", () => {
    const range = getMonthRange();
    expect(range.preset).toBe("month");
    const first = dayjs(range.dateFrom);
    const last = dayjs(range.dateTo);
    expect(first.date()).toBe(1);
    expect(last.date()).toBe(first.daysInMonth());
    expect(first.month()).toBe(dayjs().month());
  });
});

describe("getPreviousRange", () => {
  test("returns same-length period immediately before the given range", () => {
    const range: DateRange = {
      dateFrom: "2026-05-04",
      dateTo: "2026-05-10",
      preset: "custom",
    };
    const prev = getPreviousRange(range);
    expect(prev.dateFrom).toBe("2026-04-27");
    expect(prev.dateTo).toBe("2026-05-03");
    expect(prev.preset).toBe("custom");
  });

  test("works for single-day range", () => {
    const range: DateRange = {
      dateFrom: "2026-05-04",
      dateTo: "2026-05-04",
      preset: "today",
    };
    const prev = getPreviousRange(range);
    expect(prev.dateFrom).toBe("2026-05-03");
    expect(prev.dateTo).toBe("2026-05-03");
  });
});

describe("getYearRange", () => {
  test("returns first and last day of current year", () => {
    const range = getYearRange();
    expect(range.preset).toBe("year");
    const first = dayjs(range.dateFrom);
    const last = dayjs(range.dateTo);
    expect(first.month()).toBe(0);
    expect(first.date()).toBe(1);
    expect(last.month()).toBe(11);
    expect(last.date()).toBe(31);
    expect(first.year()).toBe(dayjs().year());
  });
});

describe("getChartGranularity", () => {
  test("returns hourly for today", () => {
    expect(getChartGranularity(getTodayRange())).toBe("hourly");
  });
  test("returns hourly for yesterday", () => {
    expect(getChartGranularity(getYesterdayRange())).toBe("hourly");
  });
  test("returns daily for week", () => {
    expect(getChartGranularity(getWeekRange())).toBe("daily");
  });
  test("returns weekly for month", () => {
    expect(getChartGranularity(getMonthRange())).toBe("weekly");
  });
  test("returns monthly for year", () => {
    expect(getChartGranularity(getYearRange())).toBe("monthly");
  });
  test("returns hourly for custom 2-day range", () => {
    expect(
      getChartGranularity({
        dateFrom: "2026-05-04",
        dateTo: "2026-05-05",
        preset: "custom",
      })
    ).toBe("hourly");
  });
  test("returns daily for custom 7-day range", () => {
    expect(
      getChartGranularity({
        dateFrom: "2026-05-01",
        dateTo: "2026-05-07",
        preset: "custom",
      })
    ).toBe("daily");
  });
  test("returns weekly for custom 60-day range", () => {
    expect(
      getChartGranularity({
        dateFrom: "2026-03-01",
        dateTo: "2026-04-30",
        preset: "custom",
      })
    ).toBe("weekly");
  });
  test("returns monthly for custom 400-day range", () => {
    expect(
      getChartGranularity({
        dateFrom: "2025-01-01",
        dateTo: "2026-02-28",
        preset: "custom",
      })
    ).toBe("monthly");
  });
});
