import { type Accessor, createMemo } from "solid-js";
import {
  type CategoryRevenueRow,
  type DailyRow,
  type DashboardSummary,
  getDailyBreakdown,
  getDashboardSummary,
  getHourlyBreakdown,
  getMonthlyBreakdown,
  getPaymentBreakdown,
  getSalesByCategory,
  getTopProducts,
  getWeeklyBreakdown,
  type HourlyRow,
  type MonthlyRow,
  type PaymentBreakdown,
  type WeeklyRow,
} from "~/db/dashboard";
import {
  type DateRange,
  getChartGranularity,
  getPreviousRange,
} from "~/lib/dashboard/period";
import { useDrizzleQuery } from "~/lib/use-drizzle-query";
import { currentOutletTimezone } from "~/store/outlet";

export type RevenueType = "hourly" | "daily" | "weekly" | "monthly";

interface RevenueData {
  data: DailyRow[] | HourlyRow[] | MonthlyRow[] | WeeklyRow[];
  type: RevenueType;
}

export interface DashboardData {
  categorySales: () => CategoryRevenueRow[];
  loading: () => boolean;
  payment: () => PaymentBreakdown;
  prevSummary: () => DashboardSummary;
  revenueData: () => RevenueData;
  summary: () => DashboardSummary;
  topProducts: () => Awaited<ReturnType<typeof getTopProducts>>;
}

const EMPTY_SUMMARY: DashboardSummary = {
  avgOrderValue: 0,
  orderCount: 0,
  totalRevenue: 0,
};

const EMPTY_PAYMENT: PaymentBreakdown = {
  cashCount: 0,
  cashTotal: 0,
  qrisCount: 0,
  qrisTotal: 0,
};

function getFallbackRevenue(type: RevenueType): RevenueData {
  return { data: [], type };
}

export function useDashboardData(range: Accessor<DateRange>): DashboardData {
  const timezone = currentOutletTimezone;
  const prevRange = createMemo(() => getPreviousRange(range()));
  const rangeKey = createMemo(
    () => `${timezone()}-${range().dateFrom}-${range().dateTo}`
  );
  const prevKey = createMemo(
    () => `${timezone()}-${prevRange().dateFrom}-${prevRange().dateTo}`
  );
  const granularity = createMemo(() => getChartGranularity(range()));

  const summaryQuery = useDrizzleQuery(rangeKey, async () => {
    try {
      return await getDashboardSummary(range().dateFrom, range().dateTo);
    } catch {
      return EMPTY_SUMMARY;
    }
  });

  const prevSummaryQuery = useDrizzleQuery(prevKey, async () => {
    try {
      return await getDashboardSummary(
        prevRange().dateFrom,
        prevRange().dateTo
      );
    } catch {
      return EMPTY_SUMMARY;
    }
  });

  const paymentQuery = useDrizzleQuery(rangeKey, async () => {
    try {
      return await getPaymentBreakdown(range().dateFrom, range().dateTo);
    } catch {
      return EMPTY_PAYMENT;
    }
  });

  const topProductsQuery = useDrizzleQuery(rangeKey, async () => {
    try {
      return await getTopProducts(range().dateFrom, range().dateTo);
    } catch {
      return [];
    }
  });

  const categorySalesQuery = useDrizzleQuery(rangeKey, async () => {
    try {
      return await getSalesByCategory(range().dateFrom, range().dateTo);
    } catch {
      return [];
    }
  });

  const revenueDataQuery = useDrizzleQuery(rangeKey, async () => {
    const type = granularity();
    const { dateFrom, dateTo } = range();

    try {
      if (type === "hourly") {
        return {
          data: await getHourlyBreakdown(dateFrom, dateTo),
          type,
        };
      }
      if (type === "daily") {
        return {
          data: await getDailyBreakdown(dateFrom, dateTo),
          type,
        };
      }
      if (type === "weekly") {
        return {
          data: await getWeeklyBreakdown(dateFrom, dateTo),
          type,
        };
      }
      return {
        data: await getMonthlyBreakdown(dateFrom, dateTo),
        type,
      };
    } catch {
      return getFallbackRevenue(type);
    }
  });

  const loading = createMemo(
    () =>
      summaryQuery.loading() ||
      prevSummaryQuery.loading() ||
      paymentQuery.loading() ||
      topProductsQuery.loading() ||
      categorySalesQuery.loading() ||
      revenueDataQuery.loading()
  );

  return {
    categorySales: () => categorySalesQuery.data() ?? [],
    loading,
    payment: () => paymentQuery.data() ?? EMPTY_PAYMENT,
    prevSummary: () => prevSummaryQuery.data() ?? EMPTY_SUMMARY,
    revenueData: () =>
      revenueDataQuery.data() ?? getFallbackRevenue(granularity()),
    summary: () => summaryQuery.data() ?? EMPTY_SUMMARY,
    topProducts: () => topProductsQuery.data() ?? [],
  };
}
