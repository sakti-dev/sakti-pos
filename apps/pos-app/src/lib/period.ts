import dayjs from "dayjs";

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
	const today = dayjs().format("YYYY-MM-DD");
	return { dateFrom: today, dateTo: today, preset: "today" };
}

export function getYesterdayRange(): DateRange {
	const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
	return { dateFrom: yesterday, dateTo: yesterday, preset: "yesterday" };
}

export function getWeekRange(): DateRange {
  const now = dayjs();
  const day = now.day();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = now.subtract(diffToMonday, "day");
  const sunday = monday.add(6, "day");
  return {
    dateFrom: monday.format("YYYY-MM-DD"),
    dateTo: sunday.format("YYYY-MM-DD"),
    preset: "week",
  };
}

export function getMonthRange(): DateRange {
	return {
		dateFrom: dayjs().startOf("month").format("YYYY-MM-DD"),
		dateTo: dayjs().endOf("month").format("YYYY-MM-DD"),
		preset: "month",
	};
}

export function getYearRange(): DateRange {
	return {
		dateFrom: dayjs().startOf("year").format("YYYY-MM-DD"),
		dateTo: dayjs().endOf("year").format("YYYY-MM-DD"),
		preset: "year",
	};
}

export function getPreviousRange(range: DateRange): DateRange {
	const from = dayjs(range.dateFrom);
	const to = dayjs(range.dateTo);
	const days = to.diff(from, "day");
	const prevTo = from.subtract(1, "day");
	const prevFrom = prevTo.subtract(days, "day");
	return {
		dateFrom: prevFrom.format("YYYY-MM-DD"),
		dateTo: prevTo.format("YYYY-MM-DD"),
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
	if (days <= 2) return "hourly";
	if (days <= 31) return "daily";
	if (days <= 364) return "weekly";
	return "monthly";
}
