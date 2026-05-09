# Registration & Login Flow Fixes

**Date:** 2026-05-09
**Status:** Fixed

## Summary

Multiple bugs in the registration and login flow caused crashes and incorrect redirects on fresh app installs.

---

## Bugs Fixed

### Bug 1: `searchParams.get is not a function` (Runtime Crash)

**File:** `apps/pos-app/src/pages/onboarding.tsx:29`

**Symptom:** App crashed immediately when navigating to `/onboarding` with query params.

**Root Cause:** `@solidjs/router`'s `useSearchParams()` returns a plain reactive object (like `{ merchantId: "abc" }`), NOT a `URLSearchParams` instance. Calling `.get()` on it throws.

**Before:**
```ts
const [searchParams] = useSearchParams();
const merchantIdFromQuery = searchParams.get("merchantId");
```

**After:**
```ts
const [searchParams] = useSearchParams();
const rawMerchantId = searchParams.merchantId;
const merchantIdFromQuery = typeof rawMerchantId === "string" ? rawMerchantId : null;
```

The `typeof` guard is needed because SolidJS router search param values can be `string | string[] | undefined` (query params can be arrays like `?id=1&id=2`).

---

### Bug 2: 422 Validation Error — `outletId: null` sent to API

**File:** `apps/pos-app/src/lib/cloud-auth.ts:160-169`

**Symptom:** After creating outlet and setting PIN, the `createStaff` API call returned 422 with:
```
Expected property 'outletId' to be string but found: null
```

**Root Cause (API layer):** `createStaff()` in `cloud-auth.ts` serialized `outletId: params.outletId ?? null` — sending `null` when no outletId was provided. The API schema requires `outletId` to be a string.

**Before:**
```ts
body: JSON.stringify({
  name: params.name,
  pin: params.pin,
  role: params.role ?? "cashier",
  outletId: params.outletId ?? null,  // sends null -> 422
}),
```

**After:**
```ts
const body: Record<string, unknown> = {
  name: params.name,
  pin: params.pin,
  role: params.role ?? "cashier",
};
if (params.outletId) {
  body.outletId = params.outletId;
}
// outletId is omitted entirely when not provided
```

**Root Cause (UI layer):** `onboarding.tsx` passed `outletId: undefined` to `createStaffApi` even though the outlet ID was available from the outlet creation step.

**Before:**
```ts
await createStaffApi({
  merchantId: merchant.id,
  outletId: undefined,  // outlet ID was created but not passed
  name: merchant.name,
  pin: pin(),
  role: "owner",
});
```

**After:** Added `createdOutletId` signal, set after outlet creation, and passed to staff creation:
```ts
const [createdOutletId, setCreatedOutletId] = createSignal<string | null>(null);

// In handleCreateOutlet:
setCreatedOutletId(result.id);

// In handlePinSubmit:
await createStaffApi({
  merchantId: merchant.id,
  outletId: createdOutletId() ?? undefined,
  name: merchant.name,
  pin: pin(),
  role: "owner",
});
```

---

### Bug 3: Reinstall → Existing Outlet → Redirected to Onboarding Instead of PIN Login

**File:** `apps/pos-app/src/pages/cloud-login.tsx:85-116`

**Symptom:** After reinstalling the app, logging in via cloud, and selecting an existing merchant + outlet, the user was redirected to "Buat outlet pertama" (create first outlet) instead of the PIN login screen.

**Root Cause:** `handleSelectOutlet` silently swallowed `syncNow()` errors. On a fresh install, the local SQLite DB is empty. If sync fails for any reason (network, auth token timing, server error), `getActiveStaff()` queries the empty local DB, gets `[]`, and the code redirects to `/onboarding?merchantId=...` — which resolves to the "create outlet" step.

**Before:**
```ts
const handleSelectOutlet = async (outlet: Outlet) => {
  setOutletContext(outlet.id, outlet.merchantId);
  try {
    await syncNow();
  } catch (err) {
    console.error("syncNow FAILED", err);  // swallowed
  }
  // local DB is empty if sync failed
  const activeStaff = await getActiveStaff();
  if (activeStaff.length === 0) {
    navigate(`/onboarding?merchantId=${outlet.merchantId}`);  // WRONG
  } else {
    navigate("/login");
  }
};
```

**After:**
```ts
const handleSelectOutlet = async (outlet: Outlet) => {
  setLoading(true);
  setError("");
  setOutletContext(outlet.id, outlet.merchantId);
  try {
    await syncNow();
  } catch (err) {
    console.error("syncNow FAILED", err);
    setError("Gagal menyinkronkan data. Coba lagi.");
    return;  // stay on outlet picker, don't redirect
  } finally {
    setLoading(false);
  }
  navigate("/login", { replace: true });  // always go to PIN login on success
};
```

**Logic change:**
- Sync failed → show error, stay on outlet picker (user can retry)
- Sync succeeded → always go to `/login` (PIN screen). The outlet already exists, no need for onboarding. Staff data is in the local DB after sync.

---

## Architecture: Auth & Routing Flow

### Route Definitions (`App.tsx:54-124`)

| Route | Component | Auth Required |
|-------|-----------|---------------|
| `/cloud-login` | CloudLogin | No (public) |
| `/device-pair` | DevicePair | No (public) |
| `/onboarding` | Onboarding | No (public) |
| `/login` | Login | No (public) |
| `/` | Dashboard | Yes (manager, owner) |
| `/pos` | POS | Yes (any role) |
| `/orders` | OrderHistory | Yes (any role) |
| `/menu/*` | MenuManagement | Yes (manager, owner) |
| `/users/*` | UserManagement | Yes (manager, owner) |
| `/settings` | Settings | Yes (any role) |

### Guard Layers

**Guard 1 — Layout Guard** (`components/layout.tsx:80-97`):
Runs as `createEffect` on every route change. Redirects unauthenticated users.

| `isPublicRoute` | `isAuthenticated` | `isDevicePaired` | Action |
|-----------------|-------------------|------------------|--------|
| true | any | any | No redirect |
| false | true | any | No redirect |
| false | false | true | → `/login` |
| false | false | false | → `/cloud-login` |

**Guard 2 — RequireAuth** (`App.tsx:26-52`):
Wraps protected route components. Same logic as Layout guard. Also hides content via `<Show>` if not authenticated.

### Key State Signals

**Outlet Context** (`store/outlet.ts`):
- `currentOutletId` — persisted in `localStorage` key `sakti-pos:current-outlet-id`
- `currentMerchantId` — persisted in `localStorage` key `sakti-pos:current-merchant-id`
- `currentRegisterId` — persisted in `localStorage` key `sakti-pos:current-register-id`
- `isDevicePaired()` = `currentOutletId() !== null`
- Loaded at startup via `loadOutletContext()` in `index.tsx`

**Auth State** (`store/auth.ts`):
- `user` — **NOT persisted** (always `null` on app restart)
- `isAuthenticated()` = `user() !== null`
- Set only via `login(staffId, pin)` which verifies PIN against local DB
- `getActiveStaff()` queries **local** SQLite `staff` table

### App Bootstrap Sequence (`index.tsx`)

```
1. loadOutletContext()     — load outlet/merchant IDs from localStorage
2. Render Root component
3. bootstrap()
   ├── runStartupSync()   — sync if outlet is paired (5s timeout)
   └── setBooted(true)
```

### User Flows

**New user registration:**
```
/cloud-login → register → no merchants → /onboarding
  → create merchant → create outlet → set PIN → /pos
```

**Returning user (existing merchant + outlet + staff):**
```
/cloud-login → login → has merchants → pick merchant → pick outlet
  → syncNow() → /login (PIN) → /pos
```

**Reinstall, existing data on server:**
```
App starts → no localStorage → /cloud-login
  → login → pick merchant → pick outlet → syncNow() → /login (PIN) → /pos
```

---

## Files Changed

| File | Change |
|------|--------|
| `apps/pos-app/src/pages/onboarding.tsx` | Fix `searchParams.get()` → property access; add `createdOutletId` signal; pass outlet ID to `createStaffApi` |
| `apps/pos-app/src/lib/cloud-auth.ts` | Omit `outletId` from request body when not provided (instead of sending `null`) |
| `apps/pos-app/src/pages/cloud-login.tsx` | Fail loudly on sync error (show error + stay on page); always redirect to `/login` on success |

---

## Potential Future Issues

1. **`onboarding.tsx` has no "create staff only" step.** When arriving from `cloud-login.tsx` via `?merchantId=...`, it starts at "create outlet" step even though the outlet already exists. This path is no longer used after our fix, but if reintroduced, it would need a `"setup-pin"` only step.

2. **Sync reliability on first connection.** The `syncNow()` call during `handleSelectOutlet` is the critical path. If the server is slow or the network is flaky, users see an error. Consider a retry mechanism or background sync indicator.

3. **Auth token timing.** `AuthStorage.getToken()` is async (reads from Stronghold). There's a potential race between saving the token after cloud login and reading it during sync. The Stronghold write is fire-and-forget.
