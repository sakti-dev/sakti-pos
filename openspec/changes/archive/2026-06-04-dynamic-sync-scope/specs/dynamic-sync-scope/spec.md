## ADDED Requirements

### Requirement: Scope lifecycle
The sync scope SHALL change at exactly 4 points: app boot (load from localStorage or null), owner login (set to merchant ID), paired device login (set to outlet ID), and logout (clear to null). The scope SHALL be immutable between login and logout — no writes or sync operations SHALL occur during the transition.

#### Scenario: Scope persists across app restarts
- **WHEN** the app boots and a scope was previously set
- **THEN** the scope SHALL be loaded from localStorage

#### Scenario: Scope is null on first boot
- **WHEN** the app boots for the first time (no localStorage)
- **THEN** the scope SHALL be null and no sync SHALL run

#### Scenario: No scope changes during session
- **WHEN** a user is authenticated and performing operations
- **THEN** the scope value SHALL remain constant until logout

### Requirement: Dynamic scope assignment
The system SHALL assign a sync scope based on the authenticated user type. Owner login SHALL set scope to the merchant ID. Paired device login SHALL set scope to the outlet ID.

#### Scenario: Owner login sets merchant scope
- **WHEN** an owner authenticates via cloud OAuth
- **THEN** the sync scope SHALL be set to the authenticated user's merchant ID

#### Scenario: Paired device login sets outlet scope
- **WHEN** a paired device authenticates via local PIN
- **THEN** the sync scope SHALL be set to the device's assigned outlet ID

### Requirement: Server scope resolution for both ID types
The server `resolveScope` function SHALL accept both merchant IDs and outlet IDs as scope values. When a merchant ID is received, it SHALL return it directly. When an outlet ID is received, it SHALL resolve to the parent merchant ID.

#### Scenario: Merchant ID scope resolves directly
- **WHEN** the server receives a scope request with a valid merchant ID
- **THEN** `resolveScope` SHALL return the merchant ID as the resolved scope

#### Scenario: Outlet ID scope resolves to merchant
- **WHEN** the server receives a scope request with a valid outlet ID
- **THEN** `resolveScope` SHALL look up the outlet's merchant ID and return it as the resolved scope

#### Scenario: Invalid scope ID rejected
- **WHEN** the server receives a scope request with an ID that is neither a valid merchant nor outlet
- **THEN** `resolveScope` SHALL return an error with appropriate status code

### Requirement: Single sync client, provider-owned
A single sync client instance SHALL exist, created and managed by the provider. Db modules SHALL access it via `getSyncClient()` at write time. On scope change, the provider SHALL stop the old client, clear query cache, create a new client, and register it via `setSyncClient()`.

#### Scenario: Provider creates client after login
- **WHEN** the sync provider mounts and scope is set
- **THEN** it SHALL create a sync client with the current scope and register it

#### Scenario: Db module accesses client at write time
- **WHEN** a db module calls `getSyncClient()` during a write operation
- **THEN** it SHALL receive the currently active sync client instance

#### Scenario: Scope change recreates client
- **WHEN** the scope changes (login/logout)
- **THEN** the provider SHALL stop the old client, create a new one with the updated scope, and register it

### Requirement: Scope change triggers sync restart
When the scope value changes (login, logout, device reassignment), the system SHALL stop the current sync client, clear query cache, and start a new sync client with the updated scope.

#### Scenario: Login starts sync with correct scope
- **WHEN** user authenticates and scope is set
- **THEN** sync polling SHALL start with the new scope value

#### Scenario: Logout stops sync
- **WHEN** user logs out and scope is cleared
- **THEN** sync polling SHALL stop and local sync state SHALL be reset
