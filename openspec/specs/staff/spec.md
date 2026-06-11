# Staff

## Purpose

Staff management controls the people who can use the POS system. Each staff member has a name, a role (owner, manager, or cashier), and a 6-digit PIN for local authentication. Staff are scoped to a merchant and synced between the cloud API and the local POS SQLite database via baresync. The owner role grants full access; managers and cashiers have progressively limited capabilities. Staff records also support a cloud-user mapping (`cloudUserId`) that links a cloud-authenticated account to a POS staff row, enabling seamless login across device reinstalls.

## Requirements

### R1: Staff Data Model

The system SHALL maintain a `staff` table with the following columns:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | TEXT | no | UUIDv7 primary key |
| merchantId | TEXT | no | FK → merchants.id |
| cloudUserId | TEXT | yes | FK → users.id (links cloud account to POS staff) |
| outletId | TEXT | yes | FK → outlets.id (optional outlet assignment) |
| name | TEXT | no | Display name (1–100 characters) |
| pin | TEXT | yes | PBKDF2 hash of the 6-digit PIN (`salt:hash` hex format) |
| role | TEXT | no | One of `cashier`, `manager`, `owner` |
| isActive | INTEGER | no | Boolean, defaults to `true` |
| createdAt | TEXT | no | ISO 8601 timestamp |
| updatedAt | TEXT | no | ISO 8601 timestamp |
| deletedAt | TEXT | yes | ISO 8601 timestamp (soft-delete marker) |
| isSynced | INTEGER | no | Sync tracking column |

**WHEN** a staff row is created
**THEN** `createdAt` and `updatedAt` SHALL be set to the current ISO 8601 timestamp, and `isSynced` SHALL be `false`.

### R2: Staff Creation

The system SHALL allow creating a new staff member via `POST /api/staff/create`.

**WHEN** a request contains `merchantId`, `name`, `pin`, and optionally `role` and `outletId`
**THEN** the system SHALL:
1. Verify the requesting user has access to the merchant (via `userMerchants`).
2. Validate `name` is 1–100 characters and non-empty.
3. Validate `pin` is exactly 6 digits.
4. Hash the PIN using PBKDF2 (100,000 iterations, SHA-256, 16-byte random salt).
5. Default `role` to `cashier` if not provided.
6. Insert the staff row and return the encoded staff object.

**WHEN** the requesting user does not have merchant access
**THEN** the system SHALL return a 403 Forbidden error.

**WHEN** `pin` is not exactly 6 characters or `name` is empty or exceeds 100 characters
**THEN** the system SHALL return a 400 Bad Request error with a descriptive message.

### R3: Staff Listing

The system SHALL list staff members for a merchant via `POST /api/staff/list`.

**WHEN** a request contains `merchantId`
**THEN** the system SHALL verify the requesting user has access to the merchant and return all staff rows for that merchant (including inactive staff).

**WHEN** the local POS app calls `getStaff()`
**THEN** the system SHALL query the local SQLite database filtered by the current merchant and ordered by `name` then `id`.

### R4: Staff Update (Name and Role)

The system SHALL allow updating a staff member's `name` and `role` via local database operations.

**WHEN** a staff member's name or role is updated via `updateStaffMember()`
**THEN** the system SHALL:
1. Set `updatedAt` to the current ISO 8601 timestamp.
2. Set `isSynced` to `false`.
3. Enqueue a sync change with operation `update`.

### R5: Self-Protection Rules

The system SHALL enforce the following self-protection rules in the POS app:

**WHEN** a user attempts to deactivate themselves
**THEN** the system SHALL display the error "Tidak bisa menonaktifkan diri sendiri" and reject the change.

**WHEN** a user with role `owner` attempts to change their own role to something other than `owner`
**THEN** the system SHALL display the error "Owner tidak bisa mengubah peran sendiri" and reject the change.

### R6: Last-Owner Protection

The system SHALL prevent deactivation or deletion of the last active owner.

**WHEN** a staff member with role `owner` is being deactivated or deleted
**THEN** the system SHALL verify at least one other active owner exists for the merchant.

**WHEN** only one active owner remains
**THEN** the system SHALL prevent the deactivation/deletion.

The local function `countActiveManagers()` counts active staff with role `manager` or `owner` for the current merchant.

### R7: PIN Management

#### R7a: PIN Hashing

The system SHALL hash PINs using PBKDF2 with the following parameters:
- Iterations: 100,000
- Hash algorithm: SHA-256
- Hash length: 256 bits
- Salt: 16 random bytes

The stored format SHALL be `{saltHex}:{hashHex}` where both are lowercase hex-encoded.

#### R7b: PIN Verification

The system SHALL verify PINs by:
1. Splitting the stored hash on `:` to extract salt and hash.
2. Deriving a key from the input PIN using the same PBKDF2 parameters.
3. Comparing the computed hash to the stored hash.

#### R7c: PIN Update

The system SHALL allow resetting a staff member's PIN via `POST /api/staff/update-pin`.

**WHEN** a request contains `id` (staff ID) and `pin` (new 6-digit PIN)
**THEN** the system SHALL:
1. Verify the staff member exists.
2. Verify the requesting user has access to the staff member's merchant.
3. Hash the new PIN.
4. Update the staff row and return the encoded staff object.

**WHEN** the staff member does not exist
**THEN** the system SHALL return a 404 Not Found error.

#### R7d: PIN Form Validation

The POS app SHALL enforce the following PIN validation rules:
- PIN must be exactly 6 digits (minimum length 6).
- PIN confirmation must match PIN.
- Error messages: "PIN wajib diisi", "PIN minimal 6 digit", "PIN tidak cocok".

### R8: Staff Deletion (Soft Delete)

The system SHALL soft-delete staff via `POST /api/staff/delete`.

**WHEN** a request contains `id` (staff ID)
**THEN** the system SHALL:
1. Verify the staff member exists.
2. Verify the requesting user has access to the staff member's merchant.
3. Set `isActive` to `false` and `deletedAt` to the current timestamp.
4. Return `{ success: true }`.

**WHEN** the staff member does not exist
**THEN** the system SHALL return a 404 Not Found error.

Soft-deleted staff SHALL NOT appear on the POS login screen.

### R9: Staff Claim Flow (Cloud → POS Linking)

The system SHALL map cloud-authenticated users to POS staff rows via `POST /api/staff/current`.

**WHEN** a cloud user calls `/api/staff/current` with a `merchantId`
**THEN** the system SHALL:
1. Verify the cloud user has a merchant membership (via `userMerchants`).
2. Search for an existing active staff row where `cloudUserId` matches the requesting user.
3. If found, return the staff row (no claim needed).
4. If not found and the membership role is `owner`, attempt auto-claim.

#### R9a: Owner Auto-Claim

**WHEN** the cloud user is an owner with no existing staff mapping
**THEN** the system SHALL:
1. Search for active owner staff rows with `cloudUserId IS NULL` for the merchant.
2. If exactly one unclaimed owner row exists, set its `cloudUserId` to the cloud user's ID and return it with `claimed: true`.
3. If zero unclaimed owner rows exist, return `reason: "no-staff"`.
4. If more than one unclaimed owner row exists, return `reason: "ambiguous-owner"`.

**WHEN** the cloud user is not an owner
**THEN** the system SHALL return `reason: "not-allowed"` and `hasStaff: false`.

### R10: Role-Based Access Control

The system SHALL enforce the following access control rules:

| Action | Required Role |
|--------|---------------|
| Create staff | Any merchant member (owner/manager) |
| List staff | Any merchant member |
| Update staff name/role | Local operation (no API check) |
| Reset PIN | Any merchant member |
| Delete/deactivate staff | Any merchant member |
| Claim owner staff | Cloud user with `owner` membership |
| Manage users UI | Owner only (route guard) |

**WHEN** a non-member user attempts any staff API operation
**THEN** the system SHALL return a 403 Forbidden error.

### R11: Staff Roles

The system SHALL recognize three roles with the following hierarchy:

| Role | Capabilities |
|------|--------------|
| `owner` | Full access: menu management, user management, reports, settings |
| `manager` | Limited access: cannot manage users |
| `cashier` | POS operations only: process orders, view products |

**WHEN** an invalid role value is provided to the API
**THEN** the system SHALL return a 400 Bad Request error with message "role is invalid".

### R12: PIN-Based Local Login

The system SHALL support local PIN-based login on the POS device.

**WHEN** a user selects a staff member from the login screen and enters a PIN
**THEN** the system SHALL:
1. Look up the staff row by ID from the local SQLite database.
2. Verify the staff is active (`isActive: true`).
3. Verify the PIN hash matches using PBKDF2 verification.
4. On success: set the user session in memory, store last user ID in localStorage, and return the `AuthUser` object (`id`, `name`, `role`).
5. On failure: throw "Invalid PIN".

**WHEN** the staff row has no PIN set (`pin` is null)
**THEN** the system SHALL throw "PIN not set".

**WHEN** the staff is deactivated
**THEN** the system SHALL throw "Staff is deactivated".

### R13: Cloud Staff Login (Bypass PIN)

The system SHALL support logging in via cloud staff mapping without PIN verification.

**WHEN** `loginWithCloudStaff(staffId)` is called
**THEN** the system SHALL:
1. Look up the staff row by ID from the local SQLite database.
2. Verify the staff is active.
3. Set the user session directly (no PIN check).
4. Return the `AuthUser` object.

**WHEN** the staff is not found
**THEN** the system SHALL throw "Staff not found".

**WHEN** the staff is deactivated
**THEN** the system SHALL throw "Staff is deactivated".

### R14: Active/Inactive Status

The system SHALL track an `isActive` boolean on each staff member.

**WHEN** a staff member is inactive
**THEN**:
- The staff SHALL NOT appear on the POS login screen.
- The staff SHALL NOT be able to log in via PIN.
- The staff SHALL still appear in the admin staff list (shown as "Nonaktif").

**WHEN** a staff member is deactivated via the edit form
**THEN** the system SHALL show a confirmation drawer with the message "Pengguna yang dinonaktifkan tidak bisa masuk ke aplikasi."

### R15: Sync Integration

Staff changes SHALL be synchronized between the local POS database and the cloud API via baresync.

**WHEN** a staff member is created, updated, or deleted locally
**THEN** the system SHALL enqueue a sync change in the outbox with the appropriate operation (`insert`, `update`, or `delete`).

**WHEN** staff data is received from the cloud via sync pull
**THEN** the system SHALL upsert the staff row in the local SQLite database.

The staff table is scoped to `merchantId` for sync purposes.
