import { type Accessor, createMemo, createResource } from "solid-js";
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
  const prevRange = createMemo(() => getPreviousRange(range()));
  const rangeKey = createMemo(() => `${range().dateFrom}-${range().dateTo}`);
  const prevKey = createMemo(
    () => `${prevRange().dateFrom}-${prevRange().dateTo}`
  );
  const granularity = createMemo(() => getChartGranularity(range()));

  const [summary] = createResource(rangeKey, async () => {
    try {
      return await getDashboardSummary(range().dateFrom, range().dateTo);
    } catch {
      return EMPTY_SUMMARY;
    }
  });

  const [prevSummary] = createResource(prevKey, async () => {
    try {
      return await getDashboardSummary(
        prevRange().dateFrom,
        prevRange().dateTo
      );
    } catch {
      return EMPTY_SUMMARY;
    }
  });

  const [payment] = createResource(rangeKey, async () => {
    try {
      return await getPaymentBreakdown(range().dateFrom, range().dateTo);
    } catch {
      return EMPTY_PAYMENT;
    }
  });

  const [topProducts] = createResource(rangeKey, async () => {
    try {
      return await getTopProducts(range().dateFrom, range().dateTo);
    } catch {
      return [];
    }
  });

  const [categorySales] = createResource(rangeKey, async () => {
    try {
      return await getSalesByCategory(range().dateFrom, range().dateTo);
    } catch {
      return [];
    }
  });

  const [revenueData] = createResource(rangeKey, async () => {
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
      summary.loading ||
      prevSummary.loading ||
      payment.loading ||
      topProducts.loading ||
      categorySales.loading ||
      revenueData.loading
  );

  return {
    categorySales: () => categorySales() ?? [],
    loading,
    payment: () => payment() ?? EMPTY_PAYMENT,
    prevSummary: () => prevSummary() ?? EMPTY_SUMMARY,
    revenueData: () => revenueData() ?? getFallbackRevenue(granularity()),
    summary: () => summary() ?? EMPTY_SUMMARY,
    topProducts: () => topProducts() ?? [],
  };
}
