## Context

The new POS UI (`apps/pos-app/src/`) was built as a visual redesign with SolidJS, Kobalte UI primitives, and a custom design system. Auth pages (register, login, PIN, onboarding) have complete UI shells but no backend wiring — every form submits to `setTimeout` + `toast`. Meanwhile, `src-old/` contains a working implementation with Eden API client, Tauri Keystore token storage, Drizzle ORM, SolidJS reactive stores, and full cloud-to-PIN auth flow.

This change ports the `src-old` backend into `src/`, adapting imports and leveraging the new UI components. No changes to the Rust Tauri backend, cloud API, or database schema (except new onboarding preferences which stay as local state pending future schema work).

## Goals / Non-Goals

**Goals:**
- Port all shared auth infrastructure (API client, token storage, cloud auth, PIN verification, DB, stores, logger, utilities) from `src-old/` to `src/`.
- Wire register, login, onboarding, and PIN pages to real backend calls.
- Implement the full post-auth flow: merchant/outlet picker for existing users, onboarding for new users.
- Add PIN setup step to the onboarding wizard (Step 4).
- Extract reusable PIN components (Numpad, PinDots, UserCard, SuccessOverlay) to `components/`.
- Remove all hardcoded mock data.

**Non-Goals:**
- Redesigning any UI layouts or visual components.
- Changing the Rust Tauri backend or cloud API endpoints.
- Modifying the existing `openspec/specs/auth/spec.md` requirements (except R14 onboarding step change).
- Implementing onboarding preferences (tax %, initial cash, business type) in the DB/API — these remain local state.
- Wiring the device pairing flow (separate future change).
- Migrating away from `src-old/` (it stays until all features are ported).

## Decisions

### D1: Copy-and-adapt instead of shared package

Copy infrastructure files from `src-old/` into `src/` with import path fixes, rather than extracting a shared package.

**Rationale**: `src-old/` is being replaced — creating a shared package for code being sunset adds overhead with no long-term benefit. The new `src/` locations become the canonical versions.

**Alternative considered**: Monorepo shared package under `packages/auth-core/`. Rejected because `src-old` will eventually be deleted, and the import path divergence is small.

### D2: Manual signals instead of @formisch/solid

Keep the new register/login forms using manual `createSignal` + inline validation, not port `@formisch/solid`.

**Rationale**: The new forms are already working with manual signals. Adding `@formisch/solid` (which isn't even in `package.json`) introduces a dependency for no UX gain.

**Alternative considered**: Port `@formisch/solid` + Valibot schemas. Rejected to avoid new dependencies.

### D3: Extract PIN components to src/components/

Move `Numpad`, `PinDots`, `UserCard`, `SuccessOverlay` to `apps/pos-app/src/components/pin/`. Keep `AccountSelector`, `usePinAuth`, `left-panel`, `right-panel`, `index` in `pages/auth/pin/`.

**Rationale**: The four extracted components are pure presentation — they take props, emit callbacks, have zero knowledge of auth or routing. `AccountSelector` renders `PinUser` objects and is tightly coupled to the auth type. `usePinAuth` contains page-specific lockout logic.

### D4: Onboarding becomes 4 steps (3 existing + 1 new)

The new onboarding wizard has Steps 1–3 from the redesign (merchant, outlet, preferences). Add Step 4 for PIN setup. Steps 1–2 call real API. Step 3 saves preferences to localStorage (pending future DB schema). Step 4 reuses extracted PIN components.

**Rationale**: The existing `src-old` onboarding had merchant → outlet → PIN. The new UI added a preferences step. These are complementary, not conflicting. The PIN step must come after outlet creation (needs merchantId + outletId for staff creation).

### D5: Phase 0 infrastructure as flat file copies

Port all Phase 0 files as direct copies with minimal import path adjustments. No refactoring, no restructuring.

**Rationale**: These files are already battle-tested. The goal is to get them working in the new location, not to improve them. Refactoring can happen later in dedicated changes.

### D6: Merchant/outlet picker as new UI adapted from src-old

Create `use-cloud-auth-flow.ts` hook (adapted from `src-old`) and inline picker UI within the auth pages rather than a separate page component.

**Rationale**: The `src-old` picker was a separate view (`CloudAuthPickers`). The new design uses the `AuthRightPanel` shell — pickers should appear within that shell as an alternative to the form, not navigate to a separate page.

## Risks / Trade-offs

- **[Risk] `store/sync.ts` depends on `lib/sync.ts` + `lib/assets/*`** — `syncNow()` imports asset upload/hydration/recovery modules. These are in `src-old/lib/assets/`. **Mitigation**: Port the sync and asset modules as part of Phase 0, or stub `syncNow()` to only do the core DB sync if asset modules are too entangled. Can verify by attempting the copy.

- **[Risk] Import path divergence** — `src-old` uses `~/db`, `~/lib/auth/cloud`, etc. New `src/` must match the same `~` alias. **Mitigation**: Verify the `tsconfig.json` path alias is identical before starting. It's the same `apps/pos-app` package so it should be.

- **[Risk] Onboarding preferences are local-only** — Tax %, initial cash, and business type won't persist across devices or survive data wipes. **Mitigation**: Accept as temporary. The UI collects the data; a future change will add the DB columns and API endpoints to persist them. Local storage is enough for MVP.

- **[Risk] Two codebases with overlapping auth logic during transition** — `src-old/` and `src/` both have auth infrastructure. If a bug fix is needed, it must be applied twice. **Mitigation**: Short-lived risk. This change is the first major port; subsequent changes will shrink `src-old`'s active surface.
