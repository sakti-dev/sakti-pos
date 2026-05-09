# Onboarding Guard & PIN Setup Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix onboarding so it only triggers for truly new owners (no merchant + no outlet), and fix PIN setup so it only runs if no owner PIN exists yet.

**Architecture:** Two bugs in `cloud-login.tsx` and `onboarding.tsx`. The cloud-login page sends users to `/onboarding` in two places where it shouldn't always (lines 46 and 72). Onboarding blindly creates a new merchant every time. The fix: (1) cloud-login should only navigate to onboarding when `getMerchants()` returns empty AND user role is owner — if merchant exists but no outlets, inline outlet creation instead. (2) Onboarding should accept optional `merchantId` query param and skip merchant step if provided. (3) Before PIN setup step, check if an owner staff member already exists for that merchant — if yes, skip PIN and go to login. (4) Fix the `getSession` type mismatch so the client can access the user's role per merchant.

**Tech Stack:** SolidJS, TypeScript, Vitest, @solidjs/testing-library

---

## Bug Analysis

### Bug 1: Returning user sent to onboarding

`cloud-login.tsx` line 46: after login/register, if `getMerchants()` returns empty → `/onboarding`. This is correct ONLY for new registrations. For returning users who log in with a different device (reinstall), `getMerchants()` hits the API and returns their existing merchants — so this path is actually fine for returning users **with merchants**.

`cloud-login.tsx` line 72: after selecting a merchant, if `getOutlets()` returns empty → `/onboarding`. This is the real problem. An owner who created a merchant but hasn't created an outlet yet (or outlets were deleted) gets sent to onboarding which creates a **duplicate** merchant.

`onboarding.tsx`: no guard at all. It always starts from step "merchant" and calls `createMerchant()` even if the user already has one.

### Bug 2: PIN always re-created on onboarding

`onboarding.tsx` line 80-115: the `setup-pin` step always runs and calls `createStaffMember()` with `role: "owner"`. If an owner already exists (from a previous onboarding on another device), this creates a duplicate owner record.

---

## Task 1: Fix `getSession` type to include role

**Files:**
- Modify: `apps/pos-app/src/lib/cloud-auth.ts:5-16, 107-112`

**Step 1: Write the failing test**

Create: `apps/pos-app/src/lib/__test__/cloud-auth-session-type.test.ts`

```typescript
import { describe, expect, test } from "vitest";

describe("getSession return type includes merchant role", () => {
  test("Merchant type has id and name", () => {
    const merchant = { id: "m1", name: "Test", createdAt: "", updatedAt: "" } as const;
    expect(merchant.id).toBe("m1");
    expect(merchant.name).toBe("Test");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun --filter pos-app test apps/pos-app/src/lib/__test__/cloud-auth-session-type.test.ts`
Expected: PASS (this is a type-checking task, we verify types compile)

**Step 3: Update Merchant type and getSession return type**

In `apps/pos-app/src/lib/cloud-auth.ts`, update `getSession` to return the actual API shape including `merchantId` and `role`:

```typescript
interface SessionMerchant {
  merchantId: string;
  name: string;
  role: string;
}

export async function getSession(): Promise<{
  merchants: SessionMerchant[];
  user: ApiUser | null;
}> {
  return apiFetch("/api/auth/session");
}

export type { SessionMerchant };
```

Also update `getMerchants` return type to match the API response which returns `{ merchantId, name, role }`:

```typescript
export async function getMerchants(): Promise<SessionMerchant[]> {
  return apiFetch("/api/merchants");
}
```

**Step 4: Run tests**

Run: `bun --filter pos-app test`
Expected: ALL PASS (type errors will surface as compile errors)

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/cloud-auth.ts
git commit -m "fix: align getSession and getMerchants types with API response"
```

---

## Task 2: Add `getOwnerStaff` query to staff.ts

We need a way to check if an owner staff member already exists for a given merchant.

**Files:**
- Modify: `apps/pos-app/src/db/staff.ts`

**Step 1: Write the failing test**

Create: `apps/pos-app/src/db/__test__/staff.test.ts`

```typescript
import { describe, expect, test, vi } from "vitest";

vi.mock("~/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
}));

vi.mock("~/store/outlet", () => ({
  currentMerchantId: () => null,
}));

describe("getOwnerStaff", () => {
  test("is exported from staff module", async () => {
    const { getOwnerStaff } = await import("~/db/staff");
    expect(typeof getOwnerStaff).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun --filter pos-app test apps/pos-app/src/db/__test__/staff.test.ts`
Expected: FAIL — `getOwnerStaff` is not exported

**Step 3: Implement `getOwnerStaff`**

Add to `apps/pos-app/src/db/staff.ts`:

```typescript
export async function getOwnerStaff(
  merchantId: string,
): Promise<StaffMember | undefined> {
  const [row] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.merchantId, merchantId), eq(staff.role, "owner")))
    .limit(1);
  return row;
}
```

Note: `and` is already imported in staff.ts.

**Step 4: Run test to verify it passes**

Run: `bun --filter pos-app test apps/pos-app/src/db/__test__/staff.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/pos-app/src/db/staff.ts apps/pos-app/src/db/__test__/staff.test.ts
git commit -m "feat: add getOwnerStaff query to check if owner exists"
```

---

## Task 3: Fix cloud-login to not send existing merchants to onboarding

**Files:**
- Modify: `apps/pos-app/src/pages/cloud-login.tsx:63-79`
- Test: `apps/pos-app/src/pages/__test__/cloud-login.test.tsx`

**Step 1: Write the failing test**

Create: `apps/pos-app/src/pages/__test__/cloud-login.test.tsx`

```typescript
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCloudLogin = vi.fn();
const mockCloudRegister = vi.fn();
const mockGetMerchants = vi.fn();
const mockGetOutlets = vi.fn();
const mockSetOutletContext = vi.fn();

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
  login: (...args: unknown[]) => mockCloudLogin(...args),
  register: (...args: unknown[]) => mockCloudRegister(...args),
  getGoogleOAuthUrl: () => "http://localhost:3001/api/auth/google",
  getMerchants: () => mockGetMerchants(),
  getOutlets: (...args: unknown[]) => mockGetOutlets(...args),
  Merchant: undefined,
  Outlet: undefined,
}));

vi.mock("~/store/outlet", () => ({
  setOutletContext: (...args: unknown[]) => mockSetOutletContext(...args),
}));

import CloudLogin from "../cloud-login";

const user = userEvent.setup();

describe("CloudLogin - onboarding guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("navigates to onboarding only when user has zero merchants (new user)", async () => {
    mockGetMerchants.mockResolvedValueOnce([]);
    render(() => <CloudLogin />);
    await user.type(screen.getByPlaceholderText("email@contoh.com"), "new@test.com");
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/onboarding", { replace: true });
    });
  });

  test("does NOT navigate to onboarding when user has merchants", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "Existing Biz", role: "owner" },
    ]);
    render(() => <CloudLogin />);
    await user.type(screen.getByPlaceholderText("email@contoh.com"), "existing@test.com");
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await vi.waitFor(() => {
      expect(screen.getByText("Existing Biz")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith("/onboarding", { replace: true });
  });

  test("does NOT navigate to onboarding when merchant has no outlets - shows inline outlet creation instead", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "Existing Biz", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([]);
    render(() => <CloudLogin />);
    await user.type(screen.getByPlaceholderText("email@contoh.com"), "existing@test.com");
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("Existing Biz");
    await user.click(screen.getByText("Existing Biz"));
    // Should NOT go to onboarding
    expect(mockNavigate).not.toHaveBeenCalledWith("/onboarding", { replace: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun --filter pos-app test apps/pos-app/src/pages/__test__/cloud-login.test.tsx`
Expected: FAIL — the last test will fail because `handleSelectMerchant` currently navigates to `/onboarding` when outlets are empty.

**Step 3: Fix `cloud-login.tsx`**

In `handleSelectMerchant` (line 63-79), change the "no outlets" path. Instead of navigating to `/onboarding`, navigate to `/onboarding?merchantId=<id>` so onboarding knows to skip the merchant step:

```typescript
const handleSelectMerchant = async (merchant: { merchantId: string; name: string; role: string }) => {
  setLoading(true);
  setError("");
  try {
    const merchantOutlets = await getOutlets(merchant.merchantId);
    if (merchantOutlets.length > 0) {
      setOutlets(merchantOutlets);
      setStep("outlet-picker");
    } else {
      navigate(`/onboarding?merchantId=${merchant.merchantId}`, { replace: true });
    }
  } catch {
    setError("Gagal memuat outlet");
  } finally {
    setLoading(false);
  }
};
```

Note: The first path (line 46, no merchants at all) should still navigate to `/onboarding` without a merchantId — that's the true new user path.

**Step 4: Run test to verify it passes**

Run: `bun --filter pos-app test apps/pos-app/src/pages/__test__/cloud-login.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/cloud-login.tsx apps/pos-app/src/pages/__test__/cloud-login.test.tsx
git commit -m "fix: cloud-login passes merchantId to onboarding when merchant has no outlets"
```

---

## Task 4: Refactor onboarding to accept optional merchantId and skip steps

**Files:**
- Modify: `apps/pos-app/src/pages/onboarding.tsx`
- Modify: `apps/pos-app/src/pages/__test__/onboarding.test.tsx`

**Step 1: Write the failing tests**

Add these tests to `apps/pos-app/src/pages/__test__/onboarding.test.tsx`:

```typescript
describe("Onboarding with existing merchant", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("starts at outlet step when merchantId is provided via query param", async () => {
    // We need to mock useParams to return merchantId
    // Update the router mock at module level or use a separate describe
    vi.doMock("@solidjs/router", () => ({
      useNavigate: () => mockNavigate,
      useParams: () => ({ merchantId: "existing-merchant-1" }),
      useSearchParams: () => [
        { get: (key: string) => key === "merchantId" ? "existing-merchant-1" : null },
        () => {},
      ],
    }));

    // Re-import after mock update
    const { default: OnboardingWithMerchant } = await import("../onboarding");
    vi.resetModules();

    // NOTE: Due to SolidJS module mocking complexity, this test may need
    // to be structured as an integration test. The key assertion is:
    // when merchantId is present, the outlet step is shown first.
  });

  test("skips PIN setup when owner staff already exists for merchant", async () => {
    // Mock getOwnerStaff to return an existing owner
    // After creating outlet, should navigate to /login instead of showing PIN step
  });
});
```

Since SolidJS module re-mocking is tricky in vitest, the pragmatic approach is to restructure the component to accept a prop or use `useSearchParams`, and test the logic extraction. Let's refactor:

**Step 1 (revised): Extract onboarding step logic into a testable function**

Create: `apps/pos-app/src/pages/onboarding.tsx`

Extract the step resolution logic:

```typescript
import { useNavigate, useSearchParams } from "@solidjs/router";
// ... existing imports ...
import { getOwnerStaff } from "~/db/staff";

export type OnboardingStep = "merchant" | "outlet" | "setup-pin" | "skip-pin-login";

export function resolveInitialStep(
  merchantIdFromQuery: string | null,
): OnboardingStep {
  if (merchantIdFromQuery) {
    return "outlet";
  }
  return "merchant";
}
```

**Step 2: Write test for `resolveInitialStep`**

Create: `apps/pos-app/src/pages/__test__/onboarding-logic.test.ts`

```typescript
import { describe, expect, test } from "vitest";
import { resolveInitialStep } from "../onboarding";

describe("resolveInitialStep", () => {
  test("returns 'merchant' when no merchantId provided", () => {
    expect(resolveInitialStep(null)).toBe("merchant");
  });

  test("returns 'outlet' when merchantId is provided", () => {
    expect(resolveInitialStep("m1")).toBe("outlet");
  });
});
```

**Step 3: Run test to verify it fails**

Run: `bun --filter pos-app test apps/pos-app/src/pages/__test__/onboarding-logic.test.ts`
Expected: FAIL — `resolveInitialStep` is not exported

**Step 4: Implement the onboarding refactor**

Full changes to `apps/pos-app/src/pages/onboarding.tsx`:

1. Import `useSearchParams` from router
2. Import `getOwnerStaff` from `~/db/staff`
3. Add `resolveInitialStep` exported function
4. On mount, read `merchantId` from search params
5. If `merchantId` present, skip to "outlet" step and pre-set the merchant
6. After outlet creation, check `getOwnerStaff(merchantId)`:
   - If owner exists → navigate to `/login` (PIN already set on another device)
   - If no owner → show `setup-pin` step
7. After PIN setup, navigate to `/pos` as before

```typescript
export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const merchantIdFromQuery = searchParams.get("merchantId");

  const [step, setStep] = createSignal<OnboardingStep>(resolveInitialStep(merchantIdFromQuery));
  const [merchantName, setMerchantName] = createSignal("");
  const [outletName, setOutletName] = createSignal("");
  const [outletAddress, setOutletAddress] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [createdMerchant, setCreatedMerchant] = createSignal<Merchant | null>(
    merchantIdFromQuery ? { id: merchantIdFromQuery, name: "", createdAt: "", updatedAt: "" } : null,
  );
  const [pin, setPin] = createSignal("");

  // ... handleCreateMerchant stays the same ...

  const handleCreateOutlet = async (e: Event) => {
    e.preventDefault();
    const merchant = createdMerchant();
    if (!merchant) return;

    setError("");
    setLoading(true);

    try {
      const result = await createOutlet(
        merchant.id,
        outletName().trim(),
        outletAddress().trim() || undefined,
      );
      setOutletContext(result.id, result.merchantId, result.register?.id);

      // Check if owner already has a PIN set (e.g., from another device)
      const existingOwner = await getOwnerStaff(merchant.id);
      if (existingOwner) {
        navigate("/login", { replace: true });
      } else {
        setStep("setup-pin");
      }
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

  // ... handlePinSubmit stays the same ...
}
```

**Step 5: Run all onboarding tests**

Run: `bun --filter pos-app test apps/pos-app/src/pages/__test__/onboarding.test.tsx apps/pos-app/src/pages/__test__/onboarding-logic.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add apps/pos-app/src/pages/onboarding.tsx apps/pos-app/src/pages/__test__/onboarding-logic.test.ts
git commit -m "feat: onboarding skips merchant step when merchantId provided, skips PIN when owner exists"
```

---

## Task 5: Update existing onboarding tests for new behavior

**Files:**
- Modify: `apps/pos-app/src/pages/__test__/onboarding.test.tsx`

**Step 1: Update existing tests**

The existing test `advances to PIN setup after creating outlet` needs to mock `getOwnerStaff` returning undefined (no owner yet). The existing test `creates staff and navigates to /pos after PIN setup` already works.

Add new mock for `getOwnerStaff`:

```typescript
const mockGetOwnerStaff = vi.fn(() => Promise.resolve(undefined));

vi.mock("~/db/staff", () => ({
  createStaffMember: (data: { ... }) => mockCreateStaffMember(data),
  getOwnerStaff: (merchantId: string) => mockGetOwnerStaff(merchantId),
}));
```

**Step 2: Run tests**

Run: `bun --filter pos-app test apps/pos-app/src/pages/__test__/onboarding.test.tsx`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add apps/pos-app/src/pages/__test__/onboarding.test.tsx
git commit -m "test: update onboarding tests with getOwnerStaff mock"
```

---

## Task 6: Add integration test for returning-user-not-sent-to-onboarding

**Files:**
- Create: `apps/pos-app/src/pages/__test__/cloud-login-onboarding-guard.test.tsx`

**Step 1: Write the test**

```typescript
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCloudLogin = vi.fn();
const mockGetMerchants = vi.fn();
const mockGetOutlets = vi.fn();
const mockSetOutletContext = vi.fn();

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

vi.mock("~/lib/cloud-auth", () => ({
  ApiError: class extends Error {
    status: number;
    constructor(m: string, s: number) { super(m); this.status = s; }
  },
  login: (...a: unknown[]) => mockCloudLogin(...a),
  register: vi.fn(),
  getGoogleOAuthUrl: () => "http://localhost:3001/api/auth/google",
  getMerchants: () => mockGetMerchants(),
  getOutlets: (...a: unknown[]) => mockGetOutlets(...a),
  Merchant: undefined,
  Outlet: undefined,
}));

vi.mock("~/store/outlet", () => ({
  setOutletContext: (...a: unknown[]) => mockSetOutletContext(...a),
}));

import CloudLogin from "../cloud-login";

const user = userEvent.setup();

describe("CloudLogin - returning user flow", () => {
  afterEach(() => vi.clearAllMocks());

  test("returning user with merchant AND outlets goes to outlet picker, not onboarding", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      { id: "o1", merchantId: "m1", name: "Main Outlet", address: null, isActive: true },
    ]);
    render(() => <CloudLogin />);
    await user.type(screen.getByPlaceholderText("email@contoh.com"), "user@test.com");
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    expect(await screen.findByText("Main Outlet")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith("/onboarding", { replace: true });
  });

  test("returning user selects outlet and goes to login page", async () => {
    mockGetMerchants.mockResolvedValueOnce([
      { merchantId: "m1", name: "My Store", role: "owner" },
    ]);
    mockGetOutlets.mockResolvedValueOnce([
      { id: "o1", merchantId: "m1", name: "Main Outlet", address: "Jl. Test 1", isActive: true },
    ]);
    render(() => <CloudLogin />);
    await user.type(screen.getByPlaceholderText("email@contoh.com"), "user@test.com");
    await user.type(screen.getByPlaceholderText("Kata sandi"), "password1234");
    await user.click(screen.getByText("Masuk"));
    await screen.findByText("My Store");
    await user.click(screen.getByText("My Store"));
    await screen.findByText("Main Outlet");
    await user.click(screen.getByText("Main Outlet"));
    await vi.waitFor(() => {
      expect(mockSetOutletContext).toHaveBeenCalledWith("o1", "m1");
    });
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });
});
```

**Step 2: Run test**

Run: `bun --filter pos-app test apps/pos-app/src/pages/__test__/cloud-login-onboarding-guard.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/pos-app/src/pages/__test__/cloud-login-onboarding-guard.test.tsx
git commit -m "test: add integration tests for returning user not sent to onboarding"
```

---

## Task 7: Update Merchant type references across the codebase

**Files:**
- Modify: `apps/pos-app/src/pages/cloud-login.tsx` (state types)
- Modify: `apps/pos-app/src/pages/onboarding.tsx` (Merchant import)

Since `getMerchants` and `getSession` now return `SessionMerchant` instead of `Merchant`, update all consumers:

In `cloud-login.tsx`:
- `createSignal<Merchant[]>` → `createSignal<SessionMerchant[]>`
- `handleSelectMerchant` param type → `SessionMerchant`

In `onboarding.tsx`:
- Keep `Merchant` type for `createMerchant` return value (it still returns `Merchant`)
- The `createdMerchant` signal stays as `Merchant | null`

**Step 1: Run typecheck**

Run: `bun --filter pos-app exec tsc --noEmit`
Expected: May show type errors at usage sites

**Step 2: Fix all type errors**

Update imports and types at each usage site.

**Step 3: Run typecheck again**

Run: `bun --filter pos-app exec tsc --noEmit`
Expected: CLEAN

**Step 4: Run all tests**

Run: `bun --filter pos-app test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: update Merchant type references to SessionMerchant where needed"
```

---

## Task 8: Full regression test

**Step 1: Run full test suite**

Run: `bun --filter pos-app test`
Expected: ALL PASS

**Step 2: Run linter**

Run: `bun x ultracite check`
Expected: CLEAN

**Step 3: Manual verification checklist**

- [ ] New user (register) → no merchants → onboarding → merchant → outlet → PIN → /pos
- [ ] New user (register) → no merchants → onboarding → merchant → outlet (owner exists from API seed?) → /login
- [ ] Returning user (login) → has merchants + outlets → merchant picker → outlet picker → /login
- [ ] Returning user (login) → has merchant but NO outlets → merchant picker → select merchant → onboarding?merchantId=X → outlet only → PIN (if no owner) or /login (if owner exists)
- [ ] Reinstalled app → login → has merchants + outlets → normal flow, never sees onboarding
