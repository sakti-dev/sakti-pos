# Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reporting dashboard for owner/manager with sales summary, payment breakdown, hourly chart, top products, sales by category, and period comparison.

**Architecture:** New `/` route replaces home for owner/manager (cashier still goes to `/pos`). Dashboard page with period selector (Hari ini, Minggu ini, Bulan ini, Kustom) and 6 widget sections. All data queries live in `db/dashboard.ts`. Charts use Chart.js via `solid-chartjs`.

**Tech Stack:** SolidJS, Chart.js + solid-chartjs, Drizzle ORM, TailwindCSS

---

## Pre-flight

### Task 0: Install chart dependencies

**Files:**
- Modify: `apps/pos-app/package.json`

**Step 1: Install chart.js and solid-chartjs**

Run: `bun add chart.js solid-chartjs` in `apps/pos-app/`

**Step 2: Verify install**

Run: `bun run check-types` in `apps/pos-app/`
Expected: No new type errors

**Step 3: Run lint**

Run: `bun x ultracite check` at root
Expected: No new issues

**Step 4: Commit**

```bash
git add apps/pos-app/package.json bun.lockb
git commit -m "chore: add chart.js and solid-chartjs dependencies"
```

---

## Data Layer

### Task 1: Create dashboard DB queries

**Files:**
- Create: `apps/pos-app/src/db/dashboard.ts`

**Step 1: Create `db/dashboard.ts` with all queries**

```typescript
import {
  categories,
  orderItems,
  orders,
  products,
} from "@repo/database";
import { eq, gte, lt, sql, and } from "drizzle-orm";
import { db } from "./index";

export interface DashboardSummary {
  avgOrderValue: number;
  orderCount: number;
  totalRevenue: number;
}

export interface PaymentBreakdown {
  cashCount: number;
  cashTotal: number;
  qrisCount: number;
  qrisTotal: number;
}

export interface HourlyRow {
  hour: number;
  revenue: number;
}

export interface TopProductRow {
  productName: string;
  quantity: number;
  revenue: number;
}

export interface CategoryRevenueRow {
  categoryName: string;
  revenue: number;
}

export async function getDashboardSummary(
  dateFrom: string,
  dateTo: string
): Promise<DashboardSummary> {
  const nextDay = new Date(dateTo);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const rows = await db
    .select({
      orderCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, dateFrom),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed")
      )
    );

  const row = rows[0];
  return {
    orderCount: row?.orderCount ?? 0,
    totalRevenue: row?.totalRevenue ?? 0,
    avgOrderValue:
      row && row.orderCount > 0
        ? Math.round(row.totalRevenue / row.orderCount)
        : 0,
  };
}

export async function getPaymentBreakdown(
  dateFrom: string,
  dateTo: string
): Promise<PaymentBreakdown> {
  const nextDay = new Date(dateTo);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const rows = await db
    .select({
      cashCount: sql<number>`CAST(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN 1 ELSE 0 END) AS INTEGER)`,
      cashTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.total} ELSE 0 END), 0)`,
      qrisCount: sql<number>`CAST(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN 1 ELSE 0 END) AS INTEGER)`,
      qrisTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN ${orders.total} ELSE 0 END), 0)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, dateFrom),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed")
      )
    );

  const row = rows[0];
  return {
    cashCount: row?.cashCount ?? 0,
    cashTotal: row?.cashTotal ?? 0,
    qrisCount: row?.qrisCount ?? 0,
    qrisTotal: row?.qrisTotal ?? 0,
  };
}

export async function getHourlyBreakdown(
  dateFrom: string,
  dateTo: string
): Promise<HourlyRow[]> {
  const nextDay = new Date(dateTo);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const rows = await db
    .select({
      hour: sql<number>`CAST(strftime('%H', ${orders.createdAt}) AS INTEGER)`,
      revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, dateFrom),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed")
      )
    )
    .groupBy(sql`strftime('%H', ${orders.createdAt})`)
    .orderBy(sql`strftime('%H', ${orders.createdAt})`);

  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(r.hour, r.revenue);
  }

  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    revenue: map.get(i) ?? 0,
  }));
}

export async function getTopProducts(
  dateFrom: string,
  dateTo: string,
  limit = 10
): Promise<TopProductRow[]> {
  const nextDay = new Date(dateTo);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const rows = await db
    .select({
      productName: orderItems.productName,
      quantity: sql<number>`CAST(SUM(${orderItems.quantity}) AS INTEGER)`,
      revenue: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        gte(orders.createdAt, dateFrom),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed")
      )
    )
    .groupBy(orderItems.productName)
    .orderBy(sql`SUM(${orderItems.subtotal}) DESC`)
    .limit(limit);

  return rows;
}

export async function getSalesByCategory(
  dateFrom: string,
  dateTo: string
): Promise<CategoryRevenueRow[]> {
  const nextDay = new Date(dateTo);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const rows = await db
    .select({
      categoryName: categories.name,
      revenue: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        gte(orders.createdAt, dateFrom),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed")
      )
    )
    .groupBy(categories.name)
    .orderBy(sql`SUM(${orderItems.subtotal}) DESC`);

  return rows;
}
```

**Step 2: Run typecheck**

Run: `cd apps/pos-app && bun run check-types`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/db/dashboard.ts
git commit -m "feat: add dashboard DB queries"
```

---

## Period Selector Utility

### Task 2: Create period utility

**Files:**
- Create: `apps/pos-app/src/lib/period.ts`

**Step 1: Create period helper**

```typescript
export type PeriodPreset = "custom" | "month" | "today" | "week";

export interface DateRange {
  dateFrom: string;
  dateTo: string;
  preset: PeriodPreset;
}

export function getTodayRange(): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  return { dateFrom: today, dateTo: today, preset: "today" };
}

export function getWeekRange(): DateRange {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    dateFrom: monday.toISOString().slice(0, 10),
    dateTo: sunday.toISOString().slice(0, 10),
    preset: "week",
  };
}

export function getMonthRange(): DateRange {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    dateFrom: firstDay.toISOString().slice(0, 10),
    dateTo: lastDay.toISOString().slice(0, 10),
    preset: "month",
  };
}

export function getPreviousRange(range: DateRange): DateRange {
  const from = new Date(range.dateFrom);
  const to = new Date(range.dateTo);
  const days = Math.round(
    (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
  );
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days);
  return {
    dateFrom: prevFrom.toISOString().slice(0, 10),
    dateTo: prevTo.toISOString().slice(0, 10),
    preset: "custom",
  };
}
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/lib/period.ts
git commit -m "feat: add period utility for dashboard date ranges"
```

---

## UI Components

### Task 3: Create PeriodSelector component

**Files:**
- Create: `apps/pos-app/src/components/dashboard/period-selector.tsx`

**Step 1: Create the component**

This is a row of preset buttons + optional custom date inputs. Follow the pattern of `Select` and button components in the codebase. Uses `cn()` for conditional styling. No new dependencies.

```typescript
import type { Component } from "solid-js";
import { Show } from "solid-js";
import { cn } from "~/lib/utils";
import {
  type DateRange,
  type PeriodPreset,
  getMonthRange,
  getTodayRange,
  getWeekRange,
} from "~/lib/period";

interface PeriodSelectorProps {
  onChange: (range: DateRange) => void;
  value: DateRange;
}

const presets: { label: string; value: PeriodPreset; range: () => DateRange }[] = [
  { label: "Hari ini", value: "today", range: getTodayRange },
  { label: "Minggu ini", value: "week", range: getWeekRange },
  { label: "Bulan ini", value: "month", range: getMonthRange },
];

const PeriodSelector: Component<PeriodSelectorProps> = (props) => {
  const handlePreset = (preset: PeriodPreset, range: () => DateRange) => {
    props.onChange(range());
  };

  const handleCustomFrom = (e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    props.onChange({ ...props.value, dateFrom: val, preset: "custom" });
  };

  const handleCustomTo = (e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    props.onChange({ ...props.value, dateTo: val, preset: "custom" });
  };

  return (
    <div class="space-y-2">
      <div class="flex gap-2 overflow-x-auto">
        <For each={presets}>
          {(preset) => (
            <button
              class={cn(
                "shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                props.value.preset === preset.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:bg-accent"
              )}
              onClick={() => handlePreset(preset.value, preset.range)}
              type="button"
            >
              {preset.label}
            </button>
          )}
        </For>
        <button
          class={cn(
            "shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            props.value.preset === "custom"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card hover:bg-accent"
          )}
          onClick={() =>
            props.onChange({ ...props.value, preset: "custom" })
          }
          type="button"
        >
          Kustom
        </button>
      </div>

      <Show when={props.value.preset === "custom"}>
        <div class="flex items-center gap-2">
          <input
            class="h-10 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
            max={props.value.dateTo}
            onChange={handleCustomFrom}
            type="date"
            value={props.value.dateFrom}
          />
          <span class="text-muted-foreground text-sm shrink-0">s/d</span>
          <input
            class="h-10 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
            min={props.value.dateFrom}
            onChange={handleCustomTo}
            type="date"
            value={props.value.dateTo}
          />
        </div>
      </Show>
    </div>
  );
};

export { PeriodSelector };
```

Note: add `import { For } from "solid-js";` at the top alongside the other solid-js imports.

**Step 2: Commit**

```bash
git add apps/pos-app/src/components/dashboard/period-selector.tsx
git commit -m "feat: add PeriodSelector component"
```

### Task 4: Create SalesSummaryCards component

**Files:**
- Create: `apps/pos-app/src/components/dashboard/sales-summary-cards.tsx`

**Step 1: Create the component**

4-card grid: Total Pendapatan, Jumlah Pesanan, Rata-rata/Psn, Perbandingan (vs previous period). Uses `formatIDR()`, `Skeleton` for loading state.

```typescript
import type { Component } from "solid-js";
import { Show } from "solid-js";
import type { DashboardSummary } from "~/db/dashboard";
import { Skeleton } from "~/components/ui/skeleton";
import { formatIDR } from "~/lib/utils";

interface SalesSummaryCardsProps {
  loading?: boolean;
  previous?: DashboardSummary | undefined;
  summary?: DashboardSummary | undefined;
}

function formatDelta(current: number, previous: number): {
  label: string;
  type: "down" | "neutral" | "up";
} {
  if (previous === 0) {
    if (current === 0) return { label: "0%", type: "neutral" };
    return { label: "+baru", type: "up" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { label: `+${pct}%`, type: "up" };
  if (pct < 0) return { label: `${pct}%`, type: "down" };
  return { label: "0%", type: "neutral" };
}

const SalesSummaryCards: Component<SalesSummaryCardsProps> = (props) => {
  const delta = () =>
    props.summary && props.previous
      ? formatDelta(props.summary.totalRevenue, props.previous.totalRevenue)
      : undefined;

  return (
    <div class="grid grid-cols-2 gap-2">
      <Show
        fallback={
          <>
            <div class="rounded-xl border bg-card p-3">
              <Skeleton class="mb-1 h-3 w-20" />
              <Skeleton class="h-6 w-28" />
            </div>
            <div class="rounded-xl border bg-card p-3">
              <Skeleton class="mb-1 h-3 w-20" />
              <Skeleton class="h-6 w-16" />
            </div>
            <div class="rounded-xl border bg-card p-3">
              <Skeleton class="mb-1 h-3 w-24" />
              <Skeleton class="h-6 w-24" />
            </div>
            <div class="rounded-xl border bg-card p-3">
              <Skeleton class="mb-1 h-3 w-24" />
              <Skeleton class="h-6 w-16" />
            </div>
          </>
        }
        when={!props.loading}
      >
        <div class="rounded-xl border bg-card p-3">
          <p class="text-muted-foreground text-xs">Total Pendapatan</p>
          <p class="font-bold text-lg text-primary">
            {formatIDR(props.summary?.totalRevenue ?? 0)}
          </p>
        </div>
        <div class="rounded-xl border bg-card p-3">
          <p class="text-muted-foreground text-xs">Jumlah Pesanan</p>
          <p class="font-bold text-lg">
            {props.summary?.orderCount ?? 0}
          </p>
        </div>
        <div class="rounded-xl border bg-card p-3">
          <p class="text-muted-foreground text-xs">Rata-rata/Pesanan</p>
          <p class="font-bold">
            {formatIDR(props.summary?.avgOrderValue ?? 0)}
          </p>
        </div>
        <Show when={delta()}>
          {(d) => (
            <div class="rounded-xl border bg-card p-3">
              <p class="text-muted-foreground text-xs">vs Periode Lalu</p>
              <p
                class={`font-bold text-lg ${
                  d().type === "up"
                    ? "text-success"
                    : d().type === "down"
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                {d().label}
              </p>
            </div>
          )}
        </Show>
        <Show when={!delta()}>
          <div class="rounded-xl border bg-card p-3">
            <p class="text-muted-foreground text-xs">vs Periode Lalu</p>
            <p class="font-bold text-lg text-muted-foreground">-</p>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export { SalesSummaryCards };
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/components/dashboard/sales-summary-cards.tsx
git commit -m "feat: add SalesSummaryCards component"
```

### Task 5: Create PaymentBreakdownChart component

**Files:**
- Create: `apps/pos-app/src/components/dashboard/payment-breakdown.tsx`

**Step 1: Create the component**

Doughnut chart showing Tunai vs QRIS with percentage labels.

```typescript
import { Chart as ChartJS, ArcElement, Tooltip } from "chart.js";
import type { Component } from "solid-js";
import { createSignal, onMount, Show } from "solid-js";
import { Chart, Doughnut } from "solid-chartjs";
import type { PaymentBreakdown } from "~/db/dashboard";
import { Skeleton } from "~/components/ui/skeleton";

ChartJS.register(ArcElement, Tooltip);

interface PaymentBreakdownChartProps {
  loading?: boolean;
  data?: PaymentBreakdown | undefined;
}

const PaymentBreakdownChart: Component<PaymentBreakdownChartProps> = (
  props
) => {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => setMounted(true));

  const chartData = () => {
    const d = props.data;
    if (!d) return null;
    const total = d.cashTotal + d.qrisTotal;
    if (total === 0) return null;
    return {
      datasets: [
        {
          backgroundColor: ["oklch(0.6 0.15 145)", "oklch(0.65 0.18 250)"],
          data: [d.cashTotal, d.qrisTotal],
          label: "Pembayaran",
        },
      ],
      labels: ["Tunai", "QRIS"],
    };
  };

  const cashPct = () => {
    const d = props.data;
    if (!d) return 0;
    const total = d.cashTotal + d.qrisTotal;
    return total > 0 ? Math.round((d.cashTotal / total) * 100) : 0;
  };

  return (
    <div class="rounded-xl border bg-card p-4">
      <h3 class="mb-3 font-medium text-sm">Metode Pembayaran</h3>
      <Show
        fallback={<Skeleton class="mx-auto h-48 w-48" />}
        when={!props.loading && mounted() && chartData()}
      >
        <div class="mx-auto w-48">
          <Chart data={chartData()!} type="doughnut">
            <Doughnut
              options={{
                cutout: "65%",
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const val = ctx.parsed as number;
                        const formatted = new Intl.NumberFormat("id-ID", {
                          maximumFractionDigits: 0,
                          style: "currency",
                          currency: "IDR",
                        }).format(val);
                        return ` ${ctx.label}: ${formatted}`;
                      },
                    },
                  },
                },
              }}
            />
          </Chart>
        </div>
      </Show>
      <Show when={props.data}>
        {(d) => (
          <div class="mt-3 flex justify-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <span class="inline-block size-3 rounded-full bg-[oklch(0.6_0.15_145)]" />
              <span>
                Tunai {cashPct()}%
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-block size-3 rounded-full bg-[oklch(0.65_0.18_250)]" />
              <span>
                QRIS {100 - cashPct()}%
              </span>
            </div>
          </div>
        )}
      </Show>
      <Show when={!props.loading && props.data && (props.data.cashTotal + props.data.qrisTotal) === 0}>
        <p class="mt-2 text-center text-muted-foreground text-sm">
          Belum ada data
        </p>
      </Show>
    </div>
  );
};

export { PaymentBreakdownChart };
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/components/dashboard/payment-breakdown.tsx
git commit -m "feat: add PaymentBreakdownChart component"
```

### Task 6: Create HourlyChart component

**Files:**
- Create: `apps/pos-app/src/components/dashboard/hourly-chart.tsx`

**Step 1: Create the component**

Bar chart showing revenue per hour (0-23).

```typescript
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";
import type { Component } from "solid-js";
import { createSignal, onMount, Show } from "solid-js";
import { Chart, Bar } from "solid-chartjs";
import type { HourlyRow } from "~/db/dashboard";
import { Skeleton } from "~/components/ui/skeleton";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface HourlyChartProps {
  loading?: boolean;
  data?: HourlyRow[] | undefined;
}

const HourlyChart: Component<HourlyChartProps> = (props) => {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => setMounted(true));

  const hasData = () =>
    props.data && props.data.some((r) => r.revenue > 0);

  const chartData = () => ({
    datasets: [
      {
        backgroundColor: "oklch(0.55 0.18 250 / 0.7)",
        borderColor: "oklch(0.55 0.18 250)",
        borderWidth: 1,
        data: props.data?.map((r) => r.revenue) ?? [],
        label: "Pendapatan",
      },
    ],
    labels: props.data?.map((r) => `${String(r.hour).padStart(2, "0")}`) ?? [],
  });

  return (
    <div class="rounded-xl border bg-card p-4">
      <h3 class="mb-3 font-medium text-sm">Pendapatan per Jam</h3>
      <Show
        fallback={<Skeleton class="h-48 w-full" />}
        when={!props.loading && mounted() && hasData()}
      >
        <div class="h-48">
          <Chart data={chartData()} type="bar">
            <Bar
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const val = ctx.parsed.y as number;
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
                    ticks: {
                      callback: (value) => {
                        const idx = value as number;
                        return idx % 3 === 0
                          ? `${String(idx).padStart(2, "0")}`
                          : "";
                      },
                      maxRotation: 0,
                    },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (value) => {
                        if (value === 0) return "0";
                        const num = value as number;
                        if (num >= 1_000_000) return `${num / 1_000_000}jt`;
                        if (num >= 1_000) return `${num / 1_000}rb`;
                        return String(num);
                      },
                    },
                  },
                },
              }}
            />
          </Chart>
        </div>
      </Show>
      <Show when={!props.loading && !hasData()}>
        <p class="py-8 text-center text-muted-foreground text-sm">
          Belum ada data
        </p>
      </Show>
    </div>
  );
};

export { HourlyChart };
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/components/dashboard/hourly-chart.tsx
git commit -m "feat: add HourlyChart component"
```

### Task 7: Create TopProductsChart component

**Files:**
- Create: `apps/pos-app/src/components/dashboard/top-products-chart.tsx`

**Step 1: Create the component**

Horizontal bar chart of top products by revenue.

```typescript
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";
import type { Component } from "solid-js";
import { createSignal, onMount, Show } from "solid-js";
import { Chart, Bar } from "solid-chartjs";
import type { TopProductRow } from "~/db/dashboard";
import { Skeleton } from "~/components/ui/skeleton";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface TopProductsChartProps {
  loading?: boolean;
  data?: TopProductRow[] | undefined;
}

const TopProductsChart: Component<TopProductsChartProps> = (props) => {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => setMounted(true));

  const chartData = () => ({
    datasets: [
      {
        backgroundColor: "oklch(0.6 0.15 145 / 0.7)",
        borderColor: "oklch(0.6 0.15 145)",
        borderWidth: 1,
        data: props.data?.map((r) => r.revenue) ?? [],
        label: "Pendapatan",
      },
    ],
    labels: props.data?.map((r) => r.productName) ?? [],
  });

  return (
    <div class="rounded-xl border bg-card p-4">
      <h3 class="mb-3 font-medium text-sm">Produk Terlaris</h3>
      <Show
        fallback={<Skeleton class="h-64 w-full" />}
        when={!props.loading && mounted() && props.data && props.data.length > 0}
      >
        <div class="h-64">
          <Chart data={chartData()} type="bar">
            <Bar
              options={{
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const val = ctx.parsed.x as number;
                        const formatted = new Intl.NumberFormat("id-ID", {
                          maximumFractionDigits: 0,
                          style: "currency",
                          currency: "IDR",
                        }).format(val);
                        const item = props.data?.[ctx.dataIndex];
                        return ` ${formatted} (${item?.quantity} pcs)`;
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    beginAtZero: true,
                    ticks: {
                      callback: (value) => {
                        if (value === 0) return "0";
                        const num = value as number;
                        if (num >= 1_000_000) return `${num / 1_000_000}jt`;
                        if (num >= 1_000) return `${num / 1_000}rb`;
                        return String(num);
                      },
                    },
                  },
                  y: {
                    grid: { display: false },
                  },
                },
              }}
            />
          </Chart>
        </div>
      </Show>
      <Show when={!props.loading && (!props.data || props.data.length === 0)}>
        <p class="py-8 text-center text-muted-foreground text-sm">
          Belum ada data
        </p>
      </Show>
    </div>
  );
};

export { TopProductsChart };
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/components/dashboard/top-products-chart.tsx
git commit -m "feat: add TopProductsChart component"
```

### Task 8: Create CategoryChart component

**Files:**
- Create: `apps/pos-app/src/components/dashboard/category-chart.tsx`

**Step 1: Create the component**

Horizontal bar chart of categories by revenue.

```typescript
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";
import type { Component } from "solid-js";
import { createSignal, onMount, Show } from "solid-js";
import { Chart, Bar } from "solid-chartjs";
import type { CategoryRevenueRow } from "~/db/dashboard";
import { Skeleton } from "~/components/ui/skeleton";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface CategoryChartProps {
  loading?: boolean;
  data?: CategoryRevenueRow[] | undefined;
}

const CategoryChart: Component<CategoryChartProps> = (props) => {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => setMounted(true));

  const chartData = () => ({
    datasets: [
      {
        backgroundColor: "oklch(0.65 0.18 250 / 0.7)",
        borderColor: "oklch(0.65 0.18 250)",
        borderWidth: 1,
        data: props.data?.map((r) => r.revenue) ?? [],
        label: "Pendapatan",
      },
    ],
    labels: props.data?.map((r) => r.categoryName) ?? [],
  });

  return (
    <div class="rounded-xl border bg-card p-4">
      <h3 class="mb-3 font-medium text-sm">Penjualan per Kategori</h3>
      <Show
        fallback={<Skeleton class="h-48 w-full" />}
        when={
          !props.loading &&
          mounted() &&
          props.data &&
          props.data.length > 0
        }
      >
        <div class="h-48">
          <Chart data={chartData()} type="bar">
            <Bar
              options={{
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const val = ctx.parsed.x as number;
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
                    beginAtZero: true,
                    ticks: {
                      callback: (value) => {
                        if (value === 0) return "0";
                        const num = value as number;
                        if (num >= 1_000_000) return `${num / 1_000_000}jt`;
                        if (num >= 1_000) return `${num / 1_000}rb`;
                        return String(num);
                      },
                    },
                  },
                  y: {
                    grid: { display: false },
                  },
                },
              }}
            />
          </Chart>
        </div>
      </Show>
      <Show when={!props.loading && (!props.data || props.data.length === 0)}>
        <p class="py-8 text-center text-muted-foreground text-sm">
          Belum ada data
        </p>
      </Show>
    </div>
  );
};

export { CategoryChart };
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/components/dashboard/category-chart.tsx
git commit -m "feat: add CategoryChart component"
```

---

## Dashboard Page + Routing

### Task 9: Create Dashboard page

**Files:**
- Create: `apps/pos-app/src/pages/dashboard.tsx`

**Step 1: Create the dashboard page**

This page composes all the dashboard components. Uses `createResource` for data fetching (same pattern as order-history.tsx). Passes the selected date range to all queries.

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
import { getPreviousRange, getTodayRange, type DateRange } from "~/lib/period";

export default function Dashboard() {
  const [range, setRange] = createSignal<DateRange>(getTodayRange());

  const prevRange = createMemo(() => getPreviousRange(range()));

  const rangeKey = createMemo(
    () => `${range().dateFrom}-${range().dateTo}`
  );
  const prevKey = createMemo(
    () => `${prevRange().dateFrom}-${prevRange().dateTo}`
  );

  const [summary] = createResource(rangeKey, () =>
    getDashboardSummary(range().dateFrom, range().dateTo)
  );
  const [prevSummary] = createResource(prevKey, () =>
    getDashboardSummary(prevRange().dateFrom, prevRange().dateTo)
  );
  const [payment] = createResource(rangeKey, () =>
    getPaymentBreakdown(range().dateFrom, range().dateTo)
  );
  const [hourly] = createResource(rangeKey, () =>
    getHourlyBreakdown(range().dateFrom, range().dateTo)
  );
  const [topProducts] = createResource(rangeKey, () =>
    getTopProducts(range().dateFrom, range().dateTo)
  );
  const [categorySales] = createResource(rangeKey, () =>
    getSalesByCategory(range().dateFrom, range().dateTo)
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

        <PaymentBreakdownChart data={payment()} loading={loading()} />

        <HourlyChart data={hourly()} loading={loading()} />

        <TopProductsChart data={topProducts()} loading={loading()} />

        <CategoryChart data={categorySales()} loading={loading()} />
      </div>
    </AppShell>
  );
}
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/pages/dashboard.tsx
git commit -m "feat: add Dashboard page"
```

### Task 10: Update routing and navigation

**Files:**
- Modify: `apps/pos-app/src/App.tsx`
- Modify: `apps/pos-app/src/components/layout.tsx`
- Modify: `apps/pos-app/src/pages/login.tsx`

**Step 1: Add dashboard route and role-based redirect in `App.tsx`**

Add `import Dashboard from "./pages/dashboard";` at the top.

Change the home route from redirecting to `/pos` to rendering Dashboard with role check:

```typescript
<Route
  component={() => (
    <RequireAuth roles={["owner", "manager"]}>
      <Dashboard />
    </RequireAuth>
  )}
  path="/"
/>
```

Remove the old redirect: `component={() => <Navigate href="/pos" />}` on the `/` route.

**Step 2: Add "Dasbor" to sidebar nav in `layout.tsx`**

Add `TbOutlineChartBar` to the icon imports from `solid-icons/tb`.

Add this item at the start of `navItems` (before "Kasir"):

```typescript
{
  href: "/",
  icon: TbOutlineChartBar,
  label: "Dasbor",
  roles: ["owner", "manager"] as string[],
},
```

**Step 3: Update login redirect in `login.tsx`**

Change line 49 from:
```typescript
const target = authUser.role === "cashier" ? "/pos" : "/menu";
```
to:
```typescript
const target = authUser.role === "cashier" ? "/pos" : "/";
```

**Step 4: Run typecheck**

Run: `cd apps/pos-app && bun run check-types`
Expected: No errors

**Step 5: Run lint**

Run: `bun x ultracite check` at root
Expected: No new issues

**Step 6: Commit**

```bash
git add apps/pos-app/src/App.tsx apps/pos-app/src/components/layout.tsx apps/pos-app/src/pages/login.tsx
git commit -m "feat: add dashboard route, sidebar nav, and role-based redirect"
```

---

## Verification

### Task 11: Build and verify

**Step 1: Run full typecheck**

Run: `cd apps/pos-app && bun run check-types`
Expected: No errors

**Step 2: Run lint**

Run: `bun x ultracite check` at root
Expected: No new issues

**Step 3: Build the app**

Run: `cd apps/pos-app && bun run build`
Expected: Build succeeds

**Step 4: Fix any issues found**

Address any type errors, lint warnings, or build failures.

**Step 5: Commit fixes (if any)**

```bash
git add -A
git commit -m "fix: address dashboard build issues"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 0 | Install chart.js + solid-chartjs | `package.json` |
| 1 | Dashboard DB queries | `db/dashboard.ts` (new) |
| 2 | Period utility | `lib/period.ts` (new) |
| 3 | PeriodSelector component | `components/dashboard/period-selector.tsx` (new) |
| 4 | SalesSummaryCards component | `components/dashboard/sales-summary-cards.tsx` (new) |
| 5 | PaymentBreakdownChart (doughnut) | `components/dashboard/payment-breakdown.tsx` (new) |
| 6 | HourlyChart (bar) | `components/dashboard/hourly-chart.tsx` (new) |
| 7 | TopProductsChart (horizontal bar) | `components/dashboard/top-products-chart.tsx` (new) |
| 8 | CategoryChart (horizontal bar) | `components/dashboard/category-chart.tsx` (new) |
| 9 | Dashboard page | `pages/dashboard.tsx` (new) |
| 10 | Routing + nav + login redirect | `App.tsx`, `layout.tsx`, `login.tsx` |
| 11 | Build verification | — |
