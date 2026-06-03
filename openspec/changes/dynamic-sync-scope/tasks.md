## 1. Sync Contract — Type Definitions

- [ ] 1.1 Replace `SYNC_SCOPE` constant in `sync-constants.ts` with `SyncScope` type and `createSyncScope` helper
- [ ] 1.2 Update package.json exports if needed for new type exports

## 2. Auth Store — Scope State

- [ ] 2.1 Add `scopeId` signal to `store/auth.ts` — holds current sync scope value
- [ ] 2.2 Add `setScope(id: string)` action to auth store — called after login
- [ ] 2.3 Add `clearScope()` action to auth store — called on logout

## 3. Server — Dual Scope Resolution

- [ ] 3.1 Update `resolveScope` in `apps/api/src/sync/routes.ts` to check if scope ID is a merchant ID (direct return) or outlet ID (resolve via `getOutletMerchantId`)
- [ ] 3.2 Add `getMerchantById` helper for merchant ID validation
- [ ] 3.3 Update scope context type to include `scopeType: "merchant" | "outlet"`

## 4. POS App — Dynamic Sync Client

- [ ] 4.1 Update `lib/sync.ts` — replace static `SYNC_SCOPE` with dynamic scope from auth store
- [ ] 4.2 Update `providers/sync-client-provider.tsx` — read scope from auth store, recreate client on scope change
- [ ] 4.3 Add sync restart logic — stop old client, clear query cache, start new client when scope changes

## 5. Authentication Flow — Set Scope

- [ ] 5.1 Update owner login flow (`use-cloud-auth-flow.ts`) — call `setScope(merchantId)` after successful auth
- [ ] 5.2 Update paired device login flow — call `setScope(outletId)` after PIN verification
- [ ] 5.3 Update logout flow — call `clearScope()` and stop sync

## 6. Verification

- [ ] 6.1 Verify typecheck passes for both apps
- [ ] 6.2 Verify all tests pass (POS + API)
- [ ] 6.3 Manual test: owner login syncs all merchant data
- [ ] 6.4 Manual test: paired device login syncs merchant data filtered by outlet
