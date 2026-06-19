## Why

The new POS UI (`apps/pos-app/src/`) has a complete visual design for the auth and onboarding flows — register, login, PIN entry, and onboarding wizard — but every action resolves to `setTimeout` + `toast.success`. The old implementation (`src-old/`) has working cloud auth, token storage, Drizzle DB access, sync, and staff management, but uses the old design. We need to re-integrate the `src-old` backend into `src/` so auth actually works end-to-end.

## What Changes

- Port shared infrastructure from `src-old/` to `src/`: Eden API client, auth token storage (Tauri Keystore), cloud auth functions, local PIN verification, Drizzle DB setup, reactive auth/outlet/sync stores, logger, date-time utilities.
- Wire the register page to the real `cloudRegister()` API with proper validation (min 8 char password, email format) and error handling (409, 401, network errors).
- Wire the Google OAuth button to `getGoogleOAuthUrl()` instead of a toast.
- Add the `continueAfterAuth` flow: after register/login, fetch merchants → show merchant picker or redirect to onboarding.
- Add merchant picker and outlet picker UI (adapted from `src-old`'s `CloudAuthPickers` to new design system).
- Wire the onboarding wizard to real API calls (`createMerchant`, `createOutlet`, `createStaff`, `syncNow`, `login`) replacing `mockSubmit`.
- Add PIN setup step (Step 4) to the onboarding wizard, reusing extracted PIN components.
- Wire the login page to real `cloudLogin()` API with proper error handling.
- Wire the PIN entry page to real `verifyPin()` against Drizzle DB and `getActiveStaff()` instead of hardcoded mock users.
- Extract reusable PIN components (Numpad, PinDots, UserCard, SuccessOverlay) from `pages/auth/pin/` to `components/`.
- Remove all mock data files (`lib/data/auth.ts` hardcoded pinUsers, `lib/data/staff.ts` hardcoded staffMembers).

## Capabilities

### New Capabilities

_(none — this is a re-implementation of existing spec in a new codebase location)_

### Modified Capabilities

- `auth`: Onboarding flow (R14) changes from 3 steps to 4 steps (merchant → outlet → preferences → PIN setup). Preferences (tax %, initial cash, business type) are new UI fields stored as local state pending future DB schema. The core cloud API calls and PIN/sync behavior remain the same. Cloud merchant/outlet picker UI is adapted to the new design system.

## Impact

- **Code**: `apps/pos-app/src/lib/`, `apps/pos-app/src/store/`, `apps/pos-app/src/db/`, `apps/pos-app/src/components/`, `apps/pos-app/src/pages/auth/`, `apps/pos-app/src/pages/onboarding/` — all new files or rewrites of existing shells.
- **Dependencies**: All required packages already in `package.json` (`@elysia/eden`, `@tauri-apps/api`, `@sync-contract`, `baresync`, `drizzle-orm`, `dayjs`, `valibot`, `solid-sonner`, `@tauri-apps/plugin-log`).
- **No changes** to `src-old/`, `src-tauri/` (Rust backend), or the cloud API.
