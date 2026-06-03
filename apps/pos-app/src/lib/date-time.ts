import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Jakarta";

export interface UtcRange {
  endExclusiveUtc: string;
  startUtc: string;
}

export function formatUtcTimestamp(now = dayjs()): string {
  return now.utc().toISOString();
}

export function getBusinessDate(
  timezoneName = DEFAULT_BUSINESS_TIMEZONE,
  now = dayjs()
): string {
  return now.tz(timezoneName).format("YYYY-MM-DD");
}

export function formatInBusinessTimezone(
  instant: string,
  timezoneName = DEFAULT_BUSINESS_TIMEZONE,
  format = "YYYY-MM-DD HH:mm"
): string {
  return dayjs.utc(instant).tz(timezoneName).format(format);
}

export function getBusinessDateFromInstant(
  instant: string,
  timezoneName = DEFAULT_BUSINESS_TIMEZONE
): string {
  return dayjs.utc(instant).tz(timezoneName).format("YYYY-MM-DD");
}

export function toUtcRangeForBusinessDate(
  date: string,
  timezoneName = DEFAULT_BUSINESS_TIMEZONE
): UtcRange {
  const start = dayjs.tz(date, timezoneName).startOf("day");
  return {
    endExclusiveUtc: start.add(1, "day").utc().toISOString(),
    startUtc: start.utc().toISOString(),
  };
}

export function shiftBusinessDate(
  date: string,
  days: number,
  timezoneName = DEFAULT_BUSINESS_TIMEZONE
): string {
  return dayjs.tz(date, timezoneName).add(days, "day").format("YYYY-MM-DD");
}

export function getBusinessWeekStart(
  date: string,
  timezoneName = DEFAULT_BUSINESS_TIMEZONE
): string {
  const current = dayjs.tz(date, timezoneName);
  const dayOfWeek = current.day();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return current.subtract(diffToMonday, "day").format("YYYY-MM-DD");
}
