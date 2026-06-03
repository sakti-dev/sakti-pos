## ADDED Requirements

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

### Requirement: Sync client uses runtime scope
Sync clients SHALL read the scope value from the auth store at creation time, not from a compile-time constant. The scope value SHALL be available before sync polling starts.

#### Scenario: Sync client created with owner scope
- **WHEN** the sync provider initializes after owner login
- **THEN** the sync client SHALL be created with the merchant ID as scopeId

#### Scenario: Sync client created with device scope
- **WHEN** the sync provider initializes after paired device login
- **THEN** the sync client SHALL be created with the outlet ID as scopeId

### Requirement: Scope change triggers sync restart
When the scope value changes (login, logout, device reassignment), the system SHALL stop the current sync client, clear query cache, and start a new sync client with the updated scope.

#### Scenario: Login starts sync with correct scope
- **WHEN** user authenticates and scope is set
- **THEN** sync polling SHALL start with the new scope value

#### Scenario: Logout stops sync
- **WHEN** user logs out and scope is cleared
- **THEN** sync polling SHALL stop and local sync state SHALL be reset
