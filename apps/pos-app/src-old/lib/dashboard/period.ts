import dayjs from "dayjs";
import {
  getBusinessDate,
  getBusinessWeekStart,
  shiftBusinessDate,
} from "~/lib/date-time";
import { currentOutletTimezone } from "~/store/outlet";

export type PeriodPreset =
  | "custom"
  | "month"
  | "today"
  | "week"
  | "year"
  | "yesterday";

export interface DateRange {
  dateFrom: string;
  dateTo: string;
  preset: PeriodPreset;
}

export function getTodayRange(): DateRange {
  const today = getBusinessDate(currentOutletTimezone());
  return { dateFrom: today, dateTo: today, preset: "today" };
}

export function getYesterdayRange(): DateRange {
  const today = getBusinessDate(currentOutletTimezone());
  const yesterday = shiftBusinessDate(today, -1, currentOutletTimezone());
  return { dateFrom: yesterday, dateTo: yesterday, preset: "yesterday" };
}

export function getWeekRange(): DateRange {
  const today = getBusinessDate(currentOutletTimezone());
  const monday = getBusinessWeekStart(today, currentOutletTimezone());
  const sunday = shiftBusinessDate(monday, 6, currentOutletTimezone());
  return {
    dateFrom: monday,
    dateTo: sunday,
    preset: "week",
  };
}

export function getMonthRange(): DateRange {
  const timezone = currentOutletTimezone();
  const today = dayjs().tz(timezone);
  return {
    dateFrom: today.startOf("month").format("YYYY-MM-DD"),
    dateTo: today.endOf("month").format("YYYY-MM-DD"),
    preset: "month",
  };
}

export function getYearRange(): DateRange {
  const timezone = currentOutletTimezone();
  const today = dayjs().tz(timezone);
  return {
    dateFrom: today.startOf("year").format("YYYY-MM-DD"),
    dateTo: today.endOf("year").format("YYYY-MM-DD"),
    preset: "year",
  };
}

export function getPreviousRange(range: DateRange): DateRange {
  const timezone = currentOutletTimezone();
  const days = dayjs(range.dateTo).diff(dayjs(range.dateFrom), "day");
  const prevTo = shiftBusinessDate(range.dateFrom, -1, timezone);
  const prevFrom = shiftBusinessDate(prevTo, -days, timezone);
  return {
    dateFrom: prevFrom,
    dateTo: prevTo,
    preset: "custom",
  };
}

export type ChartGranularity = "daily" | "hourly" | "monthly" | "weekly";

export function getChartGranularity(range: DateRange): ChartGranularity {
  if (range.preset === "today" || range.preset === "yesterday") {
    return "hourly";
  }
  if (range.preset === "week") {
    return "daily";
  }
  if (range.preset === "month") {
    return "weekly";
  }
  if (range.preset === "year") {
    return "monthly";
  }

  const days = dayjs(range.dateTo).diff(dayjs(range.dateFrom), "day") + 1;
  if (days <= 2) {
    return "hourly";
  }
  if (days <= 31) {
    return "daily";
  }
  if (days <= 364) {
    return "weekly";
  }
  return "monthly";
}
