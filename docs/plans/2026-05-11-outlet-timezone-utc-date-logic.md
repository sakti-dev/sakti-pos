# Outlet Timezone UTC Date Logic Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep all persisted timestamps in UTC while making order numbering, "Hari Ini"/"Kemarin", order history, dashboard buckets, and receipts respect a per-outlet timezone that defaults to `Asia/Jakarta`.

**Architecture:** Store instants as UTC everywhere, but treat calendar-day logic as a business-time problem owned by each outlet. Add an explicit outlet `timezone` field, thread it through the API and local sync layer, and centralize all Dayjs timezone math in one helper module. Use UTC range bounds for persistence queries, then convert to the outlet timezone only when deriving dates, labels, and buckets.

**Tech Stack:** Dayjs with `utc` and `timezone` plugins, Drizzle schema/migrations, ts-proto protobuf generation, SolidJS UI, Vitest, Ultracite/Biome.

---

## Date Audit Summary

- Business-time paths that must use outlet timezone: order numbers, dashboard default ranges, date filters, receipt timestamps, order-card times, dashboard grouping labels, and any "today"/"yesterday" preset.
- UTC-only paths that should stay absolute: sync timestamps, session expiry, server event watermarks, and any conflict-resolution timestamps.
- Existing code that currently mixes the two models should be rewritten so UTC stays in storage, while the outlet timezone only affects display, filtering, and grouping.

### Task 1: Add Outlet Timezone To The Data Model And API Contract

**Files:**
- Modify: `packages/database/src/local-schema.ts`
- Modify: `packages/database/src/api-schema.ts`
- Modify: `packages/protobuf/proto/common.proto`
- Modify: `packages/protobuf/proto/outlets.proto`
- Modify: `apps/api/src/protobuf/domain.ts`
- Modify: `apps/api/src/outlets/routes.ts`
- Modify: `apps/pos-app/src/lib/auth/cloud.ts`
- Modify: `apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts`
- Modify: `apps/api/src/protobuf/__test__/domain.test.ts`
- Modify: `apps/api/src/outlets/__test__/routes.test.ts`
- Modify: `apps/pos-app/src/lib/auth/__test__/cloud.test.ts`
- Create: `apps/api/drizzle/0004_add_outlet_timezone.sql`
- Create: `apps/pos-app/drizzle/0006_add_outlet_timezone.sql`

**Step 1: Write the failing tests**

Add tests that prove:
- `Outlet` protobuf messages round-trip a `timezone` field.
- `encodeOutlet()` preserves `timezone` and defaults to `Asia/Jakarta` when the database row is missing it.
- `createOutlet()` and `updateOutlet()` accept and return `timezone`.
- The cloud adapter maps timezone through `getOutlets()` and `createOutlet()`.

**Step 2: Run the tests to verify they fail**

Run:
```bash
bun run test -- apps/api/src/protobuf/__test__/domain.test.ts apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts
```

Expected: fail because `timezone` is missing from the contract and adapters.

**Step 3: Write the minimal implementation**

- Add `timezone` as a non-null text field on both outlet schemas.
- Default it to `Asia/Jakarta` in local and cloud-facing code paths.
- Extend the proto schema and regenerate `packages/protobuf/src/common.ts` and `packages/protobuf/src/outlets.ts` with:
```bash
cd packages/protobuf && bun run generate
```
- Update API outlet create/update/list handlers to persist and encode the field.
- Update the POS cloud client to send and receive the field.

**Step 4: Run the tests to verify they pass**

Run:
```bash
bun run test -- apps/api/src/protobuf/__test__/domain.test.ts apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/database/src/local-schema.ts packages/database/src/api-schema.ts packages/protobuf/proto/common.proto packages/protobuf/proto/outlets.proto packages/protobuf/src/common.ts packages/protobuf/src/outlets.ts apps/api/src/protobuf/domain.ts apps/api/src/outlets/routes.ts apps/pos-app/src/lib/auth/cloud.ts apps/api/src/protobuf/__test__/domain.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts apps/api/drizzle/0004_add_outlet_timezone.sql apps/pos-app/drizzle/0006_add_outlet_timezone.sql
git commit -m "feat: add outlet timezone contract"
```

### Task 2: Centralize Dayjs Timezone Logic And Outlet Date Helpers

**Files:**
- Create: `apps/pos-app/src/lib/date-time.ts`
- Modify: `apps/pos-app/src/lib/dashboard/period.ts`
- Modify: `apps/pos-app/src/lib/time.ts` if any timestamp formatting helpers remain there
- Modify: `apps/pos-app/src/db/outlets.ts`
- Modify: `apps/pos-app/src/store/outlet.ts`
- Modify: `apps/pos-app/src/pages/dashboard/use-dashboard-data.ts`
- Modify: `apps/pos-app/src/pages/dashboard/dashboard.tsx`
- Modify: `apps/pos-app/src/pages/settings/use-settings.ts`
- Modify: `apps/pos-app/src/pages/settings/settings.tsx`
- Modify: `apps/pos-app/src/components/dashboard/period-selector.tsx`
- Modify: `apps/pos-app/src/lib/dashboard/__test__/period.test.ts`
- Create: `apps/pos-app/src/lib/__test__/date-time.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- `getTodayRange(timezone, now)` returns the correct local day at UTC midnight boundaries.
- `getYesterdayRange(timezone, now)` and `getPreviousRange()` stay consistent across timezones.
- `toUtcRangeForBusinessDate()` converts a local business date into the correct UTC start/end bounds.
- `formatInBusinessTimezone()` renders the same UTC instant differently for `Asia/Jakarta` and another IANA timezone.

**Step 2: Run the tests to verify they fail**

Run:
```bash
bun run test -- apps/pos-app/src/lib/dashboard/__test__/period.test.ts apps/pos-app/src/lib/__test__/date-time.test.ts
```

Expected: fail because the helper layer does not exist yet.

**Step 3: Write the minimal implementation**

- Add Dayjs `utc` and `timezone` plugin setup in one place.
- Create helpers for:
  - current business date in an IANA timezone
  - UTC start/end bounds for a business date
  - formatting a UTC instant for a business timezone
  - deriving previous ranges in business time
- Update dashboard period presets to accept the outlet timezone instead of using device-local time.
- Add outlet lookup helpers that can return the active outlet row, including `timezone`.

**Step 4: Run the tests to verify they pass**

Run:
```bash
bun run test -- apps/pos-app/src/lib/dashboard/__test__/period.test.ts apps/pos-app/src/lib/__test__/date-time.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/date-time.ts apps/pos-app/src/lib/dashboard/period.ts apps/pos-app/src/db/outlets.ts apps/pos-app/src/store/outlet.ts apps/pos-app/src/pages/dashboard/use-dashboard-data.ts apps/pos-app/src/pages/dashboard/dashboard.tsx apps/pos-app/src/pages/settings/use-settings.ts apps/pos-app/src/pages/settings/settings.tsx apps/pos-app/src/components/dashboard/period-selector.tsx apps/pos-app/src/lib/dashboard/__test__/period.test.ts apps/pos-app/src/lib/__test__/date-time.test.ts
git commit -m "feat: add outlet timezone helpers"
```

### Task 3: Keep Checkout UTC, But Derive Day-Based Output From The Outlet Timezone

**Files:**
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/pages/pos/use-pos.ts`
- Modify: `apps/pos-app/src/components/order-card.tsx`
- Modify: `apps/pos-app/src/lib/receipt/format-receipt.ts`
- Modify: `apps/pos-app/src/pages/__test__/order-history.test.tsx`
- Modify: `apps/pos-app/src/pages/pos/__test__/pos.test.tsx`
- Modify: `apps/pos-app/src/db/__test__/orders.test.ts`
- Modify: `apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- `createOrder()` still stores UTC timestamps, but order numbers are generated from the outlet timezone date.
- A transaction created at `00:12` in the outlet timezone lands in `Hari Ini`, not `Kemarin`.
- `OrderCard` and receipt formatting show the outlet-local wall clock time for the same UTC instant.

**Step 2: Run the tests to verify they fail**

Run:
```bash
bun run test -- apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/pages/pos/__test__/pos.test.tsx apps/pos-app/src/pages/__test__/order-history.test.tsx apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts
```

Expected: fail because the current checkout path does not carry outlet timezone through.

**Step 3: Write the minimal implementation**

- Revert any checkout timestamp helper that stores a local timestamp instead of UTC.
- Have checkout call a helper that:
  - stores `createdAt` and `updatedAt` as UTC instants
  - derives the order-number date prefix from the outlet timezone
  - formats receipt timestamps from UTC into the outlet timezone
- Pass the current outlet timezone from the app state into checkout and receipt generation.

**Step 4: Run the tests to verify they pass**

Run:
```bash
bun run test -- apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/pages/pos/__test__/pos.test.tsx apps/pos-app/src/pages/__test__/order-history.test.tsx apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/db/orders.ts apps/pos-app/src/pages/pos/use-pos.ts apps/pos-app/src/components/order-card.tsx apps/pos-app/src/lib/receipt/format-receipt.ts apps/pos-app/src/pages/__test__/order-history.test.tsx apps/pos-app/src/pages/pos/__test__/pos.test.tsx apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts
git commit -m "fix: keep checkout timestamps in utc"
```

### Task 4: Make Dashboard And Order History Filter And Group By Outlet Timezone

**Files:**
- Modify: `apps/pos-app/src/db/dashboard.ts`
- Modify: `apps/pos-app/src/pages/dashboard/use-dashboard-data.ts`
- Modify: `apps/pos-app/src/pages/dashboard/dashboard.tsx`
- Modify: `apps/pos-app/src/pages/order-history.tsx`
- Modify: `apps/pos-app/src/lib/dashboard/period.ts`
- Modify: `apps/pos-app/src/components/dashboard/revenue-chart.tsx`
- Modify: `apps/pos-app/src/components/dashboard/__test__/revenue-chart.test.tsx`
- Modify: `apps/pos-app/src/db/__test__/dashboard.test.ts`
- Modify: `apps/pos-app/src/pages/__test__/order-history.test.tsx`

**Step 1: Write the failing tests**

Add tests that prove:
- Dashboard "Hari Ini" uses the outlet timezone when calculating the default range.
- The order-history filter bounds include a transaction created just after local midnight in the correct day bucket.
- Daily/hourly/weekly/monthly dashboard buckets are built from outlet-local time, not SQLite UTC `strftime` grouping.

**Step 2: Run the tests to verify they fail**

Run:
```bash
bun run test -- apps/pos-app/src/db/__test__/dashboard.test.ts apps/pos-app/src/pages/__test__/order-history.test.tsx apps/pos-app/src/components/dashboard/__test__/revenue-chart.test.tsx
```

Expected: fail because the queries and default range still assume device-local or SQLite UTC behavior.

**Step 3: Write the minimal implementation**

- Keep SQL filters in UTC by converting the outlet-local day range to UTC bounds first.
- Replace timezone-sensitive `strftime()` grouping with application-layer bucketing when the chart depends on the outlet timezone.
- Make dashboard default range and "previous range" calculations use outlet timezone dates.
- Update chart labels to format bucket dates in the outlet timezone.

**Step 4: Run the tests to verify they pass**

Run:
```bash
bun run test -- apps/pos-app/src/db/__test__/dashboard.test.ts apps/pos-app/src/pages/__test__/order-history.test.tsx apps/pos-app/src/components/dashboard/__test__/revenue-chart.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/db/dashboard.ts apps/pos-app/src/pages/dashboard/use-dashboard-data.ts apps/pos-app/src/pages/dashboard/dashboard.tsx apps/pos-app/src/pages/order-history.tsx apps/pos-app/src/lib/dashboard/period.ts apps/pos-app/src/components/dashboard/revenue-chart.tsx apps/pos-app/src/components/dashboard/__test__/revenue-chart.test.tsx apps/pos-app/src/db/__test__/dashboard.test.ts apps/pos-app/src/pages/__test__/order-history.test.tsx
git commit -m "feat: make dashboard timezone aware"
```

### Task 5: Add Outlet Timezone Editing In Settings And Final UTC Sweep

**Files:**
- Modify: `apps/pos-app/src/pages/settings/settings.tsx`
- Modify: `apps/pos-app/src/pages/settings/use-settings.ts`
- Modify: `apps/pos-app/src/components/settings/printer-settings.tsx` if the new timezone control belongs in the same settings group
- Modify: `apps/pos-app/src/pages/onboarding.tsx`
- Modify: `apps/pos-app/src/pages/__test__/onboarding.test.tsx`
- Modify: `apps/pos-app/src/pages/settings/__test__/use-settings.test.ts`
- Modify: `apps/pos-app/src/pages/settings/__test__/settings.test.tsx`
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/lib/sync-cleanup.ts`
- Modify: `apps/api/src/registers/public-routes.ts`
- Modify: `apps/api/src/registers/protected-routes.ts`
- Modify: `apps/api/src/auth/routes.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- A manager/owner can see and update an outlet timezone in settings.
- New outlets default to `Asia/Jakarta` when no timezone is provided.
- The UTC-only backend paths still behave as absolute instants and do not get converted to outlet time accidentally.

**Step 2: Run the tests to verify they fail**

Run:
```bash
bun run test -- apps/pos-app/src/pages/settings/__test__/settings.test.tsx apps/pos-app/src/pages/settings/__test__/use-settings.test.ts apps/pos-app/src/pages/__test__/onboarding.test.tsx
```

Expected: fail until the settings UI and onboarding flow carry timezone through.

**Step 3: Write the minimal implementation**

- Add a timezone control to settings with `Asia/Jakarta` as the default.
- Persist timezone changes through the outlet update API.
- Ensure onboarding and cloud outlet creation carry the default timezone.
- Review the backend UTC-only files and leave their timestamp math unchanged unless a test shows a real bug.

**Step 4: Run the tests to verify they pass**

Run:
```bash
bun run test -- apps/pos-app/src/pages/settings/__test__/settings.test.tsx apps/pos-app/src/pages/settings/__test__/use-settings.test.ts apps/pos-app/src/pages/__test__/onboarding.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/settings/settings.tsx apps/pos-app/src/pages/settings/use-settings.ts apps/pos-app/src/pages/onboarding.tsx apps/pos-app/src/pages/settings/__test__/settings.test.tsx apps/pos-app/src/pages/settings/__test__/use-settings.test.ts apps/pos-app/src/pages/__test__/onboarding.test.tsx apps/api/src/sync/service.ts apps/api/src/lib/sync-cleanup.ts apps/api/src/registers/public-routes.ts apps/api/src/registers/protected-routes.ts apps/api/src/auth/routes.ts
git commit -m "feat: edit outlet timezone from settings"
```

## Final Verification

Run the full POS package checks after all tasks:

```bash
cd apps/pos-app
bun run test
bun run typecheck
bun x ultracite check
```

Run the protobuf package generation and typecheck after schema changes:

```bash
cd packages/protobuf
bun run generate
bun run typecheck
```

Run the API package tests and typecheck if any outlet or sync contract changed:

```bash
cd apps/api
bun test
bun run typecheck
```

Expected result: all tests pass, UTC storage remains intact, and every user-facing date path uses the outlet timezone consistently.
