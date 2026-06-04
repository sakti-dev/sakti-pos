# Dashboard

## Purpose

The dashboard provides sales analytics for manager and owner roles. It visualizes revenue trends, payment method breakdown, top-selling products, and category-level sales for a user-selected time period. All data is queried from the local SQLite database, scoped to the current outlet, and computed in the outlet's business timezone.

## Requirements

### R1: Period Preset Selection

The system SHALL provide a period selector with presets: "Hari ini" (Today), "Kemarin" (Yesterday), "Minggu ini" (This Week), "Bulan ini" (This Month), "Tahun ini" (This Year), and "Kustom" (Custom).

**WHEN** the user selects a preset
**THEN** the date range SHALL update to match the preset (today = single day, week = Monday–Sunday, month = first–last day of current month, year = January 1–December 31 of current year)

**WHEN** the user selects "Kustom"
**THEN** two date pickers SHALL appear allowing selection of an arbitrary dateFrom and dateTo range

**WHEN** the dashboard first loads
**THEN** the default preset SHALL be "Hari ini" (Today)

### R2: Sales Summary Cards

The system SHALL display four summary cards: Total Pendapatan (total revenue), Jumlah Pesanan (order count), Rata-rata/Pesanan (average order value), and vs Periode Lalu (comparison to previous period).

**WHEN** data is loading
**THEN** skeleton placeholders SHALL be displayed for all four cards

**WHEN** data is loaded
**THEN** total revenue SHALL be formatted as IDR currency, order count SHALL be an integer, average order value SHALL be total revenue divided by order count (rounded to nearest integer), and the delta SHALL show the percentage change from the equivalent previous period

**WHEN** the previous period had zero orders and the current period has orders
**THEN** the delta SHALL display "▲ Baru" (New) instead of a percentage

**WHEN** the previous period had zero orders and the current period also has zero orders
**THEN** the delta SHALL display "0%"

### R3: Adaptive Revenue Chart

The system SHALL display a revenue bar chart that adapts its granularity based on the selected period.

**WHEN** the preset is "Hari ini" or "Kemarin"
**THEN** the chart SHALL show hourly breakdown (24 bars, 00–23) with title "Pendapatan per Jam"

**WHEN** the preset is "Minggu ini"
**THEN** the chart SHALL show daily breakdown (one bar per day) with title "Pendapatan per Hari"

**WHEN** the preset is "Bulan ini"
**THEN** the chart SHALL show weekly breakdown (one bar per week) with title "Pendapatan per Minggu"

**WHEN** the preset is "Tahun ini"
**THEN** the chart SHALL show monthly breakdown (one bar per month) with title "Pendapatan per Bulan"

**WHEN** the preset is "Kustom"
**THEN** the chart SHALL auto-select granularity: hourly for ≤2 days, daily for 3–31 days, weekly for 32–364 days, monthly for ≥365 days

**WHEN** the chart is in hourly mode and data exists
**THEN** the top 3 hours by revenue SHALL be highlighted with a distinct color

**WHEN** the chart is in hourly mode and data exists
**THEN** the X-axis SHALL be trimmed to show only the range from the first hour with revenue minus 1 to the last hour with revenue plus 1

### R4: Payment Method Breakdown

The system SHALL display a doughnut chart showing revenue split between Cash (Tunai) and QRIS payment methods.

**WHEN** payment data is loaded
**THEN** the chart SHALL show a doughnut with 65% cutout, displaying cash and QRIS segments with percentage labels and IDR-formatted totals

**WHEN** there are no completed orders in the period
**THEN** "Belum ada data" (No data yet) SHALL be displayed

### R5: Top Products Ranking

The system SHALL display a horizontal bar chart of the top 10 products ranked by revenue, with a toggle between "Omzet" (revenue) and "Porsi" (quantity) views.

**WHEN** the user toggles to "Omzet"
**THEN** products SHALL be sorted by total revenue descending, bars SHALL show revenue values, and tooltips SHALL show IDR-formatted revenue with quantity in parentheses

**WHEN** the user toggles to "Porsi"
**THEN** products SHALL be sorted by total quantity descending, bars SHALL show quantity values, and tooltips SHALL show quantity with IDR revenue in parentheses

**WHEN** there are no order items in the period
**THEN** "Belum ada data" SHALL be displayed

### R6: Sales by Category

The system SHALL display a horizontal bar chart showing total revenue per product category, ordered by revenue descending.

**WHEN** category data is loaded
**THEN** each bar SHALL represent one category, with the bar length proportional to revenue and tooltips showing IDR-formatted values

**WHEN** there are no completed orders with categorized products in the period
**THEN** "Belum ada data" SHALL be displayed

### R7: Rupiah-Formatted Axes

The system SHALL format revenue axes using abbreviated Rupiah notation.

**WHEN** the axis value is zero
**THEN** it SHALL display "0"

**WHEN** the axis value is ≥1,000,000
**THEN** it SHALL display "{value}/1,000,000jt" (e.g., "2jt")

**WHEN** the axis value is ≥1,000 and <1,000,000
**THEN** it SHALL display "{value}/1,000rb" (e.g., "150rb")

**WHEN** the axis value is <1,000
**THEN** it SHALL display the raw number

### R8: Period Comparison (Previous Period Delta)

The system SHALL compute the previous period for comparison by taking the same duration immediately before the selected range.

**WHEN** a date range is selected
**THEN** the previous period SHALL start at (dateFrom − number of days in range − 1) and end at (dateFrom − 1)

**WHEN** the selected range is today (1 day)
**THEN** the previous period SHALL be yesterday

**WHEN** the previous period summary is available
**THEN** the delta percentage SHALL be computed as ((currentRevenue − previousRevenue) / previousRevenue) × 100, rounded to the nearest integer

### R9: Access Control

The dashboard route SHALL be restricted to manager and owner roles.

**WHEN** a cashier navigates to "/"
**THEN** the system SHALL not render the dashboard (route guard blocks access)

**WHEN** a manager or owner navigates to "/"
**THEN** the dashboard SHALL render

### R10: Outlet-Scoped Data

All dashboard queries SHALL filter data by the current outlet.

**WHEN** the current outlet has an ID
**THEN** all queries (summary, payment breakdown, revenue, top products, category sales) SHALL include an outlet filter condition

**WHEN** the current outlet has no ID (all-outlet view)
**THEN** queries SHALL return data across all outlets

### R11: Timezone-Aware Date Grouping

All date-based grouping SHALL use the outlet's business timezone for determining day boundaries.

**WHEN** computing hourly, daily, weekly, or monthly revenue
**THEN** order timestamps SHALL be converted to the outlet's business timezone before extracting hour, date, week-start, or month

**WHEN** determining the start/end of a period preset
**THEN** the calculation SHALL use the outlet's timezone, not UTC

### R12: Responsive Layout

The dashboard SHALL adapt its layout for phone and tablet screens.

**WHEN** on a phone screen
**THEN** summary cards SHALL display in a 2-column grid, charts SHALL have reduced tick density (maxTicksLimit), and X-axis labels SHALL rotate 45 degrees

**WHEN** on a tablet/desktop screen (≥lg breakpoint)
**THEN** summary cards SHALL display in a 4-column grid, and the bottom section SHALL split into a 7/5 column layout with TopProducts on the left and PaymentBreakdown + CategoryChart stacked on the right

### R13: Loading States

The system SHALL display skeleton placeholders while any dashboard data is loading.

**WHEN** any query is in a loading state
**THEN** the corresponding component SHALL display a Skeleton placeholder instead of chart or card content

**WHEN** all queries have completed
**THEN** the loading overlay SHALL be removed and actual data SHALL be rendered
