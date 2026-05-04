# Dashboard Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the existing dashboard with responsive layout for phone/tablet, new "Kemarin" preset, visual delta arrows, dynamic X-axis on hourly chart, top-3 busiest hours highlight, and an Omzet/Porsi toggle on TopProducts chart.

**Architecture:** Modify existing dashboard components. Add `getYesterdayRange` to period utility. Dashboard page gets responsive grid layout using Tailwind `lg:` breakpoints. Chart components use `useIsPhone()` for responsive config. TopProducts gets a `mode` prop toggling between revenue and quantity data.

**Tech Stack:** SolidJS, TailwindCSS (lg: breakpoints), solid-chartjs, vitest + @testing-library

---

## Task 0: Add "Kemarin" preset to period utility

**Files:**
- Modify: `apps/pos-app/src/lib/period.ts`
- Test: `apps/pos-app/src/lib/__test__/period.test.ts`

**Step 1: Write the failing test**

Create `apps/pos-app/src/lib/__test__/period.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import {
  getMonthRange,
  getPreviousRange,
  getTodayRange,
  getWeekRange,
  type DateRange,
  getYesterdayRange,
} from "../period";

describe("getTodayRange", () => {
  test("returns today as both from and to", () => {
    const range = getTodayRange();
    expect(range.dateFrom).toBe(range.dateTo);
    expect(range.preset).toBe("today");
    expect(range.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getYesterdayRange", () => {
  test("returns yesterday as both from and to with preset 'yesterday'", () => {
    const range = getYesterdayRange();
    expect(range.dateFrom).toBe(range.dateTo);
    expect(range.preset).toBe("yesterday");
    expect(range.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("returns a date before today", () => {
    const range = getYesterdayRange();
    const today = new Date().toISOString().slice(0, 10);
    expect(range.dateFrom).not.toBe(today);
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
    const first = new Date(range.dateFrom);
    const last = new Date(range.dateTo);
    expect(first.getDate()).toBe(1);
    const nextMonth = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    expect(last.getTime()).toBe(nextMonth.getTime() - 86400000);
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
```

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/__test__/period.test.ts`
Expected: FAIL — `getYesterdayRange` is not exported

**Step 3: Implement `getYesterdayRange`**

In `apps/pos-app/src/lib/period.ts`:

1. Add `"yesterday"` to `PeriodPreset` union type
2. Add `getYesterdayRange` function before `getWeekRange`:

```typescript
export type PeriodPreset = "custom" | "month" | "today" | "week" | "yesterday";

export function getYesterdayRange(): DateRange {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);
  return { dateFrom: dateStr, dateTo: dateStr, preset: "yesterday" };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/__test__/period.test.ts`
Expected: All tests PASS

**Step 5: Run typecheck**

Run: `bun run check-types`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/pos-app/src/lib/period.ts apps/pos-app/src/lib/__test__/period.test.ts
git commit -m "feat: add getYesterdayRange and period utility tests"
```

---

## Task 1: Update PeriodSelector with "Kemarin" preset

**Files:**
- Modify: `apps/pos-app/src/components/dashboard/period-selector.tsx`

**Step 1: Add "Kemarin" to presets array**

In `period-selector.tsx`, add import for `getYesterdayRange` and add the preset:

```typescript
import {
  type DateRange,
  getMonthRange,
  getTodayRange,
  getWeekRange,
  getYesterdayRange,
  type PeriodPreset,
} from "~/lib/period";
```

Add to `presets` array after "Hari ini":

```typescript
{ label: "Kemarin", value: "yesterday", range: getYesterdayRange },
```

**Step 2: Run typecheck**

Run: `bun run check-types`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/dashboard/period-selector.tsx
git commit -m "feat: add Kemarin preset to PeriodSelector"
```

---

## Task 2: Add delta arrows to SalesSummaryCards

**Files:**
- Modify: `apps/pos-app/src/components/dashboard/sales-summary-cards.tsx`

**Step 1: Update `formatDelta` to include arrow symbols**

Change the `label` values to include Unicode arrows:

```typescript
function formatDelta(
  current: number,
  previous: number
): {
  label: string;
  type: "down" | "neutral" | "up";
} {
  if (previous === 0) {
    if (current === 0) {
      return { label: "0%", type: "neutral" };
    }
    return { label: "\u25B2 Baru", type: "up" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) {
    return { label: `\u25B2 +${pct}%`, type: "up" };
  }
  if (pct < 0) {
    return { label: `\u25BC ${pct}%`, type: "down" };
  }
  return { label: "0%", type: "neutral" };
}
```

**Step 2: Run typecheck**

Run: `bun run check-types`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/dashboard/sales-summary-cards.tsx
git commit -m "feat: add up/down arrows to SalesSummaryCards delta"
```

---

## Task 3: Dynamic X-axis and top-3 highlight for HourlyChart

**Files:**
- Modify: `apps/pos-app/src/components/dashboard/hourly-chart.tsx`

**Step 1: Add dynamic range and highlight logic**

Replace the component body. Add a `trimmedData` memo that:
1. Finds first and last hour with revenue > 0
2. Slices the 24-hour array to that range ± 1 hour padding
3. Identifies top 3 hours by revenue for color highlighting

```typescript
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "solid-chartjs";
import type { Component } from "solid-js";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import type { HourlyRow } from "~/db/dashboard";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface HourlyChartProps {
  data?: HourlyRow[] | undefined;
  loading?: boolean;
}

function formatRupiahAxis(value: number): string {
  if (value === 0) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${value / 1_000_000}jt`;
  }
  if (value >= 1000) {
    return `${value / 1000}rb`;
  }
  return String(value);
}

const HIGHLIGHT_COLOR = "oklch(0.65 0.2 30 / 0.85)";
const DEFAULT_COLOR = "oklch(0.55 0.18 250 / 0.7)";

const HourlyChart: Component<HourlyChartProps> = (props) => {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => setMounted(true));

  const hasData = () => props.data?.some((r) => r.revenue > 0);

  const trimmedData = createMemo(() => {
    const raw = props.data;
    if (!raw) {
      return { data: [], topHours: new Set<number>() };
    }
    const withRevenue = raw.filter((r) => r.revenue > 0);
    if (withRevenue.length === 0) {
      return { data: raw, topHours: new Set<number>() };
    }

    const minHour = Math.max(0, Math.min(...withRevenue.map((r) => r.hour)) - 1);
    const maxHour = Math.min(23, Math.max(...withRevenue.map((r) => r.hour)) + 1);
    const sliced = raw.filter((r) => r.hour >= minHour && r.hour <= maxHour);

    const sorted = [...withRevenue].sort((a, b) => b.revenue - a.revenue);
    const topHours = new Set(sorted.slice(0, 3).map((r) => r.hour));

    return { data: sliced, topHours };
  });

  const chartData = () => ({
    datasets: [
      {
        backgroundColor: trimmedData().data.map((r) =>
          trimmedData().topHours.has(r.hour) ? HIGHLIGHT_COLOR : DEFAULT_COLOR
        ),
        borderColor: trimmedData().data.map((r) =>
          trimmedData().topHours.has(r.hour)
            ? "oklch(0.65 0.2 30)"
            : "oklch(0.55 0.18 250)"
        ),
        borderWidth: 1,
        data: trimmedData().data.map((r) => r.revenue),
        label: "Pendapatan",
      },
    ],
    labels: trimmedData().data.map((r) =>
      `${String(r.hour).padStart(2, "0")}`
    ),
  });

  return (
    <div class="rounded-xl border bg-card p-4">
      <h3 class="mb-3 font-medium text-sm">Pendapatan per Jam</h3>
      <Show
        fallback={<Skeleton class="h-48 w-full" />}
        when={!props.loading && mounted() && hasData()}
      >
        <div class="overflow-x-auto">
          <div class="min-w-[400px] h-48">
            <Bar
              data={chartData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx: { parsed: { y: number } }) => {
                        const val = ctx.parsed.y;
                        return ` ${new Intl.NumberFormat("id-ID", {
                          maximumFractionDigits: 0,
                          style: "currency",
                          currency: "IDR",
                        }).format(val)}`;
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { maxRotation: 0 },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (value: number) => formatRupiahAxis(value),
                    },
                  },
                },
              }}
            />
          </div>
        </div>
      </Show>
      <Show when={!(props.loading || hasData())}>
        <p class="py-8 text-center text-muted-foreground text-sm">
          Belum ada data
        </p>
      </Show>
    </div>
  );
};

export { HourlyChart };
```

**Step 2: Run typecheck**

Run: `bun run check-types`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/dashboard/hourly-chart.tsx
git commit -m "feat: dynamic X-axis range and top-3 highlight for HourlyChart"
```

---

## Task 4: Add Omzet/Porsi toggle to TopProductsChart

**Files:**
- Modify: `apps/pos-app/src/components/dashboard/top-products-chart.tsx`

**Step 1: Add mode toggle and switch dataset based on mode**

Replace the component with a `mode` signal that toggles between `"revenue"` and `"quantity"`. The chart data, tooltip, and axis format change based on mode.

```typescript
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "solid-chartjs";
import type { Component } from "solid-js";
import { createSignal, onMount, Show } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import type { TopProductRow } from "~/db/dashboard";
import { cn } from "~/lib/utils";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface TopProductsChartProps {
  data?: TopProductRow[] | undefined;
  loading?: boolean;
}

type SortMode = "quantity" | "revenue";

function formatRupiahAxis(value: number): string {
  if (value === 0) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${value / 1_000_000}jt`;
  }
  if (value >= 1000) {
    return `${value / 1000}rb`;
  }
  return String(value);
}

const TopProductsChart: Component<TopProductsChartProps> = (props) => {
  const [mounted, setMounted] = createSignal(false);
  const [mode, setMode] = createSignal<SortMode>("revenue");

  onMount(() => setMounted(true));

  const sortedData = () => {
    const raw = props.data;
    if (!raw) {
      return [];
    }
    return [...raw].sort((a, b) =>
      mode() === "revenue"
        ? b.revenue - a.revenue
        : b.quantity - a.quantity
    );
  };

  const chartData = () => ({
    datasets: [
      {
        backgroundColor:
          mode() === "revenue"
            ? "oklch(0.6 0.15 145 / 0.7)"
            : "oklch(0.65 0.18 250 / 0.7)",
        borderColor:
          mode() === "revenue"
            ? "oklch(0.6 0.15 145)"
            : "oklch(0.65 0.18 250)",
        borderWidth: 1,
        data:
          sortedData().map((r) =>
            mode() === "revenue" ? r.revenue : r.quantity
          ),
        label: mode() === "revenue" ? "Omzet" : "Porsi",
      },
    ],
    labels: sortedData().map((r) => r.productName),
  });

  return (
    <div class="rounded-xl border bg-card p-4">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="font-medium text-sm">Produk Terlaris</h3>
        <div class="flex rounded-md border border-input">
          <button
            class={cn(
              "px-2.5 py-1 text-xs font-medium transition-colors",
              mode() === "revenue"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("revenue")}
            type="button"
          >
            Omzet
          </button>
          <button
            class={cn(
              "px-2.5 py-1 text-xs font-medium transition-colors",
              mode() === "quantity"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("quantity")}
            type="button"
          >
            Porsi
          </button>
        </div>
      </div>
      <Show
        fallback={<Skeleton class="h-64 w-full" />}
        when={
          !props.loading &&
          mounted() &&
          props.data !== undefined &&
          props.data.length > 0
        }
      >
        <div class="h-64">
          <Bar
            data={chartData()}
            options={{
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx: {
                      dataIndex: number;
                      parsed: { x: number };
                    }) => {
                      const val = ctx.parsed.x;
                      const item = sortedData()[ctx.dataIndex];
                      if (mode() === "revenue") {
                        const formatted = new Intl.NumberFormat("id-ID", {
                          maximumFractionDigits: 0,
                          style: "currency",
                          currency: "IDR",
                        }).format(val);
                        return ` ${formatted} (${item?.quantity ?? 0} pcs)`;
                      }
                      return ` ${val} pcs (Rp ${(item?.revenue ?? 0).toLocaleString("id-ID")})`;
                    },
                  },
                },
              },
              scales: {
                x: {
                  beginAtZero: true,
                  ticks: {
                    callback: (value: number) =>
                      mode() === "revenue"
                        ? formatRupiahAxis(value)
                        : String(value),
                  },
                },
                y: {
                  grid: { display: false },
                },
              },
            }}
          />
        </div>
      </Show>
      <Show
        when={
          !props.loading &&
          (props.data === undefined || props.data.length === 0)
        }
      >
        <p class="py-8 text-center text-muted-foreground text-sm">
          Belum ada data
        </p>
      </Show>
    </div>
  );
};

export { TopProductsChart };
```

**Step 2: Run typecheck**

Run: `bun run check-types`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/dashboard/top-products-chart.tsx
git commit -m "feat: add Omzet/Porsi toggle to TopProductsChart"
```

---

## Task 5: Responsive chart configuration

**Files:**
- Modify: `apps/pos-app/src/components/dashboard/hourly-chart.tsx`
- Modify: `apps/pos-app/src/components/dashboard/top-products-chart.tsx`
- Modify: `apps/pos-app/src/components/dashboard/category-chart.tsx`
- Modify: `apps/pos-app/src/components/dashboard/payment-breakdown.tsx`

**Step 1: Add responsive legend/label config using `useIsPhone`**

For each bar chart component (hourly, top-products, category):

1. Import `useIsPhone` from `~/lib/responsive`
2. Create `isPhone` signal: `const isPhone = useIsPhone();`
3. In chart options, wrap legend/ticks config in conditional based on `isPhone()`:

**HourlyChart options:**
```typescript
plugins: {
  legend: { display: false },
  tooltip: { /* existing */ },
},
scales: {
  x: {
    grid: { display: false },
    ticks: {
      maxRotation: isPhone() ? 45 : 0,
      maxTicksLimit: isPhone() ? 8 : undefined,
    },
  },
  y: {
    beginAtZero: true,
    ticks: {
      callback: (value: number) => formatRupiahAxis(value),
    },
  },
},
```

**TopProductsChart options:**
```typescript
plugins: {
  legend: { display: false },
  tooltip: { /* existing */ },
},
scales: {
  x: {
    beginAtZero: true,
    ticks: {
      callback: (value: number) =>
        mode() === "revenue" ? formatRupiahAxis(value) : String(value),
      maxTicksLimit: isPhone() ? 5 : undefined,
    },
  },
  y: {
    grid: { display: false },
  },
},
```

**CategoryChart options:**
```typescript
plugins: {
  legend: { display: false },
  tooltip: { /* existing */ },
},
scales: {
  x: {
    beginAtZero: true,
    ticks: {
      callback: (value: number) => formatRupiahAxis(value),
      maxTicksLimit: isPhone() ? 5 : undefined,
    },
  },
  y: {
    grid: { display: false },
  },
},
```

**PaymentBreakdownChart** — no changes needed (doughnut has no axes, legend already hidden).

**Step 2: Run typecheck**

Run: `bun run check-types`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/dashboard/hourly-chart.tsx apps/pos-app/src/components/dashboard/top-products-chart.tsx apps/pos-app/src/components/dashboard/category-chart.tsx
git commit -m "feat: responsive chart config for phone/tablet"
```

---

## Task 6: Responsive dashboard layout

**Files:**
- Modify: `apps/pos-app/src/pages/dashboard.tsx`

**Step 1: Update layout grid for phone/tablet**

Replace the simple `space-y-4` stack with a responsive grid:

```typescript
import { createMemo, createResource, createSignal } from "solid-js";
import { CategoryChart } from "~/components/dashboard/category-chart";
import { HourlyChart } from "~/components/dashboard/hourly-chart";
import { PaymentBreakdownChart } from "~/components/dashboard/payment-breakdown";
import { PeriodSelector } from "~/components/dashboard/period-selector";
import { SalesSummaryCards } from "~/components/dashboard/sales-summary-cards";
import { TopProductsChart } from "~/components/dashboard/top-products-chart";
import { AppShell } from "~/components/layout";
import {
  getDashboardSummary,
  getHourlyBreakdown,
  getPaymentBreakdown,
  getSalesByCategory,
  getTopProducts,
} from "~/db/dashboard";
import { type DateRange, getPreviousRange, getTodayRange } from "~/lib/period";

export default function Dashboard() {
  const [range, setRange] = createSignal<DateRange>(getTodayRange());

  const prevRange = createMemo(() => getPreviousRange(range()));

  const rangeKey = createMemo(() => `${range().dateFrom}-${range().dateTo}`);
  const prevKey = createMemo(
    () => `${prevRange().dateFrom}-${prevRange().dateTo}`,
  );

  const [summary] = createResource(rangeKey, () =>
    getDashboardSummary(range().dateFrom, range().dateTo),
  );
  const [prevSummary] = createResource(prevKey, () =>
    getDashboardSummary(prevRange().dateFrom, prevRange().dateTo),
  );
  const [payment] = createResource(rangeKey, () =>
    getPaymentBreakdown(range().dateFrom, range().dateTo),
  );
  const [hourly] = createResource(rangeKey, () =>
    getHourlyBreakdown(range().dateFrom, range().dateTo),
  );
  const [topProducts] = createResource(rangeKey, () =>
    getTopProducts(range().dateFrom, range().dateTo),
  );
  const [categorySales] = createResource(rangeKey, () =>
    getSalesByCategory(range().dateFrom, range().dateTo),
  );

  const loading = () => summary.loading;

  return (
    <AppShell title="Dasbor">
      <div class="space-y-4 p-4">
        <PeriodSelector onChange={setRange} value={range()} />

        <SalesSummaryCards
          loading={loading()}
          previous={prevSummary()}
          summary={summary()}
        />

        <HourlyChart data={hourly()} loading={loading()} />

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div class="lg:col-span-7">
            <TopProductsChart data={topProducts()} loading={loading()} />
          </div>
          <div class="space-y-4 lg:col-span-5">
            <PaymentBreakdownChart data={payment()} loading={loading()} />
            <CategoryChart data={categorySales()} loading={loading()} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
```

Key changes:
- **Row 1:** PeriodSelector — full width (unchanged)
- **Row 2:** SalesSummaryCards — full width, already 2x2 grid on phone, stays (unchanged)
- **Row 3:** HourlyChart — full width (unchanged)
- **Row 4:** `lg:grid-cols-12` split:
  - Left `lg:col-span-7`: TopProductsChart
  - Right `lg:col-span-5`: PaymentBreakdownChart + CategoryChart stacked

**Step 2: Run typecheck**

Run: `bun run check-types`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/pages/dashboard.tsx
git commit -m "feat: responsive dashboard layout for phone/tablet"
```

---

## Task 7: Update SalesSummaryCards for 4-column tablet layout

**Files:**
- Modify: `apps/pos-app/src/components/dashboard/sales-summary-cards.tsx`

**Step 1: Update grid to 4 columns on large screens**

Change:
```typescript
<div class="grid grid-cols-2 gap-2">
```
To:
```typescript
<div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
```

**Step 2: Run typecheck**

Run: `bun run check-types`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/dashboard/sales-summary-cards.tsx
git commit -m "feat: 4-column summary cards on tablet"
```

---

## Task 8: Build verification

**Step 1: Run full typecheck**

Run: `cd apps/pos-app && bun run check-types`
Expected: No errors

**Step 2: Run lint**

Run: `bun x ultracite fix` at root
Expected: Only pre-existing issues

**Step 3: Run tests**

Run: `bun test`
Expected: All tests pass (including new period tests)

**Step 4: Build the app**

Run: `cd apps/pos-app && bun run build`
Expected: Build succeeds

**Step 5: Fix any issues found**

Address any type errors, lint warnings, or build failures.

**Step 6: Commit fixes (if any)**

```bash
git add -A
git commit -m "fix: address dashboard enhancement build issues"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 0 | Add `getYesterdayRange` + period tests | `lib/period.ts`, `lib/__test__/period.test.ts` (new) |
| 1 | "Kemarin" preset in PeriodSelector | `components/dashboard/period-selector.tsx` |
| 2 | Delta arrows in SalesSummaryCards | `components/dashboard/sales-summary-cards.tsx` |
| 3 | Dynamic X-axis + top-3 highlight | `components/dashboard/hourly-chart.tsx` |
| 4 | Omzet/Porsi toggle | `components/dashboard/top-products-chart.tsx` |
| 5 | Responsive chart config | `hourly-chart`, `top-products-chart`, `category-chart` |
| 6 | Responsive dashboard layout | `pages/dashboard.tsx` |
| 7 | 4-column summary cards on tablet | `components/dashboard/sales-summary-cards.tsx` |
| 8 | Build verification | — |
