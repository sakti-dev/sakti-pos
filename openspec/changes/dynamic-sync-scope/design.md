## Context

The POS app has a hardcoded `SYNC_SCOPE = "default"` in `packages/sync-contract/src/sync-constants.ts`. This value is passed to `createSyncClient({ scopeId: SYNC_SCOPE })` in two places:
- `apps/pos-app/src/lib/sync.ts` — singleton for db modules
- `apps/pos-app/src/providers/sync-client-provider.tsx` — provider for UI components

The server's `resolveScope` in `apps/api/src/sync/routes.ts` expects an outlet ID and resolves it to a merchant ID via `getOutletMerchantId()`. This only works for outlet-level scoping.

The POS app has two user types:
- **Owner** — authenticated via cloud OAuth, should see all data for their merchant (all outlets)
- **Paired device** — authenticated via local PIN, assigned to one outlet, should see that outlet's orders/registers plus shared merchant data (products, categories, staff)

## Goals / Non-Goals

**Goals:**
- SYNC_SCOPE becomes a runtime value set after authentication
- Owner login → scope = merchant ID → server returns all merchant data
- Paired device login → scope = outlet ID → server resolves to merchant, returns all merchant data
- Auth store holds current scope value, sync client reads from it
- Both sync client instances (singleton + provider) use the same dynamic scope

**Non-Goals:**
- Changing scopeColumn per table (the existing partition columns are correct)
- Per-outlet data filtering in sync (server always returns merchant-level data; UI filters locally)
- Multi-merchant support for a single device (one device = one merchant)
- Changing the baresync library itself

## Decisions

### 1. Scope value is always resolvable to a merchant ID

**Decision:** The server always resolves the scope to a merchant ID. Whether the client sends a merchant ID or an outlet ID, the server returns all data for that merchant.

**Rationale:** Shared data (products, categories, staff, assets) is merchant-scoped. Even a paired device needs this data to function. The only outlet-specific data is orders, orderItems, and registers — and the UI handles filtering these by outlet.

**Alternative considered:** Outlet-level sync where server only returns outlet-specific data. Rejected because paired devices still need products, categories, etc.

### 2. Scope stored in auth store, not as a constant

**Decision:** Replace `SYNC_SCOPE` constant with a `SyncScope` type. The actual scope value lives in the auth store (`store/auth.ts`) and is set during login. Sync clients read from the store.

**Rationale:** The scope depends on who logged in — it can't be a compile-time constant. The auth store is already the source of truth for authentication state.

**Alternative considered:** Passing scope as a parameter to `createSyncClient`. Rejected because the singleton sync client in `lib/sync.ts` can't receive parameters — it's created at module level.

### 3. Server resolveScope handles both ID types

**Decision:** Update `resolveScope` to check if the scope ID is a merchant ID or outlet ID. If it's a merchant ID, return it directly. If it's an outlet ID, resolve to merchant ID via the existing `getOutletMerchantId`.

**Rationale:** Minimal server change. The client sends the appropriate ID based on login type. The server doesn't need to know which login type — it just resolves whatever ID it receives.

**Alternative considered:** Two separate sync endpoints (one per scope type). Rejected — unnecessary complexity when one endpoint can handle both.

### 4. Sync clients are recreated on scope change

**Decision:** When the scope changes (login/logout), the sync client instances are recreated with the new scope value. The provider exposes a `setScope` method. The singleton in `lib/sync.ts` is updated via a setter.

**Rationale:** `createSyncClient` takes `scopeId` at creation time. Changing scope requires a new client instance. The old client is stopped (polling stopped, state cleaned up) before creating the new one.

**Alternative considered:** Mutating the scope on an existing client. Rejected — `createSyncClient` doesn't expose a scope setter, and internal state (cursors, outbox) is scoped to the original scope ID.

## Risks / Trade-offs

- **[Risk] Stale sync state on scope change** → Mitigation: Stop old client, clear local query cache, start new client. The outbox entries from the old scope remain but won't conflict (different scope).
- **[Risk] Race condition during login** → Mitigation: Sync starts only after auth store has a valid scope. Provider waits for scope to be set before creating client.
- **[Risk] Server resolveScope performance** → Mitigation: The outlet→merchant lookup is a single indexed query. For merchant IDs, it's a no-op (return directly).
- **[Trade-off] All merchant data synced to all devices** → Paired devices sync data they don't display (other outlets' orders). Acceptable because data volume is small for a single merchant and simplifies the architecture.
