# Adaptive Revenue Chart Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the revenue chart adapt granularity based on the selected period, and add a "Tahun Ini" preset.

**Architecture:** A single `RevenueChart` component replaces `HourlyChart`, accepting a `type` prop (`"hourly" | "daily" | "weekly" | "monthly"`). The dashboard page derives the type from the period's span/preset and calls the appropriate DB query. New DB queries return per-day, per-week, and per-month breakdowns.

**Tech Stack:** dayjs, chart.js, solid-chartjs, SolidJS, vitest

---

### Task 1: Add "year" preset to period utilities

**Files:**
- Modify: `apps/pos-app/src/lib/period.ts`
- Modify: `apps/pos-app/src/lib/__test__/period.test.ts`

**Step 1: Add `"year"` to PeriodPreset and create `getYearRange`**

In `period.ts`, add `"year"` to the `PeriodPreset` union type, then add:

```ts
export function getYearRange(): DateRange {
  return {
    dateFrom: dayjs().startOf("year").format("YYYY-MM-DD"),
    dateTo: dayjs().endOf("year").format("YYYY-MM-DD"),
    preset: "year",
  };
}
```

**Step 2: Add test for `getYearRange`**

In `period.test.ts`, add:

```ts
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
```

**Step 3: Run tests**

Run: `npx vitest run src/lib/__test__/period.test.ts`
Expected: All pass

---

### Task 2: Add daily, weekly, monthly breakdown queries

**Files:**
- Modify: `apps/pos-app/src/db/dashboard.ts`
- Modify: `apps/pos-app/src/db/__test__/dashboard.test.ts`

**Step 1: Add new types and query functions**

In `dashboard.ts`, add these types (after `HourlyRow`):

```ts
export interface DailyRow {
  date: string;
  revenue: number;
}

export interface WeeklyRow {
  weekStart: string;
  revenue: number;
}

export interface MonthlyRow {
  month: string;
  revenue: number;
}
```

Add three new query functions (same WHERE pattern as existing queries):

```ts
export async function getDailyBreakdown(
  dateFrom: string,
  dateTo: string,
): Promise<DailyRow[]> {
  const nextDayStr = getNextDayStr(dateTo);

  const rows = await db
    .select({
      date: sql<string>`strftime('%Y-%m-%d', ${orders.createdAt})`,
      revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, dateFrom),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed"),
      ),
    )
    .groupBy(sql`strftime('%Y-%m-%d', ${orders.createdAt})`)
    .orderBy(sql`strftime('%Y-%m-%d', ${orders.createdAt})`);

  return rows;
}

export async function getWeeklyBreakdown(
  dateFrom: string,
  dateTo: string,
): Promise<WeeklyRow[]> {
  const nextDayStr = getNextDayStr(dateTo);

  const rows = await db
    .select({
      weekStart: sql<string>`strftime('%Y-%m-%d', ${orders.createdAt}, 'weekday 1', '-6 days')`,
      revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, dateFrom),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed"),
      ),
    )
    .groupBy(sql`strftime('%Y-%W', ${orders.createdAt})`)
    .orderBy(sql`strftime('%Y-%W', ${orders.createdAt})`);

  return rows;
}

export async function getMonthlyBreakdown(
  dateFrom: string,
  dateTo: string,
): Promise<MonthlyRow[]> {
  const nextDayStr = getNextDayStr(dateTo);

  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${orders.createdAt})`,
      revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, dateFrom),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed"),
      ),
    )
    .groupBy(sql`strftime('%Y-%m', ${orders.createdAt})`)
    .orderBy(sql`strftime('%Y-%m', ${orders.createdAt})`);

  return rows;
}
```

**Step 2: Add tests for new queries**

In `dashboard.test.ts`, add test cases following the existing mock pattern. Each test should mock `db.select()` returning the chainable query builder, then call the function with test date ranges and verify it returns the expected data.

```ts
describe("getDailyBreakdown", () => {
  test("returns daily revenue grouped by date", async () => {
    // Same mock chain as getDashboardSummary test
    const result = await getDailyBreakdown("2026-05-01", "2026-05-07");
    expect(result).toEqual([]);
  });
});

describe("getWeeklyBreakdown", () => {
  test("returns weekly revenue grouped by week", async () => {
    const result = await getWeeklyBreakdown("2026-05-01", "2026-05-31");
    expect(result).toEqual([]);
  });
});

describe("getMonthlyBreakdown", () => {
  test("returns monthly revenue grouped by month", async () => {
    const result = await getMonthlyBreakdown("2026-01-01", "2026-12-31");
    expect(result).toEqual([]);
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run src/db/__test__/dashboard.test.ts`
Expected: All pass

---

### Task 3: Create `RevenueChart` component

**Files:**
- Create: `apps/pos-app/src/components/dashboard/revenue-chart.tsx`
- Delete: `apps/pos-app/src/components/dashboard/hourly-chart.tsx`
- Create: `apps/pos-app/src/components/dashboard/__test__/revenue-chart.test.tsx`
- Delete: `apps/pos-app/src/components/dashboard/__test__/hourly-chart.test.tsx`

**Step 1: Create RevenueChart component**

The component is a refactored `HourlyChart` that:
- Accepts `type: "hourly" | "daily" | "weekly" | "monthly"` prop
- Uses a union data prop: `data: HourlyRow[] | DailyRow[] | WeeklyRow[] | MonthlyRow[]`
- Shows dynamic title based on type
- Formats labels differently per type:
  - hourly: `"08"`, `"09"`, etc.
  - daily: `"04 Mei"`, `"05 Mei"` (dayjs `DD MMM`)
  - weekly: `"04 Mei"`, `"11 Mei"` (dayjs `DD MMM`)
  - monthly: `"Mei 2026"`, `"Jun 2026"` (dayjs `MMM YYYY`)
- Highlights top 3 bars (same as current hourly chart)
- Top-3 highlighting only for hourly type (disable for others — too confusing on sparse data)

**Step 2: Write tests**

Test cases:
1. Renders correct title for each type (4 tests)
2. Shows empty state when all zeros
3. Renders nothing when data undefined and not loading
4. Has scrollable container

**Step 3: Run tests**

Run: `npx vitest run src/components/dashboard/__test__/revenue-chart.test.tsx`
Expected: All pass

---

### Task 4: Add helper to derive chart type from period

**Files:**
- Modify: `apps/pos-app/src/lib/period.ts`

**Step 1: Add `getChartGranularity` function**

```ts
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
```

**Step 2: Add tests**

```ts
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
    expect(getChartGranularity({ dateFrom: "2026-05-04", dateTo: "2026-05-05", preset: "custom" })).toBe("hourly");
  });
  test("returns daily for custom 7-day range", () => {
    expect(getChartGranularity({ dateFrom: "2026-05-01", dateTo: "2026-05-07", preset: "custom" })).toBe("daily");
  });
  test("returns weekly for custom 60-day range", () => {
    expect(getChartGranularity({ dateFrom: "2026-03-01", dateTo: "2026-04-30", preset: "custom" })).toBe("weekly");
  });
  test("returns monthly for custom 400-day range", () => {
    expect(getChartGranularity({ dateFrom: "2025-01-01", dateTo: "2026-02-28", preset: "custom" })).toBe("monthly");
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run src/lib/__test__/period.test.ts`
Expected: All pass

---

### Task 5: Wire up dashboard page

**Files:**
- Modify: `apps/pos-app/src/pages/dashboard.tsx`

**Step 1: Update imports and data fetching**

Replace `HourlyChart` with `RevenueChart`. Import `getChartGranularity` from period, and the new breakdown queries from dashboard. Derive granularity from the selected range using a memo. Based on granularity, call the appropriate query function.

```ts
const granularity = createMemo(() => getChartGranularity(range()));

const [revenueData] = createResource(rangeKey, async () => {
  const g = granularity();
  const { dateFrom, dateTo } = range();
  if (g === "hourly") return { type: "hourly" as const, data: await getHourlyBreakdown(dateFrom, dateTo) };
  if (g === "daily") return { type: "daily" as const, data: await getDailyBreakdown(dateFrom, dateTo) };
  if (g === "weekly") return { type: "weekly" as const, data: await getWeeklyBreakdown(dateFrom, dateTo) };
  return { type: "monthly" as const, data: await getMonthlyBreakdown(dateFrom, dateTo) };
});
```

Pass `type={revenueData()?.type}` and `data={revenueData()?.data}` to `<RevenueChart>`.

**Step 2: Verify build**

Run: `bun run build` (or the app build command)
Expected: Build succeeds

---

### Task 6: Add "Tahun Ini" to period selector

**Files:**
- Modify: `apps/pos-app/src/components/dashboard/period-selector.tsx`
- Modify: `apps/pos-app/src/components/dashboard/__test__/period-selector.test.tsx`

**Step 1: Add preset button**

Import `getYearRange` and add to the `presets` array:

```ts
{ label: "Tahun ini", value: "year", range: getYearRange },
```

**Step 2: Update test to verify 6 presets**

Update the test that checks preset rendering to expect 6 buttons including "Tahun ini".

**Step 3: Run tests**

Run: `npx vitest run src/components/dashboard/__test__/period-selector.test.tsx`
Expected: All pass

---

### Task 7: Lint and verify

**Files:** All modified files

**Step 1: Run ultracite**

Run: `bun x ultracite fix apps/pos-app/src/`
Expected: No new errors

**Step 2: Run all dashboard tests**

Run: `npx vitest run src/db/__test__/dashboard.test.ts src/components/dashboard/__test__/ src/lib/__test__/period.test.ts`
Expected: All pass

**Step 3: Run build**

Run: `bun run build` from apps/pos-app
Expected: Build succeeds
