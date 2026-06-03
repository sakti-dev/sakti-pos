## Why

SYNC_SCOPE is currently hardcoded as `"default"`. The POS app supports two login types — owner (full merchant access) and paired device (single outlet access) — but sync always runs with the same static scope. This means paired devices sync data they shouldn't access, and owners can't sync across all outlets. The scope must be dynamic, set at login time based on who authenticates.

## What Changes

- SYNC_SCOPE becomes a runtime value, not a compile-time constant. Set after authentication based on login type.
- Owner login sets scope to merchant ID — syncs all data for that merchant (all outlets, products, staff, etc.).
- Paired device login sets scope to outlet ID — server resolves to merchant and returns all merchant data, but the POS UI filters to the device's outlet for orders/registers.
- Server `resolveScope` handles both scope types: merchant ID (return directly) and outlet ID (resolve to merchant, return all merchant data).
- `sync-constants.ts` exports a type/interface for the scope, not a static string.

## Capabilities

### New Capabilities
- `dynamic-sync-scope`: Runtime scope resolution based on authentication context. Covers scope assignment, server-side resolution for both merchant and outlet scopes, and sync client initialization with dynamic scope.

### Modified Capabilities
_(none — this is new behavior, not changing existing spec requirements)_

## Impact

- `packages/sync-contract/src/sync-constants.ts` — static `SYNC_SCOPE` constant replaced with type definition
- `apps/pos-app/src/lib/sync.ts` — singleton sync client needs dynamic scope injection
- `apps/pos-app/src/providers/sync-client-provider.tsx` — provider creates sync client with runtime scope
- `apps/pos-app/src/lib/auth/` — authentication flow sets scope after login
- `apps/api/src/sync/routes.ts` — server `resolveScope` updated to handle both scope types
- `apps/pos-app/src/store/auth.ts` — auth store holds current scope value
