# Auth

## Purpose

Sakti POS uses a two-layer authentication system. Cloud authentication (email/password or Google OAuth) controls API access and merchant membership. Local PIN authentication controls daily POS session unlock and staff attribution. A durable mapping (`staff.cloud_user_id`) bridges cloud identity to POS staff, allowing returning cloud users to skip PIN setup on reinstall.

## Requirements

### R1: Cloud Email/Password Registration

The system SHALL allow new users to register with email, password, and name via the cloud API.

- Registration validates email format, password minimum 8 characters, and name 1-100 characters.
- The system SHALL hash the password with PBKDF2 (SHA-256, 100k iterations) before storing.
- Registration SHALL reject duplicate emails with HTTP 409.
- On success, the system SHALL create a Narvik session and return the session token and user object.

**WHEN** a user submits registration with a valid email, password, and name
**THEN** the system creates a `users` row, stores a session token via `AuthStorage.saveToken`, and returns the user object.

**WHEN** a user submits registration with an email that already exists
**THEN** the system returns HTTP 409 with `{ error: "Email already registered" }`.

### R2: Cloud Email/Password Login

The system SHALL authenticate existing users with email and password.

- Login verifies the PBKDF2 password hash against the stored hash.
- The system SHALL perform a dummy hash comparison when the user is not found to prevent timing attacks.
- On success, the system SHALL create a Narvik session and return the session token and user.

**WHEN** a user submits login with valid credentials
**THEN** the system creates a session, sets the session cookie, and returns `{ sessionToken, user }`.

**WHEN** a user submits login with an invalid email or password
**THEN** the system returns HTTP 401 with `{ error: "Invalid email or password" }`.

### R3: Google OAuth Authentication

The system SHALL support Google OAuth 2.0 with PKCE for user authentication.

- The system uses Arctic library with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from environment.
- OAuth state and code verifier are stored in httpOnly cookies (maxAge 600s, SameSite Lax).
- Scopes requested: `openid`, `profile`, `email`.
- On callback, the system extracts email and name from the Google ID token.

**WHEN** a user initiates Google OAuth login
**THEN** the system generates state and code verifier, stores them in cookies, and redirects to Google's authorization URL.

**WHEN** Google OAuth callback is received with valid code and matching state
**THEN** the system validates the authorization code, extracts email/name from ID token, finds or creates the user, creates a session, and returns an HTML success page.

**WHEN** Google OAuth callback receives invalid state or code
**THEN** the system returns HTTP 400 with an appropriate error message.

### R4: Cloud Session Management

The system SHALL manage cloud sessions using the Narvik library with database-backed session storage.

- Sessions are stored in the `user_sessions` table with userId and expiresAt.
- The system SHALL accept session tokens via Bearer token (Authorization header) or httpOnly cookie.
- The `authenticated` Elysia plugin SHALL validate sessions on protected routes, returning 401 if invalid.

**WHEN** a request includes a valid session token (Bearer or cookie)
**THEN** the system resolves the session and makes `session.userId` available to route handlers.

**WHEN** a request includes no or invalid session token
**THEN** the `authenticated` plugin returns HTTP 401 with `{ error: "Unauthorized" }`.

**WHEN** a user logs out
**THEN** the system invalidates the Narvik session, clears the session cookie, and clears the local token from `AuthStorage`.

### R5: Auth Token Storage

The system SHALL store cloud session tokens using Android-native encrypted storage (Keystore AES-GCM).

- Tokens are stored via Tauri invoke commands: `save_auth_token`, `get_auth_token`, `clear_auth_token`.
- An in-memory cache (`cachedToken`) avoids repeated native calls.
- Legacy `localStorage` tokens are migrated to native storage on first access and removed.
- Native storage failures are logged but do not crash the app; the system falls back gracefully.

**WHEN** a session token is saved
**THEN** the system caches it in memory and persists it via native `save_auth_token`.

**WHEN** a session token is requested and cache is empty
**THEN** the system checks for a legacy localStorage token, migrates it if found, otherwise loads from native storage.

**WHEN** a session token is cleared
**THEN** the system clears the cache, removes any localStorage entry, and invokes native `clear_auth_token`.

### R6: Cloud Merchant/Outlet Selection After Auth

The system SHALL guide the user through merchant and outlet selection after cloud authentication.

- After successful cloud auth, the system fetches the user's merchants via `POST /api/merchants/list`.
- If the user has merchants, the system shows a merchant picker, then an outlet picker.
- If the user has no merchants, the system redirects to onboarding.
- Merchant creation automatically assigns the cloud user as owner via `user_merchants` row.

**WHEN** a cloud user has one or more merchants
**THEN** the system displays the merchant picker with merchant names.

**WHEN** a cloud user selects a merchant with outlets
**THEN** the system displays the outlet picker with outlet names and addresses.

**WHEN** a cloud user selects a merchant with no outlets
**THEN** the system redirects to `/onboarding?merchantId=...`.

**WHEN** a cloud user has no merchants
**THEN** the system redirects to `/onboarding`.

### R7: Cloud-to-Staff Mapping (Staff Current)

The system SHALL resolve or claim a POS staff row for the authenticated cloud user via `POST /api/staff/current`.

- The system first checks for an existing staff row with matching `cloud_user_id` and `merchant_id`.
- If no mapped staff exists and the cloud user is an owner, the system attempts to claim exactly one unclaimed active owner staff row (where `cloud_user_id IS NULL`).
- If multiple unclaimed owner rows exist (`ambiguous-owner`), or the cloud user is not an owner (`not-allowed`), or no staff exist (`no-staff`), the system returns the appropriate reason.

**WHEN** the cloud user already has a mapped staff row for the merchant
**THEN** the system returns `{ claimed: false, hasStaff: true, staff: <staff> }`.

**WHEN** the cloud user is an owner with exactly one unclaimed owner staff row
**THEN** the system claims it by setting `cloud_user_id`, returns `{ claimed: true, hasStaff: true, staff: <staff> }`.

**WHEN** the cloud user is an owner with zero unclaimed owner staff rows
**THEN** the system returns `{ claimed: false, hasStaff: false, reason: "no-staff" }`.

**WHEN** the cloud user is an owner with multiple unclaimed owner staff rows
**THEN** the system returns `{ claimed: false, hasStaff: false, reason: "ambiguous-owner" }`.

**WHEN** the cloud user is not an owner
**THEN** the system returns `{ claimed: false, hasStaff: false, reason: "not-allowed" }`.

### R8: Local PIN Authentication

The system SHALL authenticate POS staff via 6-digit PIN verification against locally synced staff data.

- PINs are hashed with PBKDF2 (SHA-256, 100k iterations, 256-bit hash, 16-byte salt).
- The hash format is `<salt_hex>:<hash_hex>`.
- Staff must be active (`isActive: true`) and have a PIN set.
- On success, the system creates an in-memory session (SolidJS reactive store).

**WHEN** a staff member enters a valid PIN for an active staff row with a set PIN
**THEN** the system sets the user in the reactive store, persists the last user ID to localStorage, and returns the `AuthUser` object.

**WHEN** a staff member enters an invalid PIN
**THEN** the system throws `Error("Invalid PIN")`.

**WHEN** a staff member's PIN is not set
**THEN** the system throws `Error("PIN not set")`.

**WHEN** the staff row is deactivated
**THEN** the system throws `Error("Staff is deactivated")`.

**WHEN** the staff row does not exist
**THEN** the system throws `Error("Staff not found")`.

### R9: PIN Brute-Force Protection

The system SHALL lock the PIN input after 5 consecutive failed attempts for 30 seconds.

- The lockout is enforced client-side in the `LocalAuth` component.
- During lockout, the PIN pad is disabled and an error message is shown.
- After 30 seconds, the attempt counter resets and the PIN pad re-enables.

**WHEN** a user enters 5 consecutive incorrect PINs
**THEN** the system disables the PIN input and shows "Terlalu banyak percobaan. Coba lagi dalam 30 detik." for 30 seconds.

**WHEN** the lockout duration expires
**THEN** the system resets the attempt counter, clears the error, and re-enables the PIN input.

### R10: Cloud Staff Login (Skip PIN)

The system SHALL allow returning cloud users to log in without entering a PIN, using the cloud-to-staff mapping.

- After cloud auth and outlet selection, the system calls `POST /api/staff/current`.
- If a staff row is resolved or claimed, the system runs sync, then calls `loginWithCloudStaff(staffId)`.
- `loginWithCloudStaff` verifies the staff exists and is active, then sets the session without PIN verification.

**WHEN** the cloud user has a resolved or claimed staff row
**THEN** the system syncs data, sets the user session via `loginWithCloudStaff`, sets the scope, and navigates based on role (cashier → `/pos`, other → `/`).

**WHEN** `loginWithCloudStaff` cannot find the staff row locally (not yet synced)
**THEN** the system shows "Data pengguna belum tersinkron. Coba sinkronkan lagi."

**WHEN** the cloud user has reason `ambiguous-owner` or `not-allowed`
**THEN** the system navigates to `/login` for PIN-based auth.

### R11: Staff Role-Based Access Control

The system SHALL enforce role-based access control for POS routes and API endpoints.

- Staff roles: `cashier`, `manager`, `owner`.
- `user_merchants` role: `owner`, `manager`.
- POS routes: `/` (dashboard) and `/users` require `manager` or `owner`. `/pos` and `/orders` require any authenticated user.
- API staff routes verify `user_merchants` membership for the target merchant.

**WHEN** an unauthenticated user accesses a protected route
**THEN** the system redirects to `/login` (if device is paired) or `/cloud-login` (if not paired).

**WHEN** a user with insufficient role accesses a role-restricted route
**THEN** the system shows "Akses ditolak" (access denied).

**WHEN** a `cashier` logs in
**THEN** the system navigates directly to `/pos`.

**WHEN** a `manager` or `owner` logs in
**THEN** the system navigates to `/` (dashboard).

### R12: Device Pairing

The system SHALL allow POS devices to pair with an outlet using an 8-character alphanumeric pairing code.

- Pairing codes are uppercase alphanumeric (`[A-Z0-9]`).
- On successful pairing, the system stores outlet context (outletId, merchantId, registerId, timezone) in localStorage.
- The system navigates to `/login` after successful pairing.

**WHEN** a user enters a valid 8-character pairing code
**THEN** the system calls `POST /api/registers/pair`, stores the outlet context, and navigates to `/login`.

**WHEN** a user enters a code that does not exist
**THEN** the system shows "Kode tidak ditemukan" (HTTP 404).

**WHEN** a user enters an expired code
**THEN** the system shows "Kode sudah kadaluarsa" (HTTP 410).

**WHEN** a user enters a code for an already-paired device
**THEN** the system shows "Perangkat sudah dipasangkan" (HTTP 409).

### R13: Device Pairing Detection

The system SHALL detect whether a device is paired by checking for an outlet context in localStorage.

- `isDevicePaired()` returns `true` when `currentOutletId` is set.
- The `RequireAuth` guard uses this to determine the login route.

**WHEN** the device has no outlet context stored
**THEN** `isDevicePaired()` returns `false` and unauthenticated users are directed to `/cloud-login`.

**WHEN** the device has an outlet context stored
**THEN** `isDevicePaired()` returns `true` and unauthenticated users are directed to `/login` (PIN auth).

### R14: Onboarding Flow
The system SHALL guide new users through merchant creation, outlet creation, preferences, and owner PIN setup.

- Steps: `merchant` → `outlet` → `preferences` → `setup-pin`.
- If `merchantId` is in the query, the system skips to `outlet`, `preferences`, or `setup-pin` as appropriate.
- Merchant creation calls `POST /api/merchants/create` which also creates a `user_merchants` owner row.
- Outlet creation calls `POST /api/outlets/create` which also creates a register.
- Preferences step (tax toggle, tax percentage, initial cash, business type) collects user choices and stores them in local state. These are NOT persisted to the API until a future schema change.
- If an owner staff already exists for the merchant after outlet creation, the system skips PIN setup and navigates to `/login`.
- PIN setup requires two entries (confirm match), creates a staff row via `POST /api/staff/create` with role `owner`, claims the staff via `getCurrentCloudStaff`, runs sync, then logs in.

#### Scenario: New user completes full onboarding
- **WHEN** a user registers, has no merchants, and completes all 4 onboarding steps
- **THEN** the system creates a merchant, creates an outlet with register, stores preferences locally, prompts for PIN setup (two-entry confirmation), creates an owner staff row, claims it via cloud-to-staff mapping, syncs, and logs the user in.

#### Scenario: User with existing merchant skips to outlet
- **WHEN** a user arrives at `/onboarding?merchantId=<id>` with no outlet
- **THEN** the system skips to the outlet step (Step 2).

#### Scenario: User with existing merchant and outlet skips to preferences
- **WHEN** a user arrives at `/onboarding?merchantId=<id>&outletId=<id>`
- **THEN** the system skips to the preferences step (Step 3).

#### Scenario: Existing owner staff skips PIN setup
- **WHEN** outlet creation completes and an owner staff already exists for the merchant
- **THEN** the system navigates to `/login` without showing the PIN setup step.

#### Scenario: PIN mismatch during setup
- **WHEN** a user enters two PINs that do not match
- **THEN** the system shows "PIN tidak cocok" and resets the PIN entry.

#### Scenario: Preferences are stored locally
- **WHEN** a user completes Step 3 (preferences)
- **THEN** the tax toggle, tax percentage, initial cash, and business type are saved in local state and NOT sent to the API.

### R15: PIN Change

The system SHALL allow authenticated users to change their PIN via the cloud API.

- PIN change requires a valid cloud session token.
- The new PIN is validated as exactly 6 characters.
- The PIN is hashed with PBKDF2 and stored via `POST /api/staff/update-pin`.

**WHEN** an authenticated user submits a new 6-digit PIN
**THEN** the system hashes it, sends it to the API, and updates the staff row.

**WHEN** an unauthenticated user attempts to change PIN
**THEN** the system throws "Not authenticated".

### R16: API Staff Management

The system SHALL provide authenticated CRUD operations for staff records.

- All staff routes require a valid cloud session (`authenticated` plugin).
- Staff create, list, update-pin, and delete routes verify `user_merchants` membership for the target merchant.
- Staff create validates: merchantId (required), name (1-100 chars), pin (exactly 6 chars), role (cashier/manager/owner, defaults to cashier).
- Staff delete sets `isActive: false` and `deletedAt` (soft delete).
- Staff list returns all staff rows for the merchant.

**WHEN** an authenticated user with merchant membership creates a staff member
**THEN** the system hashes the PIN, inserts the staff row, and returns the created staff.

**WHEN** an authenticated user without merchant membership attempts a staff operation
**THEN** the system returns HTTP 403 Forbidden.

**WHEN** a staff member is deleted
**THEN** the system soft-deletes them (sets `isActive: false` and `deletedAt`).
