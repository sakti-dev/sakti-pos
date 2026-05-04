# Adaptive Revenue Chart Granularity

## Problem

The dashboard always shows "Pendapatan per Jam" regardless of the selected period. For weekly/monthly views, hourly bars are too granular and don't make sense. The chart needs to adapt its granularity based on the time period.

Additionally, there is no "Tahun Ini" (This Year) preset.

## Design

### Granularity Rules

| Period | Chart granularity |
|--------|------------------|
| Hari ini / Kemarin | Per jam |
| Minggu ini | Per hari |
| Bulan ini | Per minggu |
| Tahun ini | Per bulan |
| Kustom ≤2 days | Per jam |
| Kustom 3-31 days | Per hari |
| Kustom 32-364 days | Per minggu |
| Kustom 365+ days | Per bulan |

### Chart Title

Dynamic based on granularity:
- `"Pendapatan per Jam"`
- `"Pendapatan per Hari"`
- `"Pendapatan per Minggu"`
- `"Pendapatan per Bulan"`

### Changes

1. **`period.ts`** — Add `"year"` to `PeriodPreset`, add `getYearRange()` (Jan 1 → Dec 31)
2. **`dashboard.ts`** — Add `getDailyBreakdown()`, `getWeeklyBreakdown()`, `getMonthlyBreakdown()` queries
3. **`HourlyChart`** → Rename to **`RevenueChart`**, accept `type: "hourly" | "daily" | "weekly" | "monthly"` prop, dynamic title
4. **`dashboard.tsx`** page — Derive chart type from period, call appropriate query
5. **`period-selector.tsx`** — Add "Tahun Ini" button
6. **Update tests** — Revenue chart, period selector, dashboard DB queries

### Data Shapes

```ts
// Existing
interface HourlyRow { hour: number; revenue: number; }

// New
interface DailyRow { date: string; revenue: number; }      // "YYYY-MM-DD"
interface WeeklyRow { weekStart: string; revenue: number; } // "YYYY-MM-DD"
interface MonthlyRow { month: string; revenue: number; }    // "YYYY-MM"
```

### SQL Queries

- **Daily**: `strftime('%Y-%m-%d', created_at)` GROUP BY date
- **Weekly**: `strftime('%Y-%W', created_at)` GROUP BY week (ISO week)
- **Monthly**: `strftime('%Y-%m', created_at)` GROUP BY month
