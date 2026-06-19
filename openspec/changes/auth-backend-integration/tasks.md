## 1. Foundation — Shared Infrastructure

- [x] 1.1 Verify `tsconfig.json` path alias (`~` → `src/`) matches between `src` and `src-old` usage
- [x] 1.2 Port `src-old/lib/logger.ts` → `src/lib/logger.ts`
- [x] 1.3 Port `src-old/lib/utils.ts` (add `describeError`) → merge into `src/lib/utils/index.ts`
- [x] 1.4 Port `src-old/lib/date-time.ts` → `src/lib/date-time.ts`
- [x] 1.5 Port `src-old/lib/api/eden.ts` → `src/lib/api/eden.ts`
- [x] 1.6 Port `src-old/lib/auth/storage.ts` → `src/lib/auth/storage.ts`
- [x] 1.7 Port `src-old/lib/auth/cloud.ts` → `src/lib/auth/cloud.ts`
- [x] 1.8 Port `src-old/lib/auth/provider.ts` → `src/lib/auth/provider.ts`
- [x] 1.9 Port `src-old/lib/sync.ts` → `src/lib/sync.ts`
- [x] 1.10 Port `src-old/db/index.ts` → `src/db/index.ts`
- [x] 1.11 Port `src-old/store/auth.ts` → `src/store/auth.ts`
- [x] 1.12 Port `src-old/store/outlet.ts` → `src/store/outlet.ts`
- [x] 1.13 Port `src-old/store/sync.ts` → `src/store/sync.ts`
- [x] 1.14 Verify `bun x ultracite check` passes on all ported files (fix any import issues)

## 2. Extract Reusable PIN Components

- [x] 2.1 Create `src/components/pin/numpad.tsx` — extract from `pages/auth/pin/components/numpad.tsx`
- [x] 2.2 Create `src/components/pin/pin-dots.tsx` — extract from `pages/auth/pin/components/pin-dots.tsx`
- [x] 2.3 Create `src/components/pin/user-card.tsx` — extract from `pages/auth/pin/components/user-card.tsx`
- [x] 2.4 Create `src/components/pin/success-overlay.tsx` — extract from `pages/auth/pin/components/success-overlay.tsx`
- [x] 2.5 Create `src/components/pin/index.ts` barrel export
- [x] 2.6 Update `pages/auth/pin/` components to import from `~/components/pin/` instead of local files
- [x] 2.7 Verify pin page still renders correctly after extraction

## 3. Register Page — Backend Wiring

- [x] 3.1 Create `src/pages/auth/use-cloud-auth-flow.ts` — adapt from `src-old/pages/login/use-cloud-auth-flow.ts`
- [x] 3.2 Wire `register/components/right-panel.tsx`: replace `setTimeout` mock with real `cloudRegister()` call
- [x] 3.3 Fix password validation: change minimum from 6 to 8 characters
- [x] 3.4 Add `ApiError` handling: show specific messages for 409 (email exists), 401, network errors
- [x] 3.5 Wire Google OAuth button: call `window.open(getGoogleOAuthUrl(), ...)` instead of `toast.success`
- [x] 3.6 Wire post-register flow: call `continueAfterAuth()` — redirect to merchant picker or onboarding
- [x] 3.7 Create merchant picker UI — adapt from `src-old`'s `CloudAuthPickers` to new design system (within `AuthRightPanel` shell)
- [x] 3.8 Create outlet picker UI — same adaptation, showing outlet names and addresses
- [x] 3.9 Verify full register → merchant picker → outlet picker → sync → login flow works

## 4. Login Page — Backend Wiring

- [x] 4.1 Wire `login/components/right-panel.tsx`: replace `setTimeout` mock with real `cloudLogin()` call
- [x] 4.2 Fix password validation: change minimum from 6 to 8 characters
- [x] 4.3 Add `ApiError` handling: show specific messages for 401, network errors
- [x] 4.4 Wire Google OAuth button: call `window.open(getGoogleOAuthUrl(), ...)` instead of `toast.success`
- [x] 4.5 Wire post-login flow: reuse `use-cloud-auth-flow` hook for merchant/outlet picker path
- [x] 4.6 Verify full login → merchant picker → outlet picker → sync → login flow works

## 5. Onboarding Page — Backend Wiring

- [x] 5.1 Wire Step 1 (merchant): replace mock with real `createMerchant()` API call
- [x] 5.2 Wire Step 2 (outlet): replace mock with real `createOutlet()` API call + `setOutletContext()`
- [x] 5.3 Keep Step 3 (preferences) as local state — save tax/cash/business_type to localStorage
- [x] 5.4 Add Step 4 (PIN setup): add PIN wizard with two-entry confirmation using extracted `Numpad` + `PinDots`
- [x] 5.5 Wire Step 4 completion: `createStaff()` → `getCurrentCloudStaff()` → `syncNow()` → `login()` → navigate by role
- [x] 5.6 Support `?merchantId=` and `?outletId=` query params to skip steps for returning users
- [x] 5.7 Handle edge case: skip PIN setup if owner staff already exists after outlet creation
- [x] 5.8 Remove `mockSubmit()` function
- [x] 5.9 Verify full onboarding flow: merchant → outlet → preferences → PIN → sync → auto-login → navigate

## 6. PIN Page — Backend Wiring

- [x] 6.1 Wire `use-pin-auth.ts`: replace hardcoded pin comparison with real `verifyPin()` call against Drizzle DB
- [x] 6.2 Wire user list: replace hardcoded `pinUsers` with `getActiveStaff()` from DB
- [x] 6.3 Wire `AccountSelector`: render real staff data (name, role, initials) instead of mock data
- [x] 6.4 Wire success: call `login()` from `store/auth.ts`, then navigate by role (cashier → `/pos`, manager/owner → `/`)
- [x] 6.5 Remove hardcoded `pinUsers` from `src/lib/data/auth.ts``
- [x] 6.6 Remove hardcoded `staffMembers` from `src/lib/data/staff.ts` (or keep if referenced elsewhere)
- [x] 6.7 Verify full PIN flow: select user → enter PIN → verify → login → navigate

## 7. Cleanup and Verification

- [x] 7.1 Run `bun x ultracite check` — fix all lint/format issues
- [x] 7.2 Run `bun test` — ensure no test regressions
- [x] 7.3 Verify all auth routes work end-to-end: `/auth/register` → `/onboarding` → `/auth/login` → `/auth/pin` → `/`
- [x] 7.4 Update `openspec/APP-LOGGING-DOCS.md` if any new log prefixes were introduced
- [x] 7.5 Update `LOG_FILTER` in `logs/capture-adb-logcat.sh` for auth-related prefixes
