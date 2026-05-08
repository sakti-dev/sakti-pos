# Login Flow Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the login/auth flow so fresh installs go to cloud login first, owners bypass device pairing, pairing codes become 8 alphanumeric characters, and managers get an outlet selector on the POS page.

**Architecture:** Two auth layers remain (cloud session + local PIN), but the entry point changes based on device state. Fresh/unpaired devices → cloud login. Paired devices with staff → PIN login. Owner registration auto-pairs (no code needed). Employee devices use 8-char alphanumeric pairing codes. Managers see an outlet selector in the POS topbar; cashiers are locked to their paired outlet.

**Tech Stack:** SolidJS, Solid Router, Tauri SQLite (drizzle-orm), Elysia (API), bun:test, vitest

---

### Task 1: Add `isDevicePaired()` helper to outlet.ts

**Files:**
- Modify: `apps/pos-app/src/lib/outlet.ts`

**Step 1: Write the failing test**

Create `apps/pos-app/src/lib/__test__/outlet.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	clearOutletContext,
	isDevicePaired,
	loadOutletContext,
	setOutletContext,
} from "../outlet";

describe("isDevicePaired", () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		clearOutletContext();
		localStorage.clear();
	});

	test("returns false when no outlet context exists", () => {
		expect(isDevicePaired()).toBe(false);
	});

	test("returns true when outlet context is set", () => {
		setOutletContext("outlet-1", "merchant-1");
		expect(isDevicePaired()).toBe(true);
	});

	test("returns false after clearing context", () => {
		setOutletContext("outlet-1", "merchant-1");
		clearOutletContext();
		expect(isDevicePaired()).toBe(false);
	});

	test("returns true after loading persisted context", () => {
		setOutletContext("outlet-1", "merchant-1", "register-1");
		clearOutletContext();
		loadOutletContext();
		expect(isDevicePaired()).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/lib/__test__/outlet.test.ts`
Expected: FAIL — `isDevicePaired` is not exported

**Step 3: Add `isDevicePaired` export to outlet.ts**

Add to `apps/pos-app/src/lib/outlet.ts`:

```ts
export const isDevicePaired = (): boolean => currentOutletId() !== null;
```

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/lib/__test__/outlet.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add isDevicePaired helper to outlet context
```

---

### Task 2: Add `isCloudAuthenticated()` helper to cloud-auth.ts

**Files:**
- Modify: `apps/pos-app/src/lib/cloud-auth.ts`
- Create: `apps/pos-app/src/lib/__test__/cloud-auth.test.ts`

**Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("isCloudAuthenticated", () => {
	beforeEach(() => {
		document.cookie = "narvik_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
	});
	afterEach(() => {
		document.cookie = "narvik_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
	});

	test("returns false when no session cookie exists", async () => {
		const { isCloudAuthenticated } = await import("../cloud-auth");
		expect(isCloudAuthenticated()).toBe(false);
	});

	test("returns true when session cookie exists", async () => {
		document.cookie = "narvik_session=test-token; path=/";
		const { isCloudAuthenticated } = await import("../cloud-auth");
		expect(isCloudAuthenticated()).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/lib/__test__/cloud-auth.test.ts`
Expected: FAIL — `isCloudAuthenticated` is not exported

**Step 3: Add `isCloudAuthenticated` export to cloud-auth.ts**

Add to `apps/pos-app/src/lib/cloud-auth.ts`:

```ts
export function isCloudAuthenticated(): boolean {
	const match = document.cookie.match(/(?:^|;\s*)narvik_session=([^;]*)/);
	return !!match?.[1];
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/lib/__test__/cloud-auth.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add isCloudAuthenticated helper
```

---

### Task 3: Auto-redirect fresh installs to cloud login

**Files:**
- Modify: `apps/pos-app/src/pages/login.tsx`

**Step 1: Write the failing test**

Modify `apps/pos-app/src/pages/__test__/login.test.tsx` — add a test for auto-redirect:

```ts
test("redirects to /cloud-login when no active staff exist", async () => {
	vi.mocked(getActiveStaff).mockResolvedValue([]);
	render(() => <Login />);
	await vi.waitFor(() => {
		expect(mockNavigate).toHaveBeenCalledWith("/cloud-login", { replace: true });
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/login.test.tsx`
Expected: FAIL — no redirect happens

**Step 3: Add auto-redirect logic to login.tsx**

In the `onMount` callback in `login.tsx`, after `setLoading(false)`, add:

```ts
if (activeStaff.length === 0) {
	navigate("/cloud-login", { replace: true });
	return;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/login.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat: auto-redirect to cloud login when no staff exist
```

---

### Task 4: Update cloud-login to add "Pasang Perangkat" button

**Files:**
- Modify: `apps/pos-app/src/pages/cloud-login.tsx`
- Modify: `apps/pos-app/src/pages/__test__/login.test.tsx` (if cloud-login tests exist, or create new test file)

**Step 1: Write the failing test**

Create `apps/pos-app/src/pages/__test__/cloud-login.test.tsx`:

```ts
import { describe, expect, test, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { Route, Router } from "@solidjs/router";
import CloudLogin from "../cloud-login";

const mockNavigate = vi.fn();
vi.mock("@solidjs/router", async () => {
	const actual = await vi.importActual("@solidjs/router");
	return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("~/lib/cloud-auth", () => ({
	ApiError: class extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } },
	login: vi.fn(),
	register: vi.fn(),
	getGoogleOAuthUrl: vi.fn(() => "https://google.com/oauth"),
	getMerchants: vi.fn(),
	getOutlets: vi.fn(),
	isCloudAuthenticated: vi.fn(() => false),
}));
vi.mock("~/lib/outlet", () => ({
	setOutletContext: vi.fn(),
}));

function renderWithRouter() {
	return render(() => (
		<Router root={(props) => props.children}>
			<Route component={CloudLogin} path="/" />
		</Router>
	));
}

describe("CloudLogin", () => {
	test("shows Pasang Perangkat button on login step", () => {
		const { getByText } = renderWithRouter();
		expect(getByText(/Pasang Perangkat/i)).toBeInTheDocument();
	});

	test("navigates to /device-pair when Pasang Perangkat clicked", async () => {
		const { getByText } = renderWithRouter();
		getByText(/Pasang Perangkat/i).click();
		await vi.waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/device-pair", { replace: true });
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/cloud-login.test.tsx`
Expected: FAIL — no "Pasang Perangkat" button exists

**Step 3: Add the button to cloud-login.tsx**

In the form section of `cloud-login.tsx` (after the "atau" divider and Google button), add before the login/register toggle:

```tsx
<div class="text-center text-sm">
	<button
		class="text-primary hover:underline"
		onClick={() => navigate("/device-pair", { replace: true })}
		type="button"
	>
		Pasang Perangkat
	</button>
</div>
```

Use the `frontend-design` skill to style this appropriately — it should be visually distinct from the Google OAuth button but clearly a secondary action.

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/cloud-login.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat: add Pasang Perangkat button to cloud login
```

---

### Task 5: Change pairing code from 6-digit numeric to 8-char alphanumeric

**Files:**
- Modify: `apps/api/src/routes/registers.ts` — `generatePairingCode()`
- Modify: `apps/api/src/__test__/registers.test.ts` — update expectations
- Modify: `apps/pos-app/src/pages/device-pair.tsx` — update validation length + regex
- Modify: `apps/pos-app/src/lib/cloud-auth.ts` — no changes needed (passes code as-is)

**Step 1: Write the failing test**

In `apps/api/src/__test__/registers.test.ts`, update the existing test that checks pairing code length:

```ts
test("creates register with alphanumeric pairingCode and shortId", async () => {
	// ... existing mock setup ...
	expect(status).toBe(200);
	const inserted = insertedValues[0] as Record<string, unknown>;
	expect(inserted.pairingCode).toBeDefined();
	expect((inserted.pairingCode as string).length).toBe(8);
	expect((inserted.pairingCode as string)).toMatch(/^[A-Z0-9]{8}$/);
	expect(inserted.pairingExpiresAt).toBeDefined();
});
```

Also add a test for the pair endpoint accepting 8-char codes:

```ts
test("accepts 8-character alphanumeric pairing code", async () => {
	// ... setup with valid register ...
	const { status } = await makeRequest("/api/registers/pair", {
		method: "POST",
		body: { pairingCode: "AB12CD34" },
	});
	expect(status).toBe(200);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/__test__/registers.test.ts`
Expected: FAIL — pairing code is 6 digits, not 8 alphanumeric

**Step 3: Update `generatePairingCode()` in registers.ts**

```ts
function generatePairingCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}
```

Note: Excludes ambiguous chars (0/O, 1/I/L) to avoid confusion.

**Step 4: Update the Elysia validation in the pair endpoint**

```ts
body: t.Object({
	pairingCode: t.String({ minLength: 8, maxLength: 8, pattern: "^[A-Z0-9]{8}$" }),
}),
```

**Step 5: Update device-pair.tsx**

Change validation:
- `pairingCode.length !== 6` → `pairingCode.length !== 8`
- `maxlength={6}` → `maxlength={8}`
- `Array.from({ length: 6 }, ...)` → `Array.from({ length: 8 }, ...)`
- `inputMode="numeric"` → `inputMode="text"`
- `pattern="[0-9]*"` → `pattern="[A-Z0-9]*"`
- `.replace(/\D/g, "")` → `.replace(/[^A-Z0-9]/gi, "").toUpperCase()`
- Error text: "Kode harus 6 digit" → "Kode harus 8 karakter"
- "Masukkan kode 6 digit dari pengaturan kasir" → "Masukkan kode 8 karakter dari pengaturan kasir"

**Step 6: Run all tests**

Run: `cd apps/api && bun test`
Run: `cd apps/pos-app && bunx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```
feat: change pairing code to 8 alphanumeric characters
```

---

### Task 6: Auto-pair for owner during onboarding (skip device-pair)

**Files:**
- Modify: `apps/pos-app/src/pages/onboarding.tsx`
- Modify: `apps/api/src/routes/outlets.ts` — add auto-create register on outlet creation
- Modify: `apps/api/src/__test__/outlets.test.ts`

The idea: when creating an outlet during onboarding, the API automatically creates a register for it. The POS app then receives the register info and sets outlet context, going straight to `/login`.

**Step 1: Write the failing test (API)**

In `apps/api/src/__test__/outlets.test.ts`, add:

```ts
test("creating an outlet auto-creates a register", async () => {
	// ... mock session, verify outlet ownership ...
	// After outlet insert, expect a register insert too
	expect(mockInsert).toHaveBeenCalledTimes(2); // once for outlet, once for register
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/__test__/outlets.test.ts`
Expected: FAIL — only one insert (outlet)

**Step 3: Update API outlets route to auto-create register**

In `apps/api/src/routes/outlets.ts`, after creating the outlet, also create a register:

```ts
const [register] = await db
	.insert(registers)
	.values({
		outletId: outlet.id,
		name: "Register 1",
		shortId: generateShortId(),
		createdAt: now,
		updatedAt: now,
	})
	.returning();

return { ...outlet, register };
```

Import `registers` from `@repo/database/api-schema` and `generateShortId` from a shared location (move it out of registers.ts or duplicate).

**Step 4: Update onboarding.tsx to use register from response**

In `handleCreateOutlet`, after `createOutlet` returns:

```ts
const result = await createOutlet(createdMerchant()!.id, outletName().trim(), outletAddress().trim() || undefined);
if (result.register) {
	setOutletContext(result.outlet.id, result.outlet.merchantId, result.register.id);
} else {
	setOutletContext(result.outlet.id, result.outlet.merchantId);
}
navigate("/login", { replace: true });
```

**Step 5: Update cloud-auth.ts types**

Update the `createOutlet` return type to include optional register:

```ts
interface CreateOutletResult {
	outlet: Outlet;
	register?: Register;
}
```

**Step 6: Run all tests**

Run: `cd apps/api && bun test`
Run: `cd apps/pos-app && bunx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```
feat: auto-create register during onboarding, skip device-pair for owners
```

---

### Task 7: Owner cloud login auto-pairs without device-pair step

**Files:**
- Modify: `apps/pos-app/src/pages/cloud-login.tsx`

When an owner logs in and picks a merchant+outlet (or has only one outlet), they should go straight to `/login` instead of `/device-pair`.

**Step 1: Write the failing test**

In `apps/pos-app/src/pages/__test__/cloud-login.test.tsx`:

```ts
test("navigates to /login after selecting outlet (not /device-pair)", async () => {
	// ... mock getMerchants to return merchants, getOutlets to return outlets ...
	// After selecting outlet, expect navigate to /login
	await vi.waitFor(() => {
		expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/cloud-login.test.tsx`
Expected: FAIL — currently navigates to `/device-pair`

**Step 3: Update `handleSelectOutlet` in cloud-login.tsx**

```ts
const handleSelectOutlet = (outlet: Outlet) => {
	setOutletContext(outlet.id, outlet.merchantId);
	navigate("/login", { replace: true });
};
```

No need to go through device-pair — the outlet context is set, sync will pull data for that outlet, and PIN login works.

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/cloud-login.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat: cloud login goes directly to PIN login after outlet selection
```

---

### Task 8: Add outlet selector to POS page for managers

**Files:**
- Create: `apps/pos-app/src/components/pos/outlet-selector.tsx`
- Modify: `apps/pos-app/src/pages/pos.tsx`
- Create: `apps/pos-app/src/components/pos/__test__/outlet-selector.test.tsx`
- Modify: `apps/pos-app/src/lib/outlet.ts` — add `availableOutlets` signal
- Modify: `apps/pos-app/src/lib/__test__/outlet.test.ts`

Managers need to be able to switch between outlets on the POS page. The outlet selector reads all outlets from the local DB and filters data accordingly.

**Step 1: Write the failing test for outlet-selector component**

Create `apps/pos-app/src/components/pos/__test__/outlet-selector.test.tsx`:

```ts
import { describe, expect, test, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import OutletSelector from "../outlet-selector";

describe("OutletSelector", () => {
	test("renders outlet name", () => {
		const { getByText } = render(() => (
			<OutletSelector
				currentOutletId="outlet-1"
				outlets={[
					{ id: "outlet-1", name: "Cabang Sudirman" },
					{ id: "outlet-2", name: "Cabang Thamrin" },
				]}
				onChange={vi.fn()}
			/>
		));
		expect(getByText("Cabang Sudirman")).toBeInTheDocument();
	});

	test("calls onChange when different outlet selected", async () => {
		const onChange = vi.fn();
		const { getByText, getByRole } = render(() => (
			<OutletSelector
				currentOutletId="outlet-1"
				outlets={[
					{ id: "outlet-1", name: "Cabang Sudirman" },
					{ id: "outlet-2", name: "Cabang Thamrin" },
				]}
				onChange={onChange}
			/>
		));
		getByRole("button").click();
		getByText("Cabang Thamrin").click();
		await vi.waitFor(() => {
			expect(onChange).toHaveBeenCalledWith("outlet-2");
		});
	});

	test("is hidden when only one outlet", () => {
		const { queryByRole } = render(() => (
			<OutletSelector
				currentOutletId="outlet-1"
				outlets={[{ id: "outlet-1", name: "Cabang Sudirman" }]}
				onChange={vi.fn()}
			/>
		));
		expect(queryByRole("button")).toBeNull();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/components/pos/__test__/outlet-selector.test.tsx`
Expected: FAIL — component doesn't exist

**Step 3: Create outlet-selector component**

Use the `frontend-design` skill to create `apps/pos-app/src/components/pos/outlet-selector.tsx`. This should be a dropdown/popover showing the current outlet name with a chevron. When tapped, it shows a list of available outlets. Hidden when only one outlet exists.

Props:
```ts
interface OutletSelectorProps {
	currentOutletId: string;
	outlets: { id: string; name: string }[];
	onChange: (outletId: string) => void;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/components/pos/__test__/outlet-selector.test.tsx`
Expected: PASS

**Step 5: Add outlet data fetching to pos.tsx**

In `pos.tsx`, add a query to fetch all outlets from local DB and pass them to the `OutletSelector` in the topbar. The selector should only show for managers. When an outlet is changed, update `currentOutletId` and re-fetch products.

Add to `apps/pos-app/src/db/` a new query function `getAllOutlets()` that reads from the local `outlets` table.

**Step 6: Run all tests**

Run: `cd apps/pos-app && bunx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```
feat: add outlet selector to POS page for managers
```

---

### Task 9: Update POS to filter products by selected outlet

**Files:**
- Modify: `apps/pos-app/src/pages/pos.tsx`
- Modify: `apps/pos-app/src/db/orders.ts` — update `getActiveProductsByCategory` to accept outletId filter

**Step 1: Write the failing test**

In `apps/pos-app/src/pages/__test__/pos.test.tsx`:

```ts
test("products are filtered by current outlet", async () => {
	// Mock the DB to return different products per outlet
	// Verify that only the current outlet's products are shown
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update `getActiveProductsByCategory` to accept optional outletId**

The query should join with `outletProducts` to filter by outlet if an outletId is provided.

**Step 4: Run all tests**

**Step 5: Commit**

```
feat: filter POS products by selected outlet
```

---

### Task 10: Final integration — update layout redirect logic

**Files:**
- Modify: `apps/pos-app/src/components/layout.tsx`
- Modify: `apps/pos-app/src/App.tsx`

Update the root redirect logic so that:
1. If not authenticated AND not paired → `/cloud-login` (not `/login`)
2. If not authenticated AND paired → `/login` (PIN login)
3. If authenticated → route as normal

**Step 1: Write the failing test**

**Step 2: Update layout.tsx redirect logic**

Replace the current `createEffect` in `Layout`:

```ts
createEffect(() => {
	if (!isPublicRoute() && !isAuthenticated()) {
		if (isDevicePaired()) {
			navigate("/login");
		} else {
			navigate("/cloud-login");
		}
	}
});
```

**Step 3: Run all tests**

**Step 4: Commit**

```
feat: smart redirect based on device pairing state
```

---

### Task 11: Lint, typecheck, and full test suite

**Step 1: Run lint**

Run: `bun x ultracite check`

**Step 2: Run typecheck**

Run: `cd apps/pos-app && bunx tsc --noEmit`

**Step 3: Run all tests**

Run: `cd apps/api && bun test`
Run: `cd apps/pos-app && bunx vitest run`

**Step 4: Fix any issues found**

**Step 5: Commit (if changes needed)**

```
chore: lint and typecheck fixes
```

---

## Summary of changes

| Area | Before | After |
|------|--------|-------|
| Fresh install entry | `/login` (empty user picker) | `/cloud-login` |
| Owner registration | Onboarding → device-pair → PIN login | Onboarding → auto-pair → PIN login |
| Owner cloud login | Pick outlet → device-pair → PIN login | Pick outlet → PIN login |
| Employee device | No accessible entry point | Cloud login "Pasang Perangkat" button → 8-char code |
| Pairing code | 6-digit numeric | 8-char alphanumeric (no ambiguous chars) |
| POS outlet scope | Fixed to paired outlet | Manager: outlet selector dropdown; Cashier: locked |
| Unauthenticated redirect | Always `/login` | Paired → `/login`, Unpaired → `/cloud-login` |
