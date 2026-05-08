# Owner Role, Onboarding PIN Setup & Login Flow Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `owner` as a staff role, add PIN setup step to onboarding so owners go straight to POS after creating their store, skip user picker when only 1 staff exists, remove cloud login link from login page, and update all role checks to include `owner` alongside `manager`.

**Architecture:** The staff role enum expands from `["cashier", "manager"]` to `["cashier", "manager", "owner"]`. Both schemas (local + API) are updated. Onboarding gains a third step ("setup-pin") that creates the owner's local staff record with hashed PIN and auto-logs them in. Login page auto-selects the only staff member when there's just one, skipping the user picker. All role-based access checks (`RequireAuth`, nav items, `canCancel`, settings) treat `owner` identically to `manager`. The `seedDefaultManager` function is removed since onboarding now creates real staff records.

**Tech Stack:** SolidJS, Solid Router, Tauri SQLite (drizzle-orm), Elysia (API), bcryptjs, bun:test, vitest

---

### Task 1: Add `owner` to staff role enum in both schemas

**Files:**
- Modify: `packages/database/src/local-schema.ts:63`
- Modify: `packages/database/src/api-schema.ts:92`

**Step 1: Update local schema**

In `packages/database/src/local-schema.ts`, change line 63:

```ts
// Before:
role: text("role", { enum: ["cashier", "manager"] }).notNull(),
// After:
role: text("role", { enum: ["cashier", "manager", "owner"] }).notNull(),
```

**Step 2: Update API schema**

In `packages/database/src/api-schema.ts`, change line 92:

```ts
// Before:
role: text("role", { enum: ["cashier", "manager"] }).notNull(),
// After:
role: text("role", { enum: ["cashier", "manager", "owner"] }).notNull(),
```

**Step 3: Run drizzle push to apply schema change**

Run: `cd packages/database && bunx drizzle-kit push`
Run: `cd apps/pos-app && bunx drizzle-kit push`

Note: SQLite doesn't enforce enum constraints on existing data, so this is safe. The drizzle schema just defines what values TypeScript accepts.

**Step 4: Commit**

```
feat: add owner role to staff schema
```

---

### Task 2: Update `AuthUser` type to include `owner`

**Files:**
- Modify: `apps/pos-app/src/lib/auth-provider.ts:7-11`

**Step 1: Write the failing test**

In `apps/pos-app/src/lib/__test__/auth-provider.test.ts`, add:

```ts
test("verify returns owner role when staff has owner role", async () => {
	const { verifyPin } = await import("~/lib/auth-provider");
	vi.mocked(db.select).mockReturnValue({
		from: () => ({
			where: () =>
				Promise.resolve([
					{
						id: "staff-1",
						name: "Owner",
						pin: await bcrypt.hash("123456", 1),
						role: "owner",
						isActive: true,
					},
				]),
		}),
	});
	const result = await verifyPin("staff-1", "123456");
	expect(result.role).toBe("owner");
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/lib/__test__/auth-provider.test.ts`
Expected: FAIL — type error, `"owner"` is not assignable to `AuthUser["role"]`

**Step 3: Update `AuthUser` interface**

In `apps/pos-app/src/lib/auth-provider.ts`, change:

```ts
// Before:
export interface AuthUser {
	id: string;
	name: string;
	role: "cashier" | "manager";
}
// After:
export type StaffRole = "cashier" | "manager" | "owner";

export interface AuthUser {
	id: string;
	name: string;
	role: StaffRole;
}
```

**Step 4: Update the cast in `verify` method**

In `apps/pos-app/src/lib/auth-provider.ts:53`, the existing cast `as AuthUser["role"]` will now naturally accept `"owner"` — no change needed there.

**Step 5: Export `StaffRole` from auth-provider and re-export from auth**

In `apps/pos-app/src/lib/auth.ts`, add:

```ts
export type { StaffRole } from "./auth-provider";
```

**Step 6: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/lib/__test__/auth-provider.test.ts`
Expected: PASS

**Step 7: Commit**

```
feat: add owner to AuthUser role type
```

---

### Task 3: Update all role-based access checks to include `owner`

**Files:**
- Modify: `apps/pos-app/src/App.tsx` — `RequireAuth roles` arrays
- Modify: `apps/pos-app/src/components/layout.tsx` — `navItems` roles arrays
- Modify: `apps/pos-app/src/pages/order-history.tsx:76-78` — `canCancel` check
- Modify: `apps/pos-app/src/pages/settings.tsx:208` — access display check
- Modify: `apps/pos-app/src/pages/pos.tsx:115` — outlet selector visibility
- Modify: `apps/pos-app/src/pages/login.tsx:53` — post-login redirect

The rule: **`owner` gets the same access as `manager`** everywhere.

**Step 1: Update `App.tsx` RequireAuth roles**

Every `roles={["manager"]}` becomes `roles={["manager", "owner"]}`:

```ts
<RequireAuth roles={["manager", "owner"]}>
    <Dashboard />
</RequireAuth>
```

Apply to all 4 occurrences (Dashboard, MenuManagement, UserManagement, and any other `["manager"]` roles).

**Step 2: Update `layout.tsx` navItems**

Change `roles: ["manager"] as string[]` to `roles: ["manager", "owner"] as string[]` for Dashboard, Menu, and Pengguna items.

**Step 3: Update `order-history.tsx` canCancel**

```ts
// Before:
const canCancel = () => {
    const role = currentUserRole();
    return role === "manager";
};
// After:
const canCancel = () => {
    const role = currentUserRole();
    return role === "manager" || role === "owner";
};
```

**Step 4: Update `settings.tsx` access display**

```ts
// Before (line 208):
<Show when={user?.role === "manager"}>
// After:
<Show when={user?.role === "manager" || user?.role === "owner"}>
```

**Step 5: Update `pos.tsx` outlet selector visibility**

```ts
// Before:
<Show when={role === "manager" && outletsData()}>
// After:
<Show when={(role === "manager" || role === "owner") && outletsData()}>
```

**Step 6: Update `login.tsx` post-login redirect**

```ts
// Before:
const target = authUser.role === "cashier" ? "/pos" : "/";
// After:
const target = authUser.role === "cashier" ? "/pos" : "/";
```

This is already correct — non-cashier roles (manager, owner) go to Dashboard ("/"). No change needed.

**Step 7: Update `user-form.tsx` ROLE_OPTIONS**

Add owner to the role options (only visible when creating/editing, and only for users with owner/manager privileges):

```ts
// Before:
const ROLE_OPTIONS = [
    { value: "cashier", label: "Kasir" },
    { value: "manager", label: "Manajer" },
];
// After:
const ROLE_OPTIONS = [
    { value: "cashier", label: "Kasir" },
    { value: "manager", label: "Manajer" },
    { value: "owner", label: "Pemilik" },
];
```

Also update the type casts in `handleSave`:

```ts
// Before:
role: role() as "manager" | "cashier",
// After:
role: role() as "manager" | "cashier" | "owner",
```

Apply to both occurrences (line 111 and line 120).

Also update `countActiveManagers` check in `checkBusinessRules`:

```ts
// Before:
if (newRole !== "manager") {
// After:
if (newRole !== "manager" && newRole !== "owner") {
```

**Step 8: Update `db/staff.ts` countActiveManagers**

```ts
// Before:
export async function countActiveManagers(): Promise<number> {
    // ...
    const conditions = [eq(staff.role, "manager"), eq(staff.isActive, true)];
// After:
export async function countActiveManagers(): Promise<number> {
    // ...
    const conditions = [eq(staff.isActive, true)];
```

Also add `or` to the import from drizzle-orm, and update the where clause to use `inArray`:

```ts
import { count, eq, inArray } from "drizzle-orm";
// ...
const [row] = await db
    .select({ count: count() })
    .from(staff)
    .where(
        and(
            inArray(staff.role, ["manager", "owner"]),
            eq(staff.isActive, true),
            ...(merchantId ? [eq(staff.merchantId, merchantId)] : []),
        ),
    );
```

Import `and` from drizzle-orm too.

**Step 9: Run tests**

Run: `cd apps/pos-app && bunx vitest run`
Expected: May have failures in tests that assert specific role strings — fix them.

**Step 10: Commit**

```
feat: grant owner same access as manager across all pages
```

---

### Task 4: Add PIN setup step to onboarding

**Files:**
- Modify: `apps/pos-app/src/pages/onboarding.tsx`
- Create: `apps/pos-app/src/pages/__test__/onboarding.test.ts`

The onboarding flow becomes: **merchant → outlet → setup-pin → POS**.

**Step 1: Write the failing test**

Create `apps/pos-app/src/pages/__test__/onboarding.test.tsx`:

```ts
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCreateMerchant = vi.fn();
const mockCreateOutlet = vi.fn();
const mockSetOutletContext = vi.fn();
const mockCreateStaffMember = vi.fn();
const mockHashPin = vi.fn(() => Promise.resolve("hashed-pin"));
const mockLogin = vi.fn();

vi.mock("@solidjs/router", () => ({
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
}));

vi.mock("~/lib/cloud-auth", () => ({
    ApiError: class extends Error {
        status: number;
        constructor(m: string, s: number) {
            super(m);
            this.status = s;
        }
    },
    createMerchant: (...args: unknown[]) => mockCreateMerchant(...args),
    createOutlet: (...args: unknown[]) => mockCreateOutlet(...args),
}));

vi.mock("~/lib/outlet", () => ({
    setOutletContext: (...args: unknown[]) => mockSetOutletContext(...args),
    currentMerchantId: () => "merchant-1",
}));

vi.mock("~/db/staff", () => ({
    createStaffMember: (...args: unknown[]) => mockCreateStaffMember(...args),
}));

vi.mock("~/lib/auth-provider", () => ({
    hashPin: (...args: unknown[]) => mockHashPin(...args),
}));

vi.mock("~/lib/auth", () => ({
    login: (...args: unknown[]) => mockLogin(...args),
}));

import Onboarding from "../onboarding";

const user = userEvent.setup();

describe("Onboarding", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    test("shows merchant creation step first", () => {
        render(() => <Onboarding />);
        expect(screen.getByText("Buat bisnis Anda")).toBeInTheDocument();
    });

    test("advances to outlet step after creating merchant", async () => {
        mockCreateMerchant.mockResolvedValue({
            id: "merchant-1",
            name: "Test Biz",
        });
        render(() => <Onboarding />);
        const input = screen.getByPlaceholderText("Contoh: PT Sakti Jaya");
        await user.type(input, "Test Biz");
        await user.click(screen.getByText("Lanjutkan"));
        expect(await screen.findByText("Buat outlet pertama")).toBeInTheDocument();
    });

    test("advances to PIN setup after creating outlet", async () => {
        mockCreateMerchant.mockResolvedValue({
            id: "merchant-1",
            name: "Test Biz",
        });
        mockCreateOutlet.mockResolvedValue({
            id: "outlet-1",
            merchantId: "merchant-1",
            register: { id: "register-1" },
        });
        render(() => <Onboarding />);
        await user.type(
            screen.getByPlaceholderText("Contoh: PT Sakti Jaya"),
            "Test Biz",
        );
        await user.click(screen.getByText("Lanjutkan"));
        expect(await screen.findByText("Buat outlet pertama")).toBeInTheDocument();
        await user.type(
            screen.getByPlaceholderText("Contoh: Cabang Sudirman"),
            "Cabang Utama",
        );
        await user.click(screen.getByText("Buat Outlet"));
        expect(await screen.findByText("Buat PIN")).toBeInTheDocument();
    });

    test("creates staff and navigates to /pos after PIN setup", async () => {
        mockCreateMerchant.mockResolvedValue({
            id: "merchant-1",
            name: "Test Biz",
        });
        mockCreateOutlet.mockResolvedValue({
            id: "outlet-1",
            merchantId: "merchant-1",
            register: { id: "register-1" },
        });
        mockCreateStaffMember.mockResolvedValue({
            id: "staff-1",
            name: "Test",
            role: "owner",
        });
        mockLogin.mockResolvedValue({
            id: "staff-1",
            name: "Test",
            role: "owner",
        });
        render(() => <Onboarding />);
        await user.type(
            screen.getByPlaceholderText("Contoh: PT Sakti Jaya"),
            "Test Biz",
        );
        await user.click(screen.getByText("Lanjutkan"));
        await screen.findByText("Buat outlet pertama");
        await user.type(
            screen.getByPlaceholderText("Contoh: Cabang Sudirman"),
            "Cabang Utama",
        );
        await user.click(screen.getByText("Buat Outlet"));
        expect(await screen.findByText("Buat PIN")).toBeInTheDocument();

        const pinInputs = screen.getAllByRole("textbox");
        for (const digit of "123456") {
            await user.click(screen.getByText(digit));
        }
        await user.click(screen.getByText("OK"));

        await vi.waitFor(() => {
            expect(mockCreateStaffMember).toHaveBeenCalledWith(
                expect.objectContaining({
                    merchantId: "merchant-1",
                    role: "owner",
                    pin: "hashed-pin",
                }),
            );
        });
        await vi.waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/pos", { replace: true });
        });
    });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/onboarding.test.tsx`
Expected: FAIL — onboarding doesn't have a PIN setup step

**Step 3: Implement the PIN setup step in onboarding.tsx**

Update `apps/pos-app/src/pages/onboarding.tsx`:

```tsx
import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import PinPad from "~/components/ui/pinpad";
import { Button } from "~/components/ui/button";
import {
    ApiError,
    createMerchant,
    createOutlet,
    type Merchant,
} from "~/lib/cloud-auth";
import { createStaffMember } from "~/db/staff";
import { hashPin } from "~/lib/auth-provider";
import { login } from "~/lib/auth";
import { setOutletContext, currentMerchantId } from "~/lib/outlet";

type Step = "merchant" | "outlet" | "setup-pin";

export default function Onboarding() {
    const navigate = useNavigate();
    const [step, setStep] = createSignal<Step>("merchant");
    const [merchantName, setMerchantName] = createSignal("");
    const [outletName, setOutletName] = createSignal("");
    const [outletAddress, setOutletAddress] = createSignal("");
    const [pin, setPin] = createSignal("");
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal("");
    const [createdMerchant, setCreatedMerchant] = createSignal<Merchant | null>(
        null,
    );
    const [createdOutletId, setCreatedOutletId] = createSignal<string | null>(
        null,
    );

    const handleCreateMerchant = async (e: Event) => {
        e.preventDefault();
        if (!merchantName().trim()) return;

        setError("");
        setLoading(true);

        try {
            const merchant = await createMerchant(merchantName().trim());
            setCreatedMerchant(merchant);
            setStep("outlet");
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError("Gagal membuat bisnis");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOutlet = async (e: Event) => {
        e.preventDefault();
        if (!outletName().trim() || !createdMerchant()) return;

        setError("");
        setLoading(true);

        try {
            const result = await createOutlet(
                createdMerchant()!.id,
                outletName().trim(),
                outletAddress().trim() || undefined,
            );
            setOutletContext(result.id, result.merchantId, result.register?.id);
            setCreatedOutletId(result.id);
            setStep("setup-pin");
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError("Gagal membuat outlet");
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePinSubmit = async (enteredPin: string) => {
        if (pin().length === 0) {
            setPin(enteredPin);
            return;
        }

        if (pin() !== enteredPin) {
            setError("PIN tidak cocok");
            setPin("");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const hashedPin = await hashPin(pin());
            const staffRecord = await createStaffMember({
                merchantId: createdMerchant()!.id,
                name: createdMerchant()!.name,
                role: "owner",
                pin: hashedPin,
            });
            await login(staffRecord.id, pin());
            navigate("/pos", { replace: true });
        } catch (err) {
            setError("Gagal membuat PIN");
            setPin("");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
            <div class="w-full max-w-sm text-center">
                <h1 class="font-bold text-3xl">Sakti POS</h1>
                <p class="mt-1 text-muted-foreground text-sm">
                    {step() === "merchant"
                        ? "Buat bisnis Anda"
                        : step() === "outlet"
                            ? "Buat outlet pertama"
                            : pin().length === 0
                                ? "Buat PIN"
                                : "Konfirmasi PIN"}
                </p>
            </div>

            <Show when={step() === "merchant"}>
                <form
                    class="flex w-full max-w-sm flex-col gap-4"
                    onSubmit={handleCreateMerchant}
                >
                    <Show when={error()}>
                        <div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
                            {error()}
                        </div>
                    </Show>

                    <div class="flex flex-col gap-1.5">
                        <label class="font-medium text-sm" for="merchant-name">
                            Nama Bisnis
                        </label>
                        <input
                            autofocus
                            class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
                            id="merchant-name"
                            onInput={(e) => setMerchantName(e.currentTarget.value)}
                            placeholder="Contoh: PT Sakti Jaya"
                            required
                            type="text"
                            value={merchantName()}
                        />
                    </div>

                    <Button
                        class="w-full"
                        disabled={loading() || !merchantName().trim()}
                        type="submit"
                    >
                        {loading() ? "Menyimpan..." : "Lanjutkan"}
                    </Button>

                    <div class="text-center">
                        <button
                            class="text-muted-foreground text-sm hover:text-foreground"
                            onClick={() => navigate("/cloud-login", { replace: true })}
                            type="button"
                        >
                            ← Kembali
                        </button>
                    </div>
                </form>
            </Show>

            <Show when={step() === "outlet"}>
                <form
                    class="flex w-full max-w-sm flex-col gap-4"
                    onSubmit={handleCreateOutlet}
                >
                    <Show when={error()}>
                        <div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
                            {error()}
                        </div>
                    </Show>

                    <div class="flex flex-col gap-1.5">
                        <label class="font-medium text-sm" for="outlet-name">
                            Nama Outlet
                        </label>
                        <input
                            autofocus
                            class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
                            id="outlet-name"
                            onInput={(e) => setOutletName(e.currentTarget.value)}
                            placeholder="Contoh: Cabang Sudirman"
                            required
                            type="text"
                            value={outletName()}
                        />
                    </div>

                    <div class="flex flex-col gap-1.5">
                        <label class="font-medium text-sm" for="outlet-address">
                            Alamat (opsional)
                        </label>
                        <input
                            class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
                            id="outlet-address"
                            onInput={(e) => setOutletAddress(e.currentTarget.value)}
                            placeholder="Jl. Sudirman No. 123"
                            type="text"
                            value={outletAddress()}
                        />
                    </div>

                    <Button
                        class="w-full"
                        disabled={loading() || !outletName().trim()}
                        type="submit"
                    >
                        {loading() ? "Menyimpan..." : "Buat Outlet"}
                    </Button>

                    <div class="text-center">
                        <button
                            class="text-muted-foreground text-sm hover:text-foreground"
                            onClick={() => navigate("/cloud-login", { replace: true })}
                            type="button"
                        >
                            ← Kembali
                        </button>
                    </div>
                </form>
            </Show>

            <Show when={step() === "setup-pin"}>
                <div class="flex flex-col items-center gap-4">
                    <Show when={error()}>
                        <div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
                            {error()}
                        </div>
                    </Show>

                    <p class="text-muted-foreground text-sm">
                        {pin().length === 0
                            ? "Masukkan PIN 6 digit Anda"
                            : "Masukkan ulang PIN untuk konfirmasi"}
                    </p>

                    <PinPad
                        disabled={loading()}
                        maxLength={6}
                        onSubmit={handlePinSubmit}
                    />
                </div>
            </Show>
        </div>
    );
}
```

Key design decisions:
- PIN entry happens twice (enter + confirm) to prevent typos
- First `handlePinSubmit` stores the PIN, second call compares and creates staff
- Staff name uses the merchant name (the owner's business name) — the cloud user's actual name is stored on the cloud `users` table, not local `staff`
- Auto-login after creating staff record, navigate to `/pos`

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/onboarding.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat: add PIN setup step to onboarding for owner
```

---

### Task 5: Auto-select single staff member in login page

**Files:**
- Modify: `apps/pos-app/src/pages/login.tsx`
- Modify: `apps/pos-app/src/pages/__test__/login.test.tsx`

When there's exactly 1 staff member, skip the user picker and go straight to PIN entry.

**Step 1: Write the failing test**

Add to `apps/pos-app/src/pages/__test__/login.test.tsx`:

```ts
test("auto-selects single staff member and shows PIN pad", async () => {
    mockGetActiveStaff.mockResolvedValueOnce([
        { id: "staff-1", name: "Owner", role: "owner" },
    ]);
    mockGetLastUserId.mockReturnValue(null);
    render(() => <Login />);
    expect(await screen.findByText("Masukkan PIN")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.queryByText("Pilih pengguna")).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/login.test.tsx`
Expected: FAIL — with 1 user, it still shows user picker instead of PIN pad

**Step 3: Update login.tsx to auto-select single user**

In `apps/pos-app/src/pages/login.tsx`, modify the `onMount` callback:

```ts
onMount(async () => {
    try {
        const activeStaff = await getActiveStaff();
        if (activeStaff.length === 0) {
            navigate("/cloud-login", { replace: true });
            return;
        }
        setUsers(activeStaff);

        if (activeStaff.length === 1) {
            setSelectedUser(activeStaff[0]);
        } else {
            const lastUserId = getLastUserId();
            const lastUser = activeStaff.find((u) => u.id === lastUserId);
            if (lastUser) {
                setSelectedUser(lastUser);
            }
        }
    } catch {
        setUsers([]);
    } finally {
        setLoading(false);
    }
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/login.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat: auto-select single staff member in login
```

---

### Task 6: Remove "Masuk dengan akun cloud" link from login page

**Files:**
- Modify: `apps/pos-app/src/pages/login.tsx`
- Modify: `apps/pos-app/src/pages/__test__/login.test.tsx`

**Step 1: Write the failing test**

Add to `apps/pos-app/src/pages/__test__/login.test.tsx`:

```ts
test("does not show cloud login link", async () => {
    mockGetLastUserId.mockReturnValue(null);
    render(() => <Login />);
    await screen.findByText("Manager");
    expect(
        screen.queryByText("Masuk dengan akun cloud"),
    ).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/login.test.tsx`
Expected: FAIL — the cloud login link still exists

**Step 3: Remove the cloud login links from login.tsx**

Remove both instances of:

```tsx
<button
    class="text-muted-foreground text-sm hover:text-primary"
    onClick={() => navigate("/cloud-login")}
    type="button"
>
    Masuk dengan akun cloud →
</button>
```

There are two occurrences — one in the portrait layout and one in the landscape layout.

**Step 4: Run test to verify it passes**

Run: `cd apps/pos-app && bunx vitest run src/pages/__test__/login.test.tsx`
Expected: PASS

**Step 5: Commit**

```
fix: remove cloud login link from PIN login page
```

---

### Task 7: Remove `seedDefaultManager` function

**Files:**
- Modify: `apps/pos-app/src/lib/auth-provider.ts` — remove `seedDefaultManager`
- Search for any callers of `seedDefaultManager` and remove those calls

**Step 1: Find all callers**

Run: `cd apps/pos-app && grep -r "seedDefaultManager" --include="*.ts" --include="*.tsx" -l`

**Step 2: Remove all callers**

Remove any calls to `seedDefaultManager()` found in step 1.

**Step 3: Remove the function from auth-provider.ts**

Delete the `seedDefaultManager` function from `apps/pos-app/src/lib/auth-provider.ts` (lines 73-83).

**Step 4: Run tests**

Run: `cd apps/pos-app && bunx vitest run`
Expected: PASS

**Step 5: Commit**

```
refactor: remove seedDefaultManager (onboarding creates real staff)
```

---

### Task 8: Update settings page to show "Putuskan & Hapus Data" for unpair

**Files:**
- Modify: `apps/pos-app/src/pages/settings.tsx`

The settings page already has "Putuskan Koneksi" — this should also clear outlet context (unpair the device), which sends user back to `/cloud-login` on next launch.

**Step 1: Verify current behavior**

The existing `handleDisconnect` already calls `clearOutletContext()`. This effectively unpair the device. After the outlet context is cleared:
- Layout's `createEffect` will detect unpaired + unauthenticated → redirect to `/cloud-login`
- Next launch → `isDevicePaired()` returns false → goes to `/cloud-login`

So the current behavior is already correct for unpairing. Just update the UI label to make it clearer:

In `settings.tsx`, change:

```tsx
// Before:
<span class="text-sm text-destructive">Putuskan Koneksi</span>
// After:
<span class="text-sm text-destructive">Lepaskan Perangkat</span>
```

Also update the confirm drawer:

```tsx
// Before:
title="Putuskan Koneksi Cloud"
message="Data lokal akan tetap tersimpan, namun sinkronisasi akan berhenti."
confirmLabel="Putuskan"
// After:
title="Lepaskan Perangkat"
message="Perangkat akan dilepas dari outlet ini. Anda perlu login ulang dengan akun cloud atau memasangkan ulang perangkat."
confirmLabel="Lepaskan"
```

**Step 2: Run tests**

Run: `cd apps/pos-app && bunx vitest run`
Expected: Some settings tests may reference the old labels — update them.

**Step 3: Commit**

```
fix: clarify device unpair action in settings
```

---

### Task 9: Update existing tests for new roles and flow changes

**Files:**
- Modify: `apps/pos-app/src/pages/__test__/settings.test.tsx` — update role references
- Modify: `apps/pos-app/src/pages/__test__/order-history.test.tsx` — update canCancel test
- Modify: `apps/pos-app/src/pages/__test__/pos.test.tsx` — if referencing manager role
- Modify: `apps/pos-app/src/pages/users/__test__/user-form.test.tsx` — update role options
- Modify: `apps/pos-app/src/lib/__test__/auth.test.ts` — if referencing role types
- Any other test that hardcodes `"manager"` role checks

**Step 1: Search for all test files referencing "manager" role**

Run: `cd apps/pos-app && grep -rn '"manager"' src/ --include="*.test.*"`

**Step 2: Update each test file**

For each match, determine if the test needs updating:
- Tests that mock `currentUserRole` as `"manager"` → should still pass since manager is still valid
- Tests that check `roles={["manager"]}` in RequireAuth → update to include `"owner"`
- Tests that assert "Manajer" in role dropdown → should now also see "Pemilik"
- The `order-history.test.tsx` "shows cancel button for owner role" test — it already mocks `owner`, so the `canCancel` check needs to work with it

**Step 3: Run all tests**

Run: `cd apps/pos-app && bunx vitest run`
Expected: ALL PASS

**Step 4: Run API tests**

Run: `cd apps/api && bun test`
Expected: ALL PASS (API schema changed but tests mock the DB layer)

**Step 5: Commit**

```
test: update tests for owner role and new login flow
```

---

### Task 10: Lint, typecheck, and final verification

**Step 1: Run lint**

Run: `bun x ultracite fix`

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
| Staff roles | `cashier`, `manager` | `cashier`, `manager`, `owner` |
| Owner onboarding | Onboarding → `/login` → user picker → PIN | Onboarding → merchant → outlet → PIN setup → `/pos` |
| Single staff login | Shows user picker with 1 user | Auto-selects the only user, shows PIN directly |
| "Masuk dengan akun cloud" on login | Present | Removed — use Settings → Lepaskan Perangkat |
| `seedDefaultManager` | Seeded a fake manager on first boot | Removed — onboarding creates real owner staff |
| Role-based access | `manager` only for dashboard/menu/users | `manager` + `owner` |
| Device unpair | "Putuskan Koneksi" label | "Lepaskan Perangkat" with clearer messaging |
| User form roles | Kasir, Manajer | Kasir, Manajer, Pemilik |

## Flow diagrams

### Fresh install (new owner)
```
/cloud-login → Register → /onboarding
  → Step 1: Create merchant
  → Step 2: Create outlet
  → Step 3: Setup PIN (enter + confirm)
  → Auto-login → /pos
```

### Pair new device (existing owner/employee)
```
/cloud-login → Sambungkan Perangkat → /device-pair
  → Enter 8-char code
  → Sync pulls staff
  → /login → PIN (auto-select if 1 staff)
```

### Returning user
```
/login → Auto-select if 1 staff → Enter PIN → /pos (cashier) or / (manager/owner)
```

### Switch merchant/outlet
```
/settings → Lepaskan Perangkat → /cloud-login → login → pick merchant/outlet → /login → PIN
```
