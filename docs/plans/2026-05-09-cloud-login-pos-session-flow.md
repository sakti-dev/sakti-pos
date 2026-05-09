# Cloud Login POS Session Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make cloud email/password login a valid setup-session login for owners/managers, while keeping PIN login as the daily local unlock and staff-switch mechanism.

**Architecture:** Add a durable mapping between cloud users and POS staff via `staff.cloud_user_id`, expose an API endpoint that resolves or claims the current cloud user's staff row, sync that mapping to local SQLite, then let the app set the active local user after cloud login without asking for a PIN. Existing PIN login remains unchanged for app restart, manual lock, and cashier/staff switching.

**Tech Stack:** SolidJS, Tauri, TypeScript, Vitest, Elysia, Drizzle ORM, SQLite/Turso, Rust sync bridge.

---

## Product Rules

The target behavior is:

- First-time account registration: cloud register -> create merchant -> create outlet -> create owner PIN -> enter POS.
- Existing account on reinstall/new device: cloud login -> select merchant/outlet -> sync -> enter POS as the cloud-linked owner/manager, no immediate PIN prompt.
- Later app launches: app starts with local auth empty -> show PIN login.
- Manual logout/lock: clear local auth only -> show PIN login.
- Cloud disconnect: clear cloud token + outlet context + local auth -> show cloud login.
- Existing merchant/outlet with no staff anywhere: after cloud login and sync, show owner PIN creation as recovery.
- Existing merchant/outlet with staff but no cloud-user mapping: cloud owner can claim a single existing owner staff row once; if ambiguous, fall back to PIN login.
- No unauthenticated setup-PIN route: `/login` must not send users to owner PIN creation unless a valid cloud session exists.

## Current Problems Found

- `store/auth.user` is only set by `login(staffId, pin)`, so cloud password auth never grants app access.
- `users/user_merchants` cloud identity and `staff` POS identity are separate with no durable mapping.
- `cloud-login.tsx` can only choose between `/login` and setup PIN based on local staff count, not cloud user ownership.
- `login.tsx` currently redirects paired devices with zero staff to setup PIN based only on local outlet context. That is too permissive without validating a cloud session.
- `staff` sync has no `cloud_user_id`, so even if API links a cloud user to staff, the app cannot identify that staff locally after sync.

---

## Task 1: Add Failing Store Tests For Cloud Staff Login

**Files:**
- Modify: `apps/pos-app/src/store/__test__/auth.test.ts`
- Modify later: `apps/pos-app/src/store/auth.ts`

**Step 1: Write failing tests**

Add these tests under `describe("cloud staff login")`:

```ts
test("loginWithCloudStaff sets active user without verifying PIN", async () => {
	mockDbSelect.mockResolvedValue([
		{ id: "staff-owner", name: "Owner", role: "owner", isActive: true },
	]);

	const { loginWithCloudStaff } = await import("~/store/auth");
	const result = await loginWithCloudStaff("staff-owner");

	expect(mockVerifyPin).not.toHaveBeenCalled();
	expect(mockSetUser).toHaveBeenCalledWith({
		id: "staff-owner",
		name: "Owner",
		role: "owner",
	});
	expect(result).toEqual({
		id: "staff-owner",
		name: "Owner",
		role: "owner",
	});
	expect(localStorage.getItem("sakti-pos:last-staff-id")).toBe("staff-owner");
});

test("loginWithCloudStaff rejects inactive staff", async () => {
	mockDbSelect.mockResolvedValue([
		{ id: "staff-owner", name: "Owner", role: "owner", isActive: false },
	]);

	const { loginWithCloudStaff } = await import("~/store/auth");

	await expect(loginWithCloudStaff("staff-owner")).rejects.toThrow(
		"Staff is deactivated",
	);
});
```

**Step 2: Verify red**

Run:

```bash
bun run test src/store/__test__/auth.test.ts
```

Expected: FAIL because `loginWithCloudStaff` is not exported.

**Step 3: Implement minimal code**

In `apps/pos-app/src/store/auth.ts`, add:

```ts
export const loginWithCloudStaff = async (
	staffId: string,
): Promise<AuthUser> => {
	const rows = await db
		.select({
			id: staff.id,
			isActive: staff.isActive,
			name: staff.name,
			role: staff.role,
		})
		.from(staff)
		.where(eq(staff.id, staffId));

	const row = rows[0];
	if (!row) {
		throw new Error("Staff not found");
	}
	if (!row.isActive) {
		throw new Error("Staff is deactivated");
	}

	const authUser = {
		id: row.id,
		name: row.name,
		role: row.role as AuthUser["role"],
	};
	setUser(authUser);
	setLastUserId(authUser.id);
	return authUser;
};
```

**Step 4: Verify green**

Run:

```bash
bun run test src/store/__test__/auth.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/store/auth.ts apps/pos-app/src/store/__test__/auth.test.ts
git commit -m "feat: allow cloud session to activate linked staff"
```

---

## Task 2: Add `cloud_user_id` To Staff Schemas And Migrations

**Files:**
- Modify: `packages/database/src/api-schema.ts`
- Modify: `packages/database/src/local-schema.ts`
- Create: `apps/api/drizzle/XXXX_add_staff_cloud_user_id.sql`
- Create: `apps/pos-app/drizzle/XXXX_add_staff_cloud_user_id.sql`
- Modify: `apps/pos-app/src-tauri/src/drizzle_proxy.rs`

**Step 1: Write failing type-oriented tests**

Add a small schema assertion test if none exists:

Create `packages/database/src/__test__/staff-schema.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { staff as apiStaff } from "../api-schema";
import { staff as localStaff } from "../local-schema";

describe("staff schema", () => {
	test("api and local staff expose cloudUserId", () => {
		expect(apiStaff.cloudUserId).toBeDefined();
		expect(localStaff.cloudUserId).toBeDefined();
	});
});
```

If the database package has no test script, skip this file and rely on `tsc --noEmit`; do not add a new test runner just for this.

**Step 2: Verify red**

Run:

```bash
bun run check-types
```

Expected: FAIL where `cloudUserId` is referenced but missing.

**Step 3: Update schemas**

In both `api-schema.ts` and `local-schema.ts`, add to `staff`:

```ts
cloudUserId: text("cloud_user_id"),
```

In API schema, add a reference if acceptable:

```ts
cloudUserId: text("cloud_user_id").references(() => users.id),
```

Keep it nullable for legacy rows and cashier rows.

**Step 4: Generate migrations**

Run:

```bash
cd apps/api && bunx drizzle-kit generate
cd ../pos-app && bunx drizzle-kit generate
```

Expected migration content:

```sql
ALTER TABLE `staff` ADD `cloud_user_id` text;
```

**Step 5: Register local migration in Rust**

In `apps/pos-app/src-tauri/src/drizzle_proxy.rs`, add the generated migration to `MIGRATIONS`.

**Step 6: Verify**

Run:

```bash
bun run check-types
bun x ultracite check packages/database/src/api-schema.ts packages/database/src/local-schema.ts apps/pos-app/src-tauri/src/drizzle_proxy.rs
```

Expected: PASS.

**Step 7: Commit**

```bash
git add packages/database/src apps/api/drizzle apps/pos-app/drizzle apps/pos-app/src-tauri/src/drizzle_proxy.rs
git commit -m "migration: link staff rows to cloud users"
```

---

## Task 3: Add API Endpoint To Resolve Current Cloud User Staff

**Files:**
- Modify: `apps/api/src/routes/staff.ts`
- Test: `apps/api/src/__test__/staff.test.ts` or create if missing

**API contract:**

`POST /api/merchants/:merchantId/staff/me`

Returns:

```ts
type CurrentStaffResponse =
	| {
			staff: {
				id: string;
				merchantId: string;
				outletId: string | null;
				name: string;
				role: "owner" | "manager" | "cashier";
				isActive: boolean;
				hasPin: boolean;
			};
			claimed: boolean;
	  }
	| {
			staff: null;
			claimed: false;
			reason: "no-staff" | "ambiguous-owner" | "not-allowed";
	  };
```

Resolution rules:

- Require cloud session.
- Require `userMerchants` membership for `merchantId`.
- If an active staff row already has `cloudUserId = session.userId`, return it.
- If no mapped staff and membership role is `owner`, find active owner staff rows for merchant with `cloudUserId IS NULL`.
- If exactly one unclaimed active owner exists, set its `cloudUserId` to `session.userId`, update `updatedAt`, return it with `claimed: true`.
- If zero staff rows exist, return `{ staff: null, claimed: false, reason: "no-staff" }`.
- If multiple unclaimed owners exist, return `{ staff: null, claimed: false, reason: "ambiguous-owner" }`.
- If membership role is not owner and no direct staff mapping exists, return `{ staff: null, claimed: false, reason: "not-allowed" }`.

**Step 1: Write failing API tests**

Add tests:

```ts
test("returns mapped current staff when cloudUserId matches session user", async () => {
	// mock session user-1, membership owner, staff cloudUserId user-1
	// expect 200 and staff.id === "staff-1", claimed false, hasPin true
});

test("claims a single unclaimed owner staff for owner membership", async () => {
	// mock no mapped staff, membership owner, one active owner cloudUserId null
	// expect update called with cloudUserId: "user-1"
	// expect 200 and claimed true
});

test("does not claim ambiguous owner staff rows", async () => {
	// mock two active owners cloudUserId null
	// expect staff null reason ambiguous-owner
});

test("returns no-staff when merchant has no staff", async () => {
	// mock no mapped staff and no unclaimed owners
	// expect staff null reason no-staff
});
```

**Step 2: Verify red**

Run:

```bash
bun test apps/api/src/__test__/staff.test.ts
```

Expected: FAIL because route does not exist.

**Step 3: Implement route**

Use existing `verifyMerchantAccess` helper pattern in `staff.ts`, but also fetch membership role:

```ts
async function getMerchantMembership(userId: string, merchantId: string) {
	const [row] = await db
		.select({ id: userMerchants.id, role: userMerchants.role })
		.from(userMerchants)
		.where(
			and(
				eq(userMerchants.userId, userId),
				eq(userMerchants.merchantId, merchantId),
			),
		)
		.limit(1);
	return row ?? null;
}
```

Add `POST /merchants/:merchantId/staff/me`.

Use `isActive = true`, `role = "owner"` for owner claiming, and `cloudUserId IS NULL` for unclaimed rows. If Drizzle helpers need `isNull`, import it from `drizzle-orm`.

**Step 4: Verify green**

Run:

```bash
bun test apps/api/src/__test__/staff.test.ts
```

Expected: PASS.

**Step 5: API lint/type checks**

Run:

```bash
bun run --filter=@repo/api check-types
bun run --filter=@repo/api lint
```

If package filtering is unavailable, run from `apps/api`:

```bash
bun run check-types
bun run lint
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/staff.ts apps/api/src/__test__/staff.test.ts
git commit -m "feat: resolve cloud user staff identity"
```

---

## Task 4: Add Client API Method For Current Cloud Staff

**Files:**
- Modify: `apps/pos-app/src/lib/cloud-auth.ts`
- Test: `apps/pos-app/src/lib/__test__/cloud-auth.test.ts`

**Step 1: Write failing tests**

Add test that mocks `fetch` and verifies:

```ts
const result = await getCurrentCloudStaff("merchant-1");
expect(fetch).toHaveBeenCalledWith(
	expect.stringContaining("/api/merchants/merchant-1/staff/me"),
	expect.objectContaining({ method: "POST" }),
);
expect(result.staff?.id).toBe("staff-1");
```

**Step 2: Verify red**

Run:

```bash
bun run test src/lib/__test__/cloud-auth.test.ts
```

Expected: FAIL because `getCurrentCloudStaff` is not exported.

**Step 3: Implement minimal client method**

In `cloud-auth.ts`:

```ts
interface CurrentCloudStaff {
	claimed: boolean;
	reason?: "no-staff" | "ambiguous-owner" | "not-allowed";
	staff: {
		hasPin: boolean;
		id: string;
		isActive: boolean;
		merchantId: string;
		name: string;
		outletId: string | null;
		role: "cashier" | "manager" | "owner";
	} | null;
}

export async function getCurrentCloudStaff(
	merchantId: string,
): Promise<CurrentCloudStaff> {
	return apiFetch(`/api/merchants/${merchantId}/staff/me`, {
		method: "POST",
	});
}
```

Export the type.

**Step 4: Verify green**

Run:

```bash
bun run test src/lib/__test__/cloud-auth.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/cloud-auth.ts apps/pos-app/src/lib/__test__/cloud-auth.test.ts
git commit -m "feat: add current cloud staff API client"
```

---

## Task 5: Add Local Staff Lookup By Cloud User ID

**Files:**
- Modify: `apps/pos-app/src/db/staff.ts`
- Test: `apps/pos-app/src/db/__test__/staff.test.ts`

**Step 1: Write failing tests**

Add:

```ts
test("getStaffByCloudUserId filters by merchant and cloud user", async () => {
	const { getStaffByCloudUserId } = await import("../staff");
	await getStaffByCloudUserId("merchant-1", "user-1");

	expect(mockSelect).toHaveBeenCalled();
	expect(mockEq).toHaveBeenCalledWith(staff.merchantId, "merchant-1");
	expect(mockEq).toHaveBeenCalledWith(staff.cloudUserId, "user-1");
});
```

Adapt to the existing mock structure in the file.

**Step 2: Verify red**

Run:

```bash
bun run test src/db/__test__/staff.test.ts
```

Expected: FAIL because helper is missing.

**Step 3: Implement helper**

```ts
export async function getStaffByCloudUserId(
	merchantId: string,
	cloudUserId: string,
): Promise<StaffMember | undefined> {
	const [row] = await db
		.select()
		.from(staff)
		.where(
			and(
				eq(staff.merchantId, merchantId),
				eq(staff.cloudUserId, cloudUserId),
				eq(staff.isActive, true),
			),
		)
		.limit(1);
	return row;
}
```

**Step 4: Verify green**

Run:

```bash
bun run test src/db/__test__/staff.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/db/staff.ts apps/pos-app/src/db/__test__/staff.test.ts
git commit -m "feat: find local staff by cloud user"
```

---

## Task 6: Change Cloud Login Outlet Selection To Enter App Directly

**Files:**
- Modify: `apps/pos-app/src/pages/cloud-login.tsx`
- Modify: `apps/pos-app/src/pages/__test__/cloud-login.test.tsx`

**New flow inside `handleSelectOutlet`:**

1. Set outlet context.
2. Call `getCurrentCloudStaff(outlet.merchantId)` before sync.
3. Run `syncNow()`.
4. If endpoint returned a staff row:
   - Find it locally by id or by cloud user id after sync.
   - Call `loginWithCloudStaff(staff.id)`.
   - Navigate to `/pos` for cashier, `/` for owner/manager.
5. If endpoint returned `staff: null` and reason is `no-staff`:
   - Navigate to `/onboarding?merchantId=...&outletId=...`.
6. If endpoint returned `staff: null` and reason is `ambiguous-owner` or `not-allowed`:
   - Navigate to `/login`.
7. If sync fails:
   - Stay on outlet picker and show sync error.

**Step 1: Write failing tests**

Replace/adjust the existing "returning user selects outlet and goes to login page" test.

Add:

```ts
test("owner selects outlet and enters dashboard without PIN after cloud login", async () => {
	mockGetCurrentCloudStaff.mockResolvedValueOnce({
		claimed: false,
		staff: {
			hasPin: true,
			id: "staff-owner",
			isActive: true,
			merchantId: "m1",
			name: "Owner",
			outletId: "o1",
			role: "owner",
		},
	});
	mockLoginWithCloudStaff.mockResolvedValueOnce({
		id: "staff-owner",
		name: "Owner",
		role: "owner",
	});

	// login, choose merchant, choose outlet

	expect(mockSyncNow).toHaveBeenCalled();
	expect(mockLoginWithCloudStaff).toHaveBeenCalledWith("staff-owner");
	expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
});

test("cashier cloud-linked staff enters POS after outlet selection", async () => {
	// same but role cashier, expect /pos
});

test("no cloud staff and no merchant staff goes to setup PIN recovery", async () => {
	mockGetCurrentCloudStaff.mockResolvedValueOnce({
		claimed: false,
		reason: "no-staff",
		staff: null,
	});
	mockGetActiveStaff.mockResolvedValueOnce([]);
	// expect /onboarding?merchantId=m1&outletId=o1
});

test("ambiguous owner mapping falls back to PIN login", async () => {
	mockGetCurrentCloudStaff.mockResolvedValueOnce({
		claimed: false,
		reason: "ambiguous-owner",
		staff: null,
	});
	mockGetActiveStaff.mockResolvedValueOnce([
		{ id: "staff-1", name: "Owner A", role: "owner" },
	]);
	// expect /login
});
```

**Step 2: Verify red**

Run:

```bash
bun run test src/pages/__test__/cloud-login.test.tsx
```

Expected: FAIL because code still navigates to `/login` for existing staff and lacks mocks/imports.

**Step 3: Implement minimal changes**

Update imports:

```ts
import { getCurrentCloudStaff } from "~/lib/cloud-auth";
import { getActiveStaff, loginWithCloudStaff } from "~/store/auth";
```

In `handleSelectOutlet`, replace the active-staff-only logic with the new flow above.

Use role routing:

```ts
const routeForRole = (role: string) => (role === "cashier" ? "/pos" : "/");
```

If `loginWithCloudStaff` fails because local sync did not materialize the staff row, show:

```ts
setError("Data pengguna belum tersinkron. Coba sinkronkan lagi.");
```

Do not silently route to setup PIN in that case.

**Step 4: Verify green**

Run:

```bash
bun run test src/pages/__test__/cloud-login.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/cloud-login.tsx apps/pos-app/src/pages/__test__/cloud-login.test.tsx
git commit -m "fix: enter app after cloud outlet selection"
```

---

## Task 7: Secure The No-Staff Login Fallback

**Files:**
- Modify: `apps/pos-app/src/pages/login.tsx`
- Modify: `apps/pos-app/src/pages/__test__/login.test.tsx`

**Problem:** Current `/login` can route to setup PIN based only on persisted outlet context. That allows setup-PIN navigation without proving cloud identity.

**Step 1: Write failing tests**

Mock `isCloudAuthenticated`.

Add:

```ts
test("redirects paired no-staff device to cloud login when cloud session is absent", async () => {
	mockCurrentMerchantId.mockReturnValue("m1");
	mockCurrentOutletId.mockReturnValue("o1");
	mockIsCloudAuthenticated.mockResolvedValueOnce(false);
	mockGetActiveStaff.mockResolvedValueOnce([]);

	render(() => <Login />);

	await vi.waitFor(() => {
		expect(mockNavigate).toHaveBeenCalledWith("/cloud-login", {
			replace: true,
		});
	});
});

test("redirects paired no-staff device to setup PIN only with cloud session", async () => {
	mockCurrentMerchantId.mockReturnValue("m1");
	mockCurrentOutletId.mockReturnValue("o1");
	mockIsCloudAuthenticated.mockResolvedValueOnce(true);
	mockGetActiveStaff.mockResolvedValueOnce([]);

	render(() => <Login />);

	await vi.waitFor(() => {
		expect(mockNavigate).toHaveBeenCalledWith(
			"/onboarding?merchantId=m1&outletId=o1",
			{ replace: true },
		);
	});
});
```

**Step 2: Verify red**

Run:

```bash
bun run test src/pages/__test__/login.test.tsx
```

Expected: FAIL because current code does not check cloud auth.

**Step 3: Implement**

Import:

```ts
import { isCloudAuthenticated } from "~/lib/cloud-auth";
```

In the `activeStaff.length === 0` branch:

```ts
const hasCloudSession = await isCloudAuthenticated();
if (hasCloudSession && merchantId && outletId) {
	navigate(`/onboarding?merchantId=${merchantId}&outletId=${outletId}`, {
		replace: true,
	});
	return;
}
navigate("/cloud-login", { replace: true });
```

**Step 4: Verify green**

Run:

```bash
bun run test src/pages/__test__/login.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/login.tsx apps/pos-app/src/pages/__test__/login.test.tsx
git commit -m "fix: require cloud session before setup PIN recovery"
```

---

## Task 8: Ensure Owner PIN Creation Links Cloud User

**Files:**
- Modify: `apps/pos-app/src/pages/onboarding.tsx`
- Modify: `apps/pos-app/src/pages/__test__/onboarding.test.tsx`
- Possibly modify: `apps/api/src/routes/staff.ts`

**Preferred approach:** After creating owner staff and syncing, call `getCurrentCloudStaff(merchant.id)` so API claims/maps the created owner staff to the current cloud user, then sync again if `claimed` is true.

**Step 1: Write failing test**

In onboarding test:

```ts
test("owner PIN setup links created staff to current cloud user", async () => {
	mockCreateStaffApi.mockResolvedValueOnce({ id: "staff-owner" });
	mockGetCurrentCloudStaff.mockResolvedValueOnce({
		claimed: true,
		staff: {
			hasPin: true,
			id: "staff-owner",
			isActive: true,
			merchantId: "m1",
			name: "Owner",
			outletId: "o1",
			role: "owner",
		},
	});

	// complete PIN setup

	expect(mockGetCurrentCloudStaff).toHaveBeenCalledWith("m1");
	expect(mockSyncNow).toHaveBeenCalledTimes(2);
});
```

**Step 2: Verify red**

Run:

```bash
bun run test src/pages/__test__/onboarding.test.tsx
```

Expected: FAIL.

**Step 3: Implement**

After `createStaffApi(...)`:

```ts
const currentCloudStaff = await getCurrentCloudStaff(merchant.id);
await syncNow();
if (currentCloudStaff.claimed) {
	await syncNow();
}
```

If the API endpoint already maps staff during creation later, avoid double sync and update the test accordingly. Keep behavior minimal.

**Step 4: Verify green**

Run:

```bash
bun run test src/pages/__test__/onboarding.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/onboarding.tsx apps/pos-app/src/pages/__test__/onboarding.test.tsx
git commit -m "fix: link owner PIN setup to cloud user"
```

---

## Task 9: End-To-End Regression Test For Reinstall Flow

**Files:**
- Create or modify: `apps/pos-app/src/pages/__test__/cloud-reinstall-flow.test.tsx`

**Step 1: Write failing integration-style component test**

Test a realistic sequence:

```ts
test("reinstall flow enters app after cloud login without asking for PIN", async () => {
	// render CloudLogin
	// mock login returns user
	// mock merchants returns one owner merchant
	// mock outlets returns one outlet
	// mock getCurrentCloudStaff returns owner staff
	// mock syncNow resolves
	// mock loginWithCloudStaff resolves owner
	// assert no navigation to /login
	// assert navigation to /
});
```

**Step 2: Verify red or use as regression**

If Task 6 already made it pass, keep this as a regression test and verify it passes.

Run:

```bash
bun run test src/pages/__test__/cloud-reinstall-flow.test.tsx
```

Expected: PASS after Task 6.

**Step 3: Commit**

```bash
git add apps/pos-app/src/pages/__test__/cloud-reinstall-flow.test.tsx
git commit -m "test: cover cloud reinstall login flow"
```

---

## Task 10: Full Verification

**Files:** all changed files.

**Step 1: Run focused POS tests**

```bash
cd apps/pos-app
bun run test src/store/__test__/auth.test.ts src/pages/__test__/cloud-login.test.tsx src/pages/__test__/login.test.tsx src/pages/__test__/onboarding.test.tsx src/db/__test__/staff.test.ts
```

Expected: PASS.

**Step 2: Run API tests**

```bash
bun test apps/api/src/__test__/staff.test.ts apps/api/src/__test__/auth.test.ts
```

Expected: PASS.

**Step 3: Run type checks**

```bash
cd apps/pos-app && bun run check-types
cd ../api && bun run check-types
```

Expected: PASS.

**Step 4: Run Ultracite**

```bash
bun x ultracite check
```

Expected: PASS or only unrelated pre-existing warnings. If unrelated warnings appear, record them explicitly.

**Step 5: Manual Android smoke test**

Use a test account with existing merchant, outlet, owner staff, and products:

1. Clear app data or reinstall.
2. Launch app.
3. Cloud login with email/password.
4. Select merchant.
5. Select outlet.
6. Expected: dashboard/POS opens directly, no PIN prompt.
7. Kill app.
8. Reopen app.
9. Expected: PIN login appears.
10. Enter existing owner PIN.
11. Expected: app opens and products are present.

Use a test account with merchant/outlet but no staff:

1. Cloud login.
2. Select merchant/outlet.
3. Expected: owner PIN creation screen appears.

**Step 6: Final commit**

```bash
git status --short
git add <all files changed by this plan>
git commit -m "fix: streamline cloud login and local PIN flow"
```

---

## Notes And Non-Goals

- This plan does not implement Google OAuth token handoff into the Tauri app. That is a separate flow issue.
- This plan does not change cashier daily workflow. Cashiers still use PIN.
- This plan intentionally avoids storing the cloud email/password session as a permanent local POS auth session. App restart still requires PIN.
- If multiple owner staff rows exist and none are mapped, the app should not guess. It should fall back to PIN login and let an authenticated owner resolve staff mapping later.
- If the server has products but no staff, setup PIN recovery is correct because POS actions require a staff identity for orders.

