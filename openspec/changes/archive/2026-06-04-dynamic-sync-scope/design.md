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
- Single sync client instance, owned by provider, exposed via module-level getter

**Non-Goals:**
- Changing scopeColumn per table (the existing partition columns are correct)
- Per-outlet data filtering in sync (server always returns merchant-level data; UI filters locally)
- Multi-merchant support for a single device (one device = one merchant)
- Changing the baresync library itself

## Scope Lifecycle

Scope changes at exactly 4 points:

1. **App boot** → `scopeId()` loads from localStorage (or null if first time)
2. **Owner login** → `setScope(merchantId)` after outlet selection + sync
3. **Paired device login** → `setScope(outletId)` after PIN verification
4. **Logout** → `clearScope()`

**Scope is immutable during a session.** Between login and logout, scope never changes. No writes happen during the transition (login flow does sync before setting scope, logout stops everything).

## Decisions

### 1. Scope value is always resolvable to a merchant ID

**Decision:** The server always resolves the scope to a merchant ID. Whether the client sends a merchant ID or an outlet ID, the server returns all data for that merchant.

**Rationale:** Shared data (products, categories, staff, assets) is merchant-scoped. Even a paired device needs this data to function. The only outlet-specific data is orders, orderItems, and registers — and the UI handles filtering these by outlet.

**Alternative considered:** Outlet-level sync where server only returns outlet-specific data. Rejected because paired devices still need products, categories, etc.

### 2. Single client, provider-owned, exposed via getter

**Decision:** Delete `sync-constants.ts`. The provider creates the sync client, registers it via `setSyncClient()` in a module-level setter (`lib/sync.ts`). Db modules call `getSyncClient()` at write time. On scope change, provider recreates the client and updates the setter.

**Rationale:** `createSyncClient` takes `scopeId` at creation time with no setter. Two clients (one in provider, one in `lib/sync.ts`) would risk stale closures — a db module could write to the wrong scope's outbox if scope changes between client creation and write execution. Single client eliminates this data corruption risk.

**Alternative considered:** Two separate clients (provider + `lib/sync.ts`), both reading `scopeId()` lazily. Rejected — stale closure risk: if scope changes, the `lib/sync.ts` client retains the old scope and sends writes to the wrong outbox.

### 3. Server resolveScope handles both ID types

**Decision:** Update `resolveScope` to check if the scope ID is a merchant ID or outlet ID. If it's a merchant ID, return it directly. If it's an outlet ID, resolve to merchant ID via the existing `getOutletMerchantId`.

**Rationale:** Minimal server change. The client sends the appropriate ID based on login type. The server doesn't need to know which login type — it just resolves whatever ID it receives.

**Alternative considered:** Two separate sync endpoints (one per scope type). Rejected — unnecessary complexity when one endpoint can handle both.

### 4. Sync client is recreated on scope change

**Decision:** When the scope changes (login/logout), the provider stops the old client, clears query cache, creates a new client with the updated scope, and registers it via `setSyncClient()`. Db modules always call `getSyncClient()` at write time, so they get the current client.

**Rationale:** `createSyncClient` takes `scopeId` at creation time. Changing scope requires a new client instance. The old client is stopped (polling stopped, state cleaned up) before creating the new one. Since scope is immutable during a session, this recreation happens at most once per session (on login).

**Alternative considered:** Mutating the scope on an existing client. Rejected — `createSyncClient` doesn't expose a scope setter, and internal state (cursors, outbox) is scoped to the original scope ID.

## Risks / Trade-offs

- **[Risk] Stale sync state on scope change** → Mitigation: Stop old client, clear local query cache, start new client. Single-client architecture ensures db modules always use the current client. Outbox entries from old scope don't conflict (different scope).
- **[Risk] Race condition during login** → Mitigation: Scope is immutable during session. Sync starts only after auth store has a valid scope. Provider waits for scope to be set before creating client.
- **[Risk] Server resolveScope performance** → Mitigation: The outlet→merchant lookup is a single indexed query. For merchant IDs, it's a no-op (return directly).
- **[Trade-off] All merchant data synced to all devices** → Paired devices sync data they don't display (other outlets' orders). Acceptable because data volume is small for a single merchant and simplifies the architecture.
