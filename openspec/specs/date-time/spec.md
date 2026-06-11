# Date-Time

## Purpose

Sakti POS is an offline-first app used across Indonesian timezones. Business dates (e.g., "today", "yesterday") are determined by the outlet's configured timezone, not the device's local clock. The date-time module provides timezone-aware utilities that convert between UTC instants and business-local dates, enabling consistent date filtering for orders, dashboard queries, and receipt timestamps across the app.

## Requirements

### R1: Default Business Timezone

The system SHALL define `DEFAULT_BUSINESS_TIMEZONE` as `"Asia/Jakarta"`.

**WHEN** no outlet timezone is configured
**THEN** all date-time utilities default to `Asia/Jakarta`.

### R2: UTC Timestamp Formatting

The system SHALL provide `formatUtcTimestamp` to produce ISO 8601 UTC strings.

**WHEN** `formatUtcTimestamp()` is called (optionally with a dayjs instance)
**THEN** the system returns the current time (or the provided instant) as a UTC ISO string (e.g., `"2026-06-04T03:15:30.000Z"`).

### R3: Business Date Derivation

The system SHALL provide `getBusinessDate` to determine the current business date in a given timezone.

- The default timezone is `Asia/Jakarta`.
- The format is `YYYY-MM-DD`.

**WHEN** `getBusinessDate("Asia/Jayapura")` is called at 01:00 UTC (09:00 WIB, 10:00 WITA, 11:00 WIT)
**THEN** the system returns `"2026-06-04"` for WIB/WITA but the result depends on the timezone parameter — it returns the date as seen in that timezone.

### R4: Instant-to-Business-Date Conversion

The system SHALL provide `getBusinessDateFromInstant` to derive the business date from an ISO UTC timestamp.

**WHEN** `getBusinessDateFromInstant("2026-06-04T01:00:00.000Z", "Asia/Jakarta")` is called
**THEN** the system returns `"2026-06-04"` (01:00 UTC = 08:00 WIB).

**WHEN** `getBusinessDateFromInstant("2026-06-03T22:00:00.000Z", "Asia/Jakarta")` is called
**THEN** the system returns `"2026-06-04"` (22:00 UTC = 05:00 WIB next day).

### R5: Formatting in Business Timezone

The system SHALL provide `formatInBusinessTimezone` to format an ISO UTC timestamp in a target timezone.

- Default format: `"YYYY-MM-DD HH:mm"`.
- Default timezone: `Asia/Jakarta`.

**WHEN** `formatInBusinessTimezone("2026-06-04T03:00:00.000Z", "Asia/Makassar")` is called
**THEN** the system returns `"2026-06-04 11:00"` (UTC+8 for Makassar).

### R6: UTC Range for Business Date

The system SHALL provide `toUtcRangeForBusinessDate` to compute the UTC start and exclusive end of a business day.

- Returns `{ startUtc, endExclusiveUtc }` as ISO strings.
- `startUtc` is the start of the business day in the given timezone, converted to UTC.
- `endExclusiveUtc` is start + 1 day in the given timezone, converted to UTC.

**WHEN** `toUtcRangeForBusinessDate("2026-06-04", "Asia/Jakarta")` is called
**THEN** `startUtc` is `"2026-06-03T17:00:00.000Z"` (midnight WIB = 17:00 UTC previous day) and `endExclusiveUtc` is `"2026-06-04T17:00:00.000Z"`.

**WHEN** `toUtcRangeForBusinessDate("2026-06-04", "UTC")` is called
**THEN** `startUtc` is `"2026-06-04T00:00:00.000Z"` and `endExclusiveUtc` is `"2026-06-05T00:00:00.000Z"`.

### R7: Business Date Shifting

The system SHALL provide `shiftBusinessDate` to shift a business date by a number of days within the same timezone.

**WHEN** `shiftBusinessDate("2026-06-04", -1, "Asia/Jakarta")` is called
**THEN** the system returns `"2026-06-03"`.

**WHEN** `shiftBusinessDate("2026-06-04", 1, "Asia/Jakarta")` is called
**THEN** the system returns `"2026-06-05"`.

### R8: Business Week Start

The system SHALL provide `getBusinessWeekStart` to find the Monday of the week containing a given business date.

- The system uses ISO week numbering (Monday = start of week).

**WHEN** `getBusinessWeekStart("2026-06-04", "Asia/Jakarta")` is called (Thursday)
**THEN** the system returns `"2026-06-01"` (the Monday of that week).

**WHEN** `getBusinessWeekStart("2026-06-07", "Asia/Jakarta")` is called (Sunday)
**THEN** the system returns `"2026-06-01"` (Monday of that week, since Sunday = dayOfWeek 0, diffToMonday = 6).

### R9: Timezone-Aware Order Queries

The system SHALL use `toUtcRangeForBusinessDate` when filtering orders by business date, converting local business dates to UTC ranges before querying the database.

**WHEN** an order is created with `createdAt` as a UTC timestamp
**THEN** the system derives the business date via `getBusinessDateFromInstant(createdAt, timezone)`.

**WHEN** the order history filters by a business date
**THEN** the system converts the date to a UTC range via `toUtcRangeForBusinessDate` and filters `createdAt` within `[startUtc, endExclusiveUtc)`.

### R10: Dashboard Timezone Consistency

The system SHALL use the outlet's current timezone (`currentOutletTimezone()`) for all dashboard date range calculations.

**WHEN** dashboard data is fetched for a date range
**THEN** the system converts both `dateFrom` and `dateTo` to UTC ranges using `toUtcRangeForBusinessDate` with the outlet timezone before querying orders.

**WHEN** the outlet timezone changes
**THEN** dashboard cache keys include the timezone, ensuring stale data is not served.
